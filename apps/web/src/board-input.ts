import type { Square } from 'chess.js';

/** Resolve viewport coordinates against the board's inner playing surface. */
export function squareAtPoint(x: number, y: number, rect: { left: number; top: number; width: number; height: number }, flipped: boolean): Square | null {
  if (rect.width <= 0 || rect.height <= 0 || x < rect.left || y < rect.top || x >= rect.left + rect.width || y >= rect.top + rect.height) return null;
  const column = Math.floor((x - rect.left) / rect.width * 8);
  const row = Math.floor((y - rect.top) / rect.height * 8);
  return `${'abcdefgh'[flipped ? 7 - column : column]}${flipped ? row + 1 : 8 - row}` as Square;
}

/** Keyboard navigation uses visual indices so it also works on a flipped board. */
export function boardFocusIndex(index: number, key: string, wholeBoard = false): number | null {
  if (key === 'Home') return wholeBoard ? 0 : Math.floor(index / 8) * 8;
  if (key === 'End') return wholeBoard ? 63 : Math.floor(index / 8) * 8 + 7;
  const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 } as Record<string, number>)[key];
  if (step === undefined) return null;
  const next = index + step;
  if (next < 0 || next >= 64 || (Math.abs(step) === 1 && Math.floor(next / 8) !== Math.floor(index / 8))) return index;
  return next;
}
