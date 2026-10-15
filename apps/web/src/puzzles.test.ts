import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess, type Square } from 'chess.js';
import { type PuzzlePromotion, puzzles, puzzleSolution, tryPuzzleMove } from './puzzles';

test('original lessons start legal and every advertised solution is checkmate', () => {
  for (const puzzle of puzzles) {
    const game = new Chess(puzzle.fen);
    assert.equal(game.isCheck(), false);
    assert.equal(game.isGameOver(), false);
    const result = tryPuzzleMove(puzzle.fen, puzzle.solution.slice(0, 2) as Square, puzzle.solution.slice(2, 4) as Square, puzzle.solution[4] as PuzzlePromotion | undefined);
    assert.equal(result?.solved, true, puzzle.title);
    assert.equal(new Chess(result!.fen).isCheckmate(), true);
  }
});
test('illegal moves are rejected and legal nonmates are not accepted', () => {
  assert.equal(tryPuzzleMove(puzzles.find(puzzle => puzzle.id === 'queen-king')!.fen, 'g6', 'e5'), null);
  assert.equal(tryPuzzleMove(puzzles.find(puzzle => puzzle.id === 'queen-king')!.fen, 'g6', 'g5')?.solved, false);
});

test('lessons cover both solving sides and reject legal nonmates for each exercise', () => {
  assert.deepEqual(new Set(puzzles.map(puzzle => new Chess(puzzle.fen).turn())), new Set(['w', 'b']));
  for (const puzzle of puzzles) {
    const game = new Chess(puzzle.fen);
    const wrong = game.moves({ verbose: true }).find(move => !move.san.endsWith('#'));
    assert.ok(wrong, puzzle.title);
    assert.equal(tryPuzzleMove(puzzle.fen, wrong.from, wrong.to, wrong.promotion as PuzzlePromotion | undefined)?.solved, false, puzzle.title);
  }
});

test('revealed solutions provide matching notation and coordinates without changing exercises', () => {
  for (const puzzle of puzzles) {
    const before = JSON.stringify(puzzle);
    const answer = puzzleSolution(puzzle);
    assert.equal(answer.from + answer.to, puzzle.solution.slice(0, 4));
    assert.ok(answer.san.endsWith('#'));
    assert.equal(new Chess(answer.fen).isCheckmate(), true);
    assert.equal(JSON.stringify(puzzle), before);
  }
  assert.throws(() => puzzleSolution({ ...puzzles.find(puzzle => puzzle.id === 'queen-king')!, solution: 'g6g5' }), /must be checkmate/);
});

test('typed solutions work in SAN and coordinate notation for every exercise without mutating its board', async () => {
  const { resolveMoveText } = await import('./move-text');
  for (const puzzle of puzzles) {
    const game = new Chess(puzzle.fen);
    const answer = puzzleSolution(puzzle);
    for (const text of [answer.san, answer.san.replace('#', ''), puzzle.solution]) {
      const move = resolveMoveText(game, text);
      assert.equal(tryPuzzleMove(puzzle.fen, move.from, move.to, move.promotion as PuzzlePromotion | undefined)?.solved, true);
      assert.equal(game.fen(), puzzle.fen);
    }
    assert.throws(() => resolveMoveText(game, 'not a move'), /not legal/);
  }
});

test('promotion exercises respect the chosen piece and never silently promote', async () => {
  const { resolveMoveText } = await import('./move-text');
  const puzzle = puzzles.find(item => item.id === 'promotion-mate')!;
  assert.equal(tryPuzzleMove(puzzle.fen, 'g7', 'g8'), null);
  for (const promotion of ['q', 'r', 'b', 'n'] as const) {
    const result = tryPuzzleMove(puzzle.fen, 'g7', 'g8', promotion)!;
    assert.equal(new Chess(result.fen).get('g8')?.type, promotion);
    assert.equal(result.solved, promotion === 'q' || promotion === 'r');
    const move = resolveMoveText(new Chess(puzzle.fen), `g7g8${promotion}`);
    assert.equal(move.promotion, promotion);
  }
  assert.throws(() => resolveMoveText(new Chess(puzzle.fen), 'g7g8'), /Choose a promotion/);
});
