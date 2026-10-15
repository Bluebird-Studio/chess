import { Chess, type Square } from 'chess.js';

/** Bound file reads before parsing; accept PGN/FEN regardless of platform MIME type. */
export async function readReplayFile(file: Pick<File, 'size' | 'text'>): Promise<ReturnType<typeof readReplay>> {
  if (file.size > 1024 * 1024) throw new Error('Choose a PGN or FEN file smaller than 1 MB.');
  let source: string;
  try { source = await file.text(); }
  catch { throw new Error('This file could not be opened. Try selecting it again or paste its contents below.'); }
  return readReplay(source.replace(/^\uFEFF/, ''));
}

export function readReplay(source: string): { positions: string[]; moves: string[]; details: { from: Square; to: Square; label: string }[]; pgn: string } {
  const game = new Chess();
  const text = source.trim();
  if (!text) throw new Error('Paste a PGN game or FEN position first.');
  try {
    if (text.split(/\s+/).length === 6 && text.includes('/')) game.load(text);
    else game.loadPgn(text);
  } catch { throw new Error('This game could not be read. Check your PGN or all six FEN fields.'); }
  const moves = game.history({ verbose: true });
  return { positions: [moves[0]?.before ?? game.fen(), ...moves.map(move => move.after)], moves: moves.map(move => move.san), details: moves.map(move => ({ from: move.from, to: move.to, label: `${move.before.split(' ')[5]}${move.color === 'w' ? '.' : '…'} ${move.san}` })), pgn: game.pgn() };
}

/** Resolve replay keys without allowing navigation outside the imported game. */
export function replayShortcut(key: string, ply: number, length: number): number | null {
  switch (key) {
    case 'ArrowLeft': return Math.max(0, ply - 1);
    case 'ArrowRight': return Math.min(length, ply + 1);
    case 'Home': return 0;
    case 'End': return length;
    default: return null;
  }
}

/** Describe the actual replay position, including rule-based endings. */
export function replayStatus(game: Chess): string {
  if (game.isCheckmate()) return `Checkmate · ${game.turn() === 'w' ? 'Black' : 'White'} wins`;
  if (game.isStalemate()) return 'Draw · Stalemate';
  if (game.isInsufficientMaterial()) return 'Draw · Insufficient material';
  if (game.isThreefoldRepetition()) return 'Draw · Threefold repetition';
  if (game.isDrawByFiftyMoves()) return 'Draw · Fifty-move rule';
  return `${game.turn() === 'w' ? 'White' : 'Black'} to move${game.isCheck() ? ' · Check' : ''}`;
}
