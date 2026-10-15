import test from 'node:test';
import assert from 'node:assert/strict';
import { BEST_STREAK_KEY, readBestStreak, saveBestStreak, updateStreak } from './practice-streak';

test('different solved exercises build a streak; retries cannot inflate it', () => {
  const first = updateStreak({ current: 0, best: 0, credited: [] }, 'a', true);
  const second = updateStreak(first, 'b', true);
  assert.equal(second.current, 2);
  assert.equal(second.best, 2);
  assert.equal(updateStreak(second, 'a', true), second);
  const broken = updateStreak(second, 'c', false);
  assert.equal(broken.current, 0);
  assert.equal(broken.best, 2);
  assert.equal(updateStreak(broken, 'a', true).current, 0);
  assert.equal(updateStreak(broken, 'c', true).current, 1);
  assert.deepEqual(second.credited, ['a', 'b']);
});

test('best streak persists and invalid or unavailable storage is harmless', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  saveBestStreak(storage, 4);
  assert.equal(values.get(BEST_STREAK_KEY), '4');
  assert.equal(readBestStreak(storage), 4);
  for (const value of ['-1', 'NaN', 'Infinity', '1.5', '9007199254740992']) {
    assert.equal(readBestStreak({ getItem: () => value }), 0);
  }
  assert.equal(readBestStreak({ getItem: () => { throw Error(); } }), 0);
  assert.doesNotThrow(() => saveBestStreak({ setItem: () => { throw Error(); } }, 4));
});
