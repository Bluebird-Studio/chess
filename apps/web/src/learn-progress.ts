export const LEARN_PROGRESS_KEY = 'chess.learn.completed.v1';

export function readCompleted(storage: Pick<Storage, 'getItem'>, validIds: readonly string[]): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(LEARN_PROGRESS_KEY) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && validIds.includes(id)))] : [];
  } catch { return []; }
}

export function saveCompleted(storage: Pick<Storage, 'setItem'>, completed: readonly string[]): void {
  try { storage.setItem(LEARN_PROGRESS_KEY, JSON.stringify(completed)); }
  catch { /* Practice remains available when browser storage is unavailable. */ }
}

/** Continue in exercise order, wrapping to unfinished work before offering review. */
export function nextExerciseIndex(ids: readonly string[], completed: readonly string[], current: number): number {
  if (!ids.length) return 0;
  for (let offset = 1; offset <= ids.length; offset++) {
    const index = (current + offset) % ids.length;
    if (!completed.includes(ids[index])) return index;
  }
  return (current + 1) % ids.length;
}
