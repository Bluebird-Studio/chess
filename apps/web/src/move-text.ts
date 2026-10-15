import { Chess, type Move } from 'chess.js';

/** Resolve only legal moves without changing the live game or guessing a promotion. */
export function resolveMoveText(game: Chess, text: string): Move {
  const input = text.trim();
  if (!input) throw new Error('Enter a move, such as Nf3 or e2e4.');
  const moves = game.moves({ verbose: true });
  const coordinate = /^([a-h][1-8])\s*[-–]?\s*([a-h][1-8])(?:\s*=?\s*([qrbn]))?$/i.exec(input);
  if (coordinate) {
    const [, from, to, promotion] = coordinate.map(value => value?.toLowerCase());
    const candidates = moves.filter(move => move.from === from && move.to === to && (!promotion || move.promotion === promotion));
    if (candidates.length > 1) throw new Error('Choose a promotion piece: q, r, b or n (for example e7e8n).');
    if (candidates.length === 1) return candidates[0];
  } else {
    const normalized = input.replace(/0/g, 'O').replace(/[+#]$/, '');
    const move = moves.find(move => move.san.replace(/[+#]$/, '') === normalized);
    if (move) return move;
  }
  throw new Error('That move is not legal here. Use notation such as Nf3, O-O or e2e4.');
}
