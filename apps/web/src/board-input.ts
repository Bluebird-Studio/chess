import type { Square } from 'chess.js';

/** Resolve viewport coordinates against the board's inner playing surface. */
export function squareAtPoint(x: number, y: number, rect: { left: number; top: number; width: number; height: number }, flipped: boolean): Square | null {
  if (rect.width <= 0 || rect.height <= 0 || x < rect.left || y < rect.top || x >= rect.left + rect.width || y >= rect.top + rect.height) return null;
  const column = Math.floor((x - rect.left) / rect.width * 8);
  const row = Math.floor((y - rect.top) / rect.height * 8);
  return `${'abcdefgh'[flipped ? 7 - column : column]}${flipped ? row + 1 : 8 - row}` as Square;
}
