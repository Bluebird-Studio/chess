import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { readReplay } from './replay';

test('replay includes initial position and every ply without changing the source game', () => {
  const game = new Chess();
  for (const move of ['e4', 'e5', 'Nf3', 'Nc6']) game.move(move);
  const replay = readReplay(game.pgn());
  assert.equal(replay.positions.length, 5);
  assert.equal(replay.positions[0], new Chess().fen());
  assert.equal(replay.positions[4], game.fen());
  assert.deepEqual(replay.moves, game.history());
  assert.equal(readReplay(replay.pgn).positions.at(-1), game.fen());
});
test('FEN and PGN with a custom starting position retain that position', () => {
  const fen = '7k/8/5KQ1/8/8/8/8/8 w - - 0 12';
  assert.deepEqual(readReplay(fen).positions, [fen]);
  const game = new Chess(fen); game.move('Qg7#');
  const replay = readReplay(game.pgn());
  assert.equal(replay.positions[0], fen);
  assert.equal(replay.positions.at(-1), game.fen());
});
test('invalid imports are rejected', () => {
  for (const input of ['', 'not a game', '8/8/8/8/8/8/8/8 w - - 0 1']) assert.throws(() => readReplay(input));
});
