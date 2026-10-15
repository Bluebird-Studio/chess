import type { Color, PieceSymbol } from 'chess.js';

const order: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];
const names: Record<PieceSymbol, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

// Use actual captures rather than missing starting pieces: promotions and custom
// positions must not create phantom captures, and undo simply shortens history.
export function capturedPieces(history: readonly { color: Color; captured?: PieceSymbol }[], by: Color): PieceSymbol[] {
  return history.filter(move => move.color === by && move.captured).map(move => move.captured!)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function captureDescription(pieces: readonly PieceSymbol[], by: Color): string {
  const player = by === 'w' ? 'White' : 'Black';
  if (!pieces.length) return `${player} has not captured any pieces.`;
  const counts = order.flatMap(piece => {
    const count = pieces.filter(value => value === piece).length;
    return count ? [`${count} ${names[piece]}${count === 1 ? '' : 's'}`] : [];
  });
  return `${player} captured ${counts.join(', ')}.`;
}
