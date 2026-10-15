import { Chess, type PieceSymbol } from 'chess.js';

const values: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Count the pieces actually on the board, including promotions and imported positions. */
export function materialBalance(game: Chess) {
  let white = 0;
  let black = 0;
  for (const rank of game.board()) {
    for (const piece of rank) {
      if (!piece) continue;
      if (piece.color === 'w') white += values[piece.type];
      else black += values[piece.type];
    }
  }
  const difference = white - black;
  return {
    white, black, difference,
    whitePercent: white + black === 0 ? 50 : white / (white + black) * 100,
    label: difference === 0 ? 'Equal material' : `${difference > 0 ? 'White' : 'Black'} has ${Math.abs(difference)} extra ${Math.abs(difference) === 1 ? 'point' : 'points'} of material`,
  };
}
