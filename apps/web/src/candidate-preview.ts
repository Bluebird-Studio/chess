import { Chess } from 'chess.js';

/** Preserve game history while exploring a bounded prefix of a suggested line. */
export function candidatePreview(pgn: string, line: readonly string[], count: number): Chess {
  if (!Number.isInteger(count) || count < 0 || count > line.length) {
    throw new Error('Choose a move within the candidate line.');
  }
  const game = new Chess();
  game.loadPgn(pgn);
  for (const move of line.slice(0, count)) game.move(move);
  return game;
}
