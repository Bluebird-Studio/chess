import test from 'node:test';
import assert from 'node:assert/strict';
import { LEARN_PROGRESS_KEY, readCompleted, saveCompleted } from './learn-progress';

test('completion survives saving and loading, filtering unknown and duplicate exercises', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  saveCompleted(storage, ['queen-king', 'queen-king', 'old-exercise']);
  assert.deepEqual(readCompleted(storage, ['queen-king', 'back-rank']), ['queen-king']);
  assert.ok(data.has(LEARN_PROGRESS_KEY));
});

test('missing, malformed and unavailable storage never prevent practice', () => {
  for (const value of [null, '{', '{}', '[null,42]']) {
    assert.deepEqual(readCompleted({ getItem: () => value }, ['queen-king']), []);
  }
  assert.deepEqual(readCompleted({ getItem: () => { throw new Error('blocked'); } }, []), []);
  assert.doesNotThrow(() => saveCompleted({ setItem: () => { throw new Error('full'); } }, ['queen-king']));
});
