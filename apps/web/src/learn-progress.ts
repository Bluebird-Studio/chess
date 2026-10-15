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
