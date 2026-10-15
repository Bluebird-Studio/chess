import { Chess } from 'chess.js';

export function readReplay(source: string): { positions: string[]; moves: string[]; pgn: string } {
  const game = new Chess();
  const text = source.trim();
  if (!text) throw new Error('Paste a PGN game or FEN position first.');
  try {
    if (text.split(/\s+/).length === 6 && text.includes('/')) game.load(text);
    else game.loadPgn(text);
  } catch { throw new Error('This game could not be read. Check your PGN or all six FEN fields.'); }
  const moves = game.history({ verbose: true });
  return { positions: [moves[0]?.before ?? game.fen(), ...moves.map(move => move.after)], moves: moves.map(move => move.san), pgn: game.pgn() };
}
