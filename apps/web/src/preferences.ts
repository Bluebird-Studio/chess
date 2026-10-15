export const PREFERENCES_KEY = 'chess.preferences.v1';
export const boardThemes = [
  { id: 'sage', label: 'Sage' },
  { id: 'walnut', label: 'Walnut' },
  { id: 'slate', label: 'Slate' },
] as const;
export type BoardTheme = typeof boardThemes[number]['id'];
export type Preferences = { theme: BoardTheme; sound: boolean };

export function readPreferences(storage: Pick<Storage, 'getItem'>): Preferences {
  const defaults: Preferences = { theme: 'sage', sound: false };
  try {
    const value: unknown = JSON.parse(storage.getItem(PREFERENCES_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    const saved = value as Record<string, unknown>;
    return {
      theme: boardThemes.some(theme => theme.id === saved.theme) ? saved.theme as BoardTheme : defaults.theme,
      sound: typeof saved.sound === 'boolean' ? saved.sound : defaults.sound,
    };
  } catch { return defaults; }
}

export function savePreferences(storage: Pick<Storage, 'setItem'>, preferences: Preferences): void {
  try { storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); }
  catch { /* Preferences still apply for this visit when storage is unavailable. */ }
}
