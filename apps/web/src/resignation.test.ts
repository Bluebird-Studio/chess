import test from 'node:test';
import assert from 'node:assert/strict';
import { resigningColor } from './resignation';

test('resigning against a bot always resigns the human, including during bot thinking', () => {
  assert.equal(resigningColor('bot', 'w', null), 'w');
  assert.equal(resigningColor('bot', 'b', null), 'w');
});
test('online resignation uses the assigned seat even on the opponent turn', () => {
  assert.equal(resigningColor('online', 'w', 'b'), 'b');
  assert.equal(resigningColor('online', 'b', 'w'), 'w');
  assert.equal(resigningColor('online', 'w', null), null);
});
test('local resignation applies to the player whose turn it is', () => {
  assert.equal(resigningColor('local', 'w', null), 'w');
  assert.equal(resigningColor('local', 'b', null), 'b');
});
