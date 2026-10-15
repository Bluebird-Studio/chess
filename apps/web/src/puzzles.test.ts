import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess, type Square } from 'chess.js';
import { puzzles, tryPuzzleMove } from './puzzles';

test('original lessons start legal and every advertised solution is checkmate', () => {
  for (const puzzle of puzzles) {
    const game = new Chess(puzzle.fen);
    assert.equal(game.isCheck(), false);
    assert.equal(game.isGameOver(), false);
    const result = tryPuzzleMove(puzzle.fen, puzzle.solution.slice(0, 2) as Square, puzzle.solution.slice(2) as Square);
    assert.equal(result?.solved, true, puzzle.title);
    assert.equal(new Chess(result!.fen).isCheckmate(), true);
  }
});
test('illegal moves are rejected and legal nonmates are not accepted', () => {
  assert.equal(tryPuzzleMove(puzzles[0].fen, 'g6', 'e5'), null);
  assert.equal(tryPuzzleMove(puzzles[0].fen, 'g6', 'g5')?.solved, false);
});

test('lessons cover both solving sides and reject legal nonmates for each exercise', () => {
  assert.deepEqual(new Set(puzzles.map(puzzle => new Chess(puzzle.fen).turn())), new Set(['w', 'b']));
  for (const puzzle of puzzles) {
    const game = new Chess(puzzle.fen);
    const wrong = game.moves({ verbose: true }).find(move => !move.san.endsWith('#'));
    assert.ok(wrong, puzzle.title);
    assert.equal(tryPuzzleMove(puzzle.fen, wrong.from, wrong.to)?.solved, false, puzzle.title);
  }
});
