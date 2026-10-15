import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { candidateLine } from './analysis-line';

test('candidate continuation contains at most three legal moves without changing source', () => {
  const game = new Chess(); game.move('e4');
  const pgn = game.pgn();
  const line = candidateLine(pgn);
  assert.equal(game.pgn(), pgn);
  assert.ok(line.length > 0 && line.length <= 3);
  for (const san of line) assert.ok(game.move(san));
});

test('candidate finds immediate mate and stops at terminal positions', () => {
  const game = new Chess('7k/8/5KQ1/8/8/8/8/8 w - - 0 12');
  const line = candidateLine(game.pgn());
  assert.equal(line.length, 1);
  game.move(line[0]);
  assert.ok(game.isCheckmate());
  assert.deepEqual(candidateLine(game.pgn()), []);
});

test('candidate respects repetition history and rejects invalid input', () => {
  const game = new Chess();
  for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) game.move(move);
  assert.deepEqual(candidateLine(game.pgn()), []);
  assert.throws(() => candidateLine('invalid game'));
});
