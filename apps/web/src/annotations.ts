import type { Square } from 'chess.js';

/** Keep review marks attached to their position, independent of board orientation. */
export function toggleAnnotation(marks: Record<string, Square[]>, fen: string, square: Square): Record<string, Square[]> {
  const current = marks[fen] ?? [];
  return { ...marks, [fen]: current.includes(square) ? current.filter(item => item !== square) : [...current, square] };
}
