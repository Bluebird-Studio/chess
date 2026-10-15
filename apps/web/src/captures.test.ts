import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { capturedPieces, captureDescription } from './captures';

test('captures belong to the capturing player and follow undo and restored PGN', () => {
  const game = new Chess();
  for (const move of ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qe5', 'Be2', 'Qxe2']) game.move(move);
  assert.deepEqual(capturedPieces(game.history({ verbose: true }), 'w'), ['p']);
  assert.deepEqual(capturedPieces(game.history({ verbose: true }), 'b'), ['b', 'p']);
  const restored = new Chess(); restored.loadPgn(game.pgn());
  assert.deepEqual(capturedPieces(restored.history({ verbose: true }), 'b'), ['b', 'p']);
  game.undo();
  assert.deepEqual(capturedPieces(game.history({ verbose: true }), 'b'), ['p']);
});

test('en passant records a pawn while promotions and custom positions invent no captures', () => {
  const game = new Chess();
  for (const move of ['e4', 'a6', 'e5', 'd5', 'exd6']) game.move(move);
  assert.deepEqual(capturedPieces(game.history({ verbose: true }), 'w'), ['p']);
  const promotion = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
  assert.deepEqual(capturedPieces(promotion.history({ verbose: true }), 'w'), []);
  promotion.move('a8=Q');
  assert.deepEqual(capturedPieces(promotion.history({ verbose: true }), 'w'), []);
  const capturePromotion = new Chess('1r5k/P7/8/8/8/8/8/7K w - - 0 1');
  capturePromotion.move('axb8=Q');
  assert.deepEqual(capturedPieces(capturePromotion.history({ verbose: true }), 'w'), ['r']);
});

test('descriptions group captures into readable counts', () => {
  assert.equal(captureDescription([], 'w'), 'White has not captured any pieces.');
  assert.equal(captureDescription(['p', 'n', 'p'], 'b'), 'Black captured 1 knight, 2 pawns.');
});
