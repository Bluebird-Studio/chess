import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { toggleAnnotation } from './annotations';

test('marks toggle independently by position and preserve earlier state', () => {
  const game = new Chess();
  const start = game.fen();
  const first = toggleAnnotation({}, start, 'e4');
  const second = toggleAnnotation(first, start, 'd4');
  game.move('e4');
  const next = game.fen();
  const third = toggleAnnotation(second, next, 'e4');
  const fourth = toggleAnnotation(third, start, 'e4');
  assert.deepEqual(first[start], ['e4']);
  assert.deepEqual(second[start], ['e4', 'd4']);
  assert.deepEqual(fourth[start], ['d4']);
  assert.deepEqual(fourth[next], ['e4']);
  assert.deepEqual(toggleAnnotation(fourth, next, 'e4')[next], []);
});
