import { Chess } from 'chess.js';

// Replaying the authoritative moves preserves repetition, highlights and notation.
// A FEN-only snapshot remains supported for initial seat assignment.
export function restoreOnlineGame(fen: string, history?: string[]): Chess {
  if (!history) return new Chess(fen);
  const game = new Chess();
  for (const move of history) game.move(move);
  if (game.fen() !== fen) throw new Error('Game history does not match the server position');
  return game;
}
