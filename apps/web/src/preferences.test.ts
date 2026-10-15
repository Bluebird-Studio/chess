import test from 'node:test';
import assert from 'node:assert/strict';
import { boardThemes, PREFERENCES_KEY, readPreferences, savePreferences } from './preferences';

test('each board palette and sound choice survive a reload', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  for (const theme of boardThemes) {
    for (const sound of [false, true]) {
      const preferences = { theme: theme.id, sound };
      savePreferences(storage, preferences);
      assert.deepEqual(readPreferences(storage), preferences);
    }
  }
  assert.ok(data.has(PREFERENCES_KEY));
});

test('invalid stored fields fall back independently and never enable sound by coercion', () => {
  const read = (value: unknown) => readPreferences({ getItem: () => JSON.stringify(value) });
  assert.deepEqual(read({ theme: 'unknown', sound: true }), { theme: 'sage', sound: true });
  assert.deepEqual(read({ theme: 'slate', sound: 'true' }), { theme: 'slate', sound: false });
  for (const value of [null, 7, [], 'walnut']) {
    assert.deepEqual(read(value), { theme: 'sage', sound: false });
  }
});

test('malformed or unavailable storage keeps Play usable', () => {
  assert.deepEqual(readPreferences({ getItem: () => '{' }), { theme: 'sage', sound: false });
  assert.deepEqual(readPreferences({ getItem: () => { throw new Error('blocked'); } }), { theme: 'sage', sound: false });
  assert.doesNotThrow(() => savePreferences({ setItem: () => { throw new Error('full'); } }, { theme: 'walnut', sound: true }));
});
