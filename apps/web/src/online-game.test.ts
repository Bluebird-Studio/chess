import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { restoreOnlineGame } from './online-game.js';

test('online snapshots preserve notation, last move and threefold repetition', () => {
  const server = new Chess();
  for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) server.move(move);
  const restored = restoreOnlineGame(server.fen(), server.history());
  assert.deepEqual(restored.history(), server.history());
  assert.equal(restored.history({ verbose: true }).at(-1)?.to, 'g8');
  assert.equal(restored.isThreefoldRepetition(), true);
});

test('initial seat snapshot and rematch both restore correctly', () => {
  const initial = new Chess();
  assert.equal(restoreOnlineGame(initial.fen()).fen(), initial.fen());
  assert.deepEqual(restoreOnlineGame(initial.fen(), []).history(), []);
});

test('inconsistent server snapshots cannot silently discard the move history', () => {
  assert.throws(() => restoreOnlineGame(new Chess().fen(), ['e4']), /does not match/);
});
