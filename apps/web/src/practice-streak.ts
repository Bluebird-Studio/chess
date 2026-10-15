export const BEST_STREAK_KEY = 'chess.learn.best-streak.v1';
export type PracticeStreak = { current: number; best: number; credited: readonly string[] };

export function readBestStreak(storage: Pick<Storage, 'getItem'>): number {
  try {
    const value = Number(storage.getItem(BEST_STREAK_KEY) ?? 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}

/** Each exercise can contribute once per visit to Learn; review cannot inflate a streak. */
export function updateStreak(state: PracticeStreak, id: string, solved: boolean): PracticeStreak {
  if (!solved) return { ...state, current: 0 };
  if (state.credited.includes(id)) return state;
  const current = state.current + 1;
  return { current, best: Math.max(state.best, current), credited: [...state.credited, id] };
}

export function saveBestStreak(storage: Pick<Storage, 'setItem'>, best: number): void {
  try { storage.setItem(BEST_STREAK_KEY, String(best)); }
  catch { /* Practice still works without browser storage. */ }
}
