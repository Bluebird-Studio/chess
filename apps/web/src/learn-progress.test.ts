import test from 'node:test';
import assert from 'node:assert/strict';
import { LEARN_PROGRESS_KEY, nextExerciseIndex, readCompleted, saveCompleted } from './learn-progress';

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

test('next exercise skips completed work and wraps to earlier unfinished lessons', () => {
  const ids = ['first', 'second', 'third', 'fourth'];
  assert.equal(nextExerciseIndex(ids, ['second', 'third'], 0), 3);
  assert.equal(nextExerciseIndex(ids, ['second', 'third', 'fourth'], 3), 0);
  assert.equal(nextExerciseIndex(ids, ['first', 'second', 'fourth'], 2), 2);
  assert.equal(nextExerciseIndex(ids, ids, 3), 0);
  assert.equal(nextExerciseIndex(['only'], [], 0), 0);
  assert.equal(nextExerciseIndex([], [], 0), 0);
});
