import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Chess } from 'chess.js';
import { timeoutResult } from './timeout.js';

test('flagging against a bare king is a draw for either color', () => {
  assert.equal(timeoutResult(new Chess('7k/8/8/8/8/8/R7/K7 w - - 0 1')), 'draw');
  assert.equal(timeoutResult(new Chess('7k/7r/8/8/8/8/8/K7 b - - 0 1')), 'draw');
});

test('timeout preserves dead-position draws and material wins', () => {
  assert.equal(timeoutResult(new Chess('7k/8/8/8/8/8/B7/K7 b - - 0 1')), 'draw');
  assert.equal(timeoutResult(new Chess('7k/8/8/8/8/8/R7/K7 b - - 0 1')), 'white');
  assert.equal(timeoutResult(new Chess('7k/7q/8/8/8/8/8/K7 w - - 0 1')), 'black');
});

test('a minor piece can win on time when opposing material permits mate', () => {
  // Opposing knights can block a8's escape squares in a bishop mating net.
  assert.equal(new Chess('kn6/nB6/2K5/8/8/8/8/8 b - - 0 1').isCheckmate(), true);
  const game = new Chess('kn6/n7/1K6/8/8/8/8/5B2 b - - 0 1');
  assert.equal(timeoutResult(game), 'white');
  assert.equal(game.fen(), 'kn6/n7/1K6/8/8/8/8/5B2 b - - 0 1');
});
