import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { readReplay, replayShortcut, replayStatus } from './replay';

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

test('replay keyboard navigation stays within game boundaries including FEN-only imports', () => {
  assert.equal(replayShortcut('ArrowLeft', 0, 4), 0);
  assert.equal(replayShortcut('ArrowRight', 4, 4), 4);
  assert.equal(replayShortcut('ArrowLeft', 3, 4), 2);
  assert.equal(replayShortcut('ArrowRight', 1, 4), 2);
  assert.equal(replayShortcut('Home', 3, 4), 0);
  assert.equal(replayShortcut('End', 1, 4), 4);
  assert.equal(replayShortcut('ArrowRight', 0, 0), 0);
  assert.equal(replayShortcut('Escape', 2, 4), null);
});


test('custom Black-to-move imports preserve move numbers and highlight coordinates', () => {
  const game = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 17');
  game.move('e5'); game.move('Nf3');
  const replay = readReplay(game.pgn());
  assert.deepEqual(replay.details, [
    { from: 'e7', to: 'e5', label: '17… e5' },
    { from: 'g1', to: 'f3', label: '18. Nf3' },
  ]);
  assert.deepEqual(readReplay(game.fen()).details, []);
});

test('replay status distinguishes turn, check, mate and drawn positions', () => {
  const game = new Chess();
  assert.equal(replayStatus(game), 'White to move');
  game.move('f3'); game.move('e5'); game.move('g4'); game.move('Qh4#');
  assert.equal(replayStatus(game), 'Checkmate · Black wins');
  assert.equal(replayStatus(new Chess('7k/6Q1/5K2/8/8/8/8/8 b - - 0 12')), 'Checkmate · White wins');
  assert.equal(replayStatus(new Chess('7k/5K2/6Q1/8/8/8/8/8 b - - 0 12')), 'Draw · Stalemate');
  assert.equal(replayStatus(new Chess('7k/8/5K2/8/8/8/8/8 w - - 0 12')), 'Draw · Insufficient material');
  assert.equal(replayStatus(new Chess('7k/8/5K2/8/8/8/8/R7 w - - 100 12')), 'Draw · Fifty-move rule');
  assert.equal(replayStatus(new Chess('7k/8/5K2/8/8/8/8/7R b - - 0 12')), 'Black to move · Check');
});

test('replay status recognizes repetition when navigation preserves history', () => {
  const game = new Chess();
  for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) game.move(move);
  const replay = readReplay(game.pgn());
  const position = new Chess(replay.positions[0]);
  for (const move of replay.moves) position.move(move);
  assert.equal(replayStatus(position), 'Draw · Threefold repetition');
  position.undo();
  assert.equal(replayStatus(position), 'Black to move');
});
