import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { materialBalance } from './material';

test('starting position has equal material', () => {
  const balance = materialBalance(new Chess());
  assert.equal(balance.white, 39);
  assert.equal(balance.black, 39);
  assert.equal(balance.whitePercent, 50);
  assert.equal(balance.label, 'Equal material');
});

test('material follows captures and replay positions', () => {
  const game = new Chess();
  for (const move of ['e4', 'd5', 'exd5']) game.move(move);
  assert.equal(materialBalance(game).difference, 1);
  assert.equal(materialBalance(game).label, 'White has 1 extra point of material');
  game.undo();
  assert.equal(materialBalance(game).difference, 0);
});

test('imported promoted pieces count without assuming starting inventory', () => {
  const game = new Chess('7k/8/8/8/8/8/QQ6/K7 w - - 0 1');
  assert.equal(materialBalance(game).white, 18);
  assert.equal(materialBalance(game).whitePercent, 100);
});

test('bare kings have a finite neutral bar and Black advantages are named', () => {
  assert.equal(materialBalance(new Chess('7k/8/8/8/8/8/8/K7 w - - 0 1')).whitePercent, 50);
  const balance = materialBalance(new Chess('7k/8/8/8/8/8/q7/K7 w - - 0 1'));
  assert.equal(balance.difference, -9);
  assert.equal(balance.label, 'Black has 9 extra points of material');
});
