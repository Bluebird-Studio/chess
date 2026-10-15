import { type Chess } from 'chess.js';

/** A bare king can never mate, even with cooperation from the flagging side. */
export function timeoutResult(game: Chess): 'white' | 'black' | 'draw' {
  const winner = game.turn() === 'w' ? 'b' : 'w';
  const hasMatingPiece = game.board().some(row =>
    row.some(piece => piece?.color === winner && piece.type !== 'k'));
  // Keep chess.js's dead-position detection too. Do not equate a lone minor
  // piece with a bare king: opposing material can make a cooperative mate possible.
  if (!hasMatingPiece || game.isInsufficientMaterial()) return 'draw';
  return winner === 'w' ? 'white' : 'black';
}
