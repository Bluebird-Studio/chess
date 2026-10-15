import { Chess, type Move } from 'chess.js';

/** Independent algorithms sharing only chess.js move legality. */
export type BotLevel = 'random' | 'greedy' | 'positional' | 'minimax' | 'alphabeta';
export interface SearchLimits { maxTimeMs?: number; maxNodes?: number }
const PIECE: Record<string, number> = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
const MATE = 100_000;
const ABORT = Symbol('search-budget-exhausted');

function staticScore(game: Chess): number {
  let score = 0;
  for (const row of game.board()) for (const p of row) {
    if (!p) continue;
    const file = p.square.charCodeAt(0) - 97;
    const rank = Number(p.square[1]) - 1;
    const centrality = (3.5 - Math.abs(file - 3.5)) + (3.5 - Math.abs(rank - 3.5));
    const advancement = p.color === 'w' ? rank : 7 - rank;
    const bonus = p.type === 'p' ? advancement * 5 + centrality * 2 :
      p.type === 'n' || p.type === 'b' ? centrality * 8 :
      p.type === 'q' ? centrality * 2 : 0;
    score += (p.color === 'w' ? 1 : -1) * (PIECE[p.type] + bonus);
  }
  return score;
}

function terminalScore(game: Chess, ply: number): number | null {
  if (game.isCheckmate()) return game.turn() === 'w' ? -MATE + ply : MATE - ply;
  if (game.isDraw()) return 0;
  return null;
}

function movePriority(move: Move): number {
  return (move.captured ? 10 * PIECE[move.captured] - PIECE[move.piece] : 0) +
    (move.promotion ? PIECE[move.promotion] : 0);
}
function ordered(game: Chess): Move[] {
  return game.moves({ verbose: true }).sort((a, b) => movePriority(b) - movePriority(a));
}

function plainMinimax(game: Chess, depth: number, ply: number, ctx: SearchContext): number {
  if (++ctx.nodes > ctx.maxNodes || performance.now() >= ctx.deadline) throw ABORT;
  const terminal = terminalScore(game, ply);
  if (terminal !== null) return terminal;
  if (depth === 0) return staticScore(game);
  let best = game.turn() === 'w' ? -Infinity : Infinity;
  for (const move of ordered(game)) {
    game.move(move);
    try {
      const score = plainMinimax(game, depth - 1, ply + 1, ctx);
      best = game.turn() === 'b' ? Math.max(best, score) : Math.min(best, score);
    } finally { game.undo(); }
  }
  return best;
}

interface SearchContext {
  nodes: number;
  maxNodes: number;
  // Monotonic milliseconds, shared by root search and quiescence.
  deadline: number;
  table: Map<string, { depth: number; score: number }>;
}
// Resolve short forcing exchanges before evaluating material. Checks require a
// legal evasion rather than a stand-pat score; the shared budget bounds all work.
function quiescence(game: Chess, alpha: number, beta: number, ply: number, remaining: number, ctx: SearchContext): number {
  if (++ctx.nodes > ctx.maxNodes || performance.now() >= ctx.deadline) throw ABORT;
  const terminal = terminalScore(game, ply);
  if (terminal !== null) return terminal;
  const maximizing = game.turn() === 'w';
  const checked = game.isCheck();
  if (remaining === 0) return staticScore(game);
  let best = checked ? (maximizing ? -Infinity : Infinity) : staticScore(game);
  if (!checked) {
    if (maximizing) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
    if (beta <= alpha) return best;
  }
  for (const move of ordered(game)) {
    if (!checked && !move.captured && !move.promotion) continue;
    game.move(move);
    let score: number;
    try { score = quiescence(game, alpha, beta, ply + 1, remaining - 1, ctx); }
    finally { game.undo(); }
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
    if (maximizing) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function alphaBeta(game: Chess, depth: number, alpha: number, beta: number, ply: number, ctx: SearchContext): number {
  if (++ctx.nodes > ctx.maxNodes || performance.now() >= ctx.deadline) throw ABORT;
  const terminal = terminalScore(game, ply);
  if (terminal !== null) return terminal;
  if (depth === 0) return quiescence(game, alpha, beta, ply, 6, ctx);
  const key = game.fen();
  const cached = ctx.table.get(key);
  if (cached && cached.depth >= depth) return cached.score;
  const maximizing = game.turn() === 'w';
  let best = maximizing ? -Infinity : Infinity;
  const originalAlpha = alpha, originalBeta = beta;
  for (const move of ordered(game)) {
    game.move(move);
    let score: number;
    try { score = alphaBeta(game, depth - 1, alpha, beta, ply + 1, ctx); }
    finally { game.undo(); }
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
    if (maximizing) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  // Only cache exact scores; a cut-off yields a bound, not an exact value.
  if (best > originalAlpha && best < originalBeta) ctx.table.set(key, { depth, score: best });
  return best;
}

/**
 * Selects a legal move without mutating the caller's position.
 * Minimax and alpha-beta respect search budgets. Alpha-beta is iterative;
 * a partially searched depth is discarded.
 */
export function selectBotMove(game: Chess, level: BotLevel, limits: SearchLimits = {}): Move | null {
  // Drawn positions may still have legal moves, but Play must stop at the result.
  if (game.isGameOver()) return null;
  const moves = ordered(game);
  if (!moves.length) return null;
  if (level === 'random') return moves[Math.floor(Math.random() * moves.length)];
  // Legal SAN already identifies mate, including promotion mates. Resolve a
  // finished game before material scoring or a search budget can hide the win.
  const mate = moves.find(move => move.san.endsWith('#'));
  if (mate) return mate;
  if (level === 'greedy') {
    // Keep capture ordering, but do not throw away a material advantage with
    // an immediate draw when a continuing move exists (including clock-rule
    // draws where a pawn move or capture resets the halfmove counter).
    const advantage = staticScore(game) * (game.turn() === 'w' ? 1 : -1);
    if (advantage === 0) return moves[0];
    for (const move of moves) {
      game.move(move);
      let drawn: boolean;
      try { drawn = game.isDraw(); }
      finally { game.undo(); }
      // When behind, salvage an immediate draw before taking material that
      // resets the fifty-move counter or gives up a repetition opportunity.
      if (advantage > 0 ? !drawn : drawn) return move;
    }
    return moves[0];
  }
  if (level === 'positional') {
    const maximizing = game.turn() === 'w';
    let best = moves[0], bestScore = maximizing ? -Infinity : Infinity;
    for (const move of moves) {
      game.move(move);
      let score: number;
      try { score = terminalScore(game, 1) ?? staticScore(game); }
      finally { game.undo(); }
      if (maximizing ? score > bestScore : score < bestScore) { best = move; bestScore = score; }
    }
    return best;
  }
  const ctx: SearchContext = {
    nodes: 0,
    // Invalid limits must not disable both abort checks (comparisons with NaN
    // are always false, while Infinity would allow unbounded search).
    maxNodes: Number.isFinite(limits.maxNodes) ? Math.max(100, limits.maxNodes!) : 8000,
    deadline: performance.now() + (Number.isFinite(limits.maxTimeMs) ? Math.max(50, limits.maxTimeMs!) : 650),
    table: new Map()
  };
  if (level === 'minimax') {
    const maximizing = game.turn() === 'w';
    let best = moves[0], bestScore = maximizing ? -Infinity : Infinity;
    try {
      for (const move of moves) {
        if (performance.now() >= ctx.deadline) throw ABORT;
        game.move(move);
        let score: number;
        try { score = plainMinimax(game, 1, 1, ctx); }
        finally { game.undo(); }
        // Only compare fully evaluated root moves. An interrupted branch must
        // not replace the legal fallback or the best completed candidate.
        if (maximizing ? score > bestScore : score < bestScore) { best = move; bestScore = score; }
      }
    } catch (error) {
      if (error !== ABORT) throw error;
    }
    return best;
  }
  const maximizing = game.turn() === 'w';
  let best = moves[0];
  for (let depth = 1; depth <= 5; depth++) {
    let candidate = best, scoreBest = maximizing ? -Infinity : Infinity;
    try {
      for (const move of moves) {
        if (performance.now() >= ctx.deadline) throw ABORT;
        game.move(move);
        let score: number;
        try { score = alphaBeta(game, depth - 1, -Infinity, Infinity, 1, ctx); }
        finally { game.undo(); }
        if (maximizing ? score > scoreBest : score < scoreBest) {
          scoreBest = score; candidate = move;
        }
      }
      best = candidate; // publish only fully completed search depths
      if (Math.abs(scoreBest) > MATE - 100) break;
    } catch (error) {
      if (error !== ABORT) throw error;
      break;
    }
  }
  return best;
}
