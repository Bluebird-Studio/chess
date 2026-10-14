import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Chess } from 'chess.js';
import { selectBotMove, type BotLevel } from './index.ts';

const levels: BotLevel[] = ['random', 'greedy', 'positional', 'minimax', 'alphabeta'];
for (const level of levels) {
  test(`${level} returns legal move without changing the position`, () => {
    const game = new Chess();
    const fen = game.fen(), history = game.history();
    const move = selectBotMove(game, level, { maxNodes: 600, maxTimeMs: 100 });
    assert.ok(move);
    assert.ok(game.moves().includes(move.san));
    assert.equal(game.fen(), fen);
    assert.deepEqual(game.history(), history);
  });
  test(`${level} works for black`, () => {
    const game = new Chess();
    game.move('e4');
    const fen = game.fen();
    const move = selectBotMove(game, level, { maxNodes: 600, maxTimeMs: 100 });
    assert.ok(move && game.moves().includes(move.san));
    assert.equal(game.fen(), fen);
  });
}
test('all bots return null for checkmate', () => {
  const game = new Chess();
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) game.move(san);
  assert.ok(game.isCheckmate());
  for (const level of levels) assert.equal(selectBotMove(game, level), null);
});
test('greedy bot prefers capturing a queen over a pawn', () => {
  const game = new Chess('4k3/8/8/8/8/8/q7/R3K3 w Q - 0 1');
  const move = selectBotMove(game, 'greedy');
  assert.equal(move?.san, 'Rxa2');
});
