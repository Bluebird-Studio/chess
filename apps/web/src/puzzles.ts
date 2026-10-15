import { Chess, type Square } from 'chess.js';

// Original teaching positions, composed for this app.
export const puzzles = [
  { id: 'queen-king', title: 'The queen and her king', fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', solution: 'g6g7', hint: 'Bring the queen beside the king. Your king protects her.', explanation: 'Qg7# closes every escape square. The white king protects g7, so the queen cannot be captured.' },
  { id: 'black-queen-king', title: 'The queen finishes the net', fen: '8/8/8/8/8/5kq1/8/7K b - - 0 1', solution: 'g3g2', hint: 'Move the queen beside the white king, protected by your own king.', explanation: 'Qg2# covers every escape. The black king protects g2, so White cannot capture the queen.' },
  { id: 'black-back-rank', title: 'A back rank for Black', fen: 'r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1', solution: 'a8a1', hint: 'White’s pawns seal the king in. Use your rook on the first rank.', explanation: 'Ra1# controls the first rank. White’s own pawns close the king’s escape squares.' },
  { id: 'back-rank', title: 'A sealed back rank', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', solution: 'a1a8', hint: 'The black pawns block their own king. Find a check on the eighth rank.', explanation: 'Ra8# attacks the entire back rank. Black’s own pawns prevent the king from escaping.' },
  { id: 'ladder-mate', title: 'Two rooks, one ladder', fen: '7k/R7/8/8/8/8/8/1R4K1 w - - 0 1', solution: 'b1b8', hint: 'One rook already guards the seventh rank. Send the other to the eighth.', explanation: 'Rb8# completes the ladder. The rook on a7 cuts off the seventh rank while the rook on b8 checks along the eighth.' },
  { id: 'smothered-mate', title: 'A knight slips through', fen: '6rk/6pp/8/4N3/8/8/8/K7 w - - 0 1', solution: 'e5f7', hint: 'The black king is surrounded by its own pieces. A knight can jump over the walls.', explanation: 'Nf7# is smothered mate. The knight attacks h8, Black’s own pieces occupy every escape, and a knight check cannot be blocked.' },
];

export function tryPuzzleMove(fen: string, from: Square, to: Square): { fen: string; solved: boolean } | null {
  const game = new Chess(fen);
  try { game.move({ from, to, promotion: 'q' }); }
  catch { return null; }
  return { fen: game.fen(), solved: game.isCheckmate() };
}

export function puzzleSolution(puzzle: typeof puzzles[number]): { fen: string; san: string; from: Square; to: Square } {
  const game = new Chess(puzzle.fen);
  const move = game.move(puzzle.solution);
  if (!game.isCheckmate()) throw new Error('Exercise solution must be checkmate.');
  return { fen: game.fen(), san: move.san, from: move.from, to: move.to };
}
