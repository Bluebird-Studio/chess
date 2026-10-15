import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squareAtPoint } from './board-input';

const board = { left: 20, top: 100, width: 320, height: 320 };
test('touch drops resolve all squares in either board orientation', () => {
  for (let row = 0; row < 8; row++) for (let column = 0; column < 8; column++) {
    const x = 20 + column * 40 + 20, y = 100 + row * 40 + 20;
    assert.equal(squareAtPoint(x, y, board, false), `${'abcdefgh'[column]}${8 - row}`);
    assert.equal(squareAtPoint(x, y, board, true), `${'abcdefgh'[7 - column]}${row + 1}`);
  }
});
test('releasing beyond the playing surface cancels the drop', () => {
  for (const [x, y] of [[19, 100], [20, 99], [340, 100], [20, 420]]) assert.equal(squareAtPoint(x, y, board, false), null);
  assert.equal(squareAtPoint(20, 100, board, false), 'a8');
  assert.equal(squareAtPoint(339.9, 419.9, board, false), 'h1');
  assert.equal(squareAtPoint(20, 100, { ...board, width: 0 }, false), null);
});
