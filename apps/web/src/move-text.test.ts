import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { resolveMoveText } from './move-text';

test('accepts SAN and coordinates without mutating the game', () => {
  const game = new Chess();
  const fen = game.fen();
  for (const input of ['e4', ' e2e4 ', 'E2-E4']) assert.equal(resolveMoveText(game, input).san, 'e4');
  assert.equal(resolveMoveText(game, 'Nf3').from, 'g1');
  for (const input of ['', 'e5', 'e2e5', 'e2e4q', 'nf3']) assert.throws(() => resolveMoveText(game, input));
  assert.equal(game.fen(), fen);
});
test('resolves castling, checks, and en passant from legal moves', () => {
  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(resolveMoveText(castle, '0-0').to, 'g1');
  assert.equal(resolveMoveText(castle, 'O-O-O').to, 'c1');
  const ep = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  assert.equal(resolveMoveText(ep, 'exd6').isEnPassant(), true);
  const mate = new Chess('7k/8/5KQ1/8/8/8/8/8 w - - 0 1');
  assert.equal(resolveMoveText(mate, 'Qg7#').san, 'Qg7#');
});
test('requires explicit promotion and preserves underpromotion', () => {
  const game = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
  assert.throws(() => resolveMoveText(game, 'a7a8'), /promotion piece/);
  assert.equal(resolveMoveText(game, 'a7a8n').promotion, 'n');
  assert.equal(resolveMoveText(game, 'a8=R').promotion, 'r');
});
test('rejects pinned moves and ambiguous SAN', () => {
  const pinned = new Chess('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');
  assert.throws(() => resolveMoveText(pinned, 'e2d2'));
  const knights = new Chess('7k/8/8/8/8/8/3N3N/7K w - - 0 1');
  assert.throws(() => resolveMoveText(knights, 'Nf3'));
  assert.equal(resolveMoveText(knights, 'Ndf3').from, 'd2');
});
