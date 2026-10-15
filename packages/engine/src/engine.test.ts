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

for (const [reason, fen] of [
  ['insufficient material', '4k3/8/8/8/8/8/8/4K3 w - - 0 1'],
  ['fifty-move rule', '4k3/8/8/8/8/8/8/R3K3 w - - 100 51'],
  ['stalemate', '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1']
]) {
  test(`all bots stop after ${reason}`, () => {
    const game = new Chess(fen);
    assert.ok(game.isDraw());
    for (const level of levels) {
      assert.equal(selectBotMove(game, level), null, level);
      assert.equal(game.fen(), fen);
      assert.deepEqual(game.history(), []);
    }
  });
}

test('all bots preserve a repetition draw and its move history', () => {
  const game = new Chess();
  for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) game.move(san);
  assert.ok(game.isThreefoldRepetition());
  assert.ok(game.moves().length > 0);
  const fen = game.fen(), history = game.history();
  for (const level of levels) {
    assert.equal(selectBotMove(game, level), null, level);
    assert.equal(game.fen(), fen);
    assert.deepEqual(game.history(), history);
    assert.ok(game.isThreefoldRepetition());
  }
});

for (const level of levels.filter(level => level !== 'random')) {
  for (const [scenario, fen] of [
    ['white mate instead of a queen capture', '7k/5Q2/6K1/8/8/8/q7/R7 w - - 0 1'],
    ['black mate instead of a queen capture', 'r7/Q7/8/8/8/6k1/5q2/7K b - - 0 1'],
    ['promotion mate', '7k/5P1p/5K2/8/8/8/8/8 w - - 0 1']
  ]) {
    test(`${level} takes ${scenario} with minimal requested search limits`, () => {
      const game = new Chess(fen);
      const history = game.history();
      const move = selectBotMove(game, level, { maxNodes: 1, maxTimeMs: 1 });
      assert.ok(move);
      assert.equal(game.fen(), fen);
      assert.deepEqual(game.history(), history);
      game.move(move);
      assert.ok(game.isCheckmate(), move.san);
    });
  }
}

for (const [color, fen] of [
  ['white', '3rk3/8/8/3p4/8/8/8/3QK3 w - - 0 1'],
  ['black', '3qk3/8/8/8/3P4/8/8/3RK3 b - - 0 1']
]) {
  test(`alpha-beta avoids a poisoned pawn for ${color} within a short search`, () => {
    const game = new Chess(fen);
    const history = game.history();
    const move = selectBotMove(game, 'alphabeta', { maxNodes: 100, maxTimeMs: 1000 });
    assert.ok(move);
    assert.ok(!move.captured, `must see the rook recapture after ${move.san}`);
    assert.equal(game.fen(), fen);
    assert.deepEqual(game.history(), history);
  });
}

for (const jump of [-60_000, 60_000]) {
  test(`alpha-beta respects elapsed budget during ${jump > 0 ? 'forward' : 'backward'} wall-clock jumps`, t => {
    const game = new Chess();
    game.move('e4');
    const fen = game.fen(), history = game.history();
    let wallTime = 1_000_000, elapsed = 0, clockReads = 0;
    t.mock.method(Date, 'now', () => (wallTime += jump));
    // Advance elapsed time deterministically: abort inside the search after
    // making a move, exercising the finally block that must restore history.
    t.mock.method(performance, 'now', () => {
      clockReads++;
      elapsed += 20;
      return elapsed;
    });
    const move = selectBotMove(game, 'alphabeta', { maxTimeMs: 50, maxNodes: 100_000 });
    assert.ok(move && game.moves().includes(move.san), 'budget exhaustion retains a legal fallback');
    assert.equal(clockReads, 4, 'root and recursive search use the same monotonic deadline');
    assert.equal(game.fen(), fen);
    assert.deepEqual(game.history(), history);
  });
}

for (const turn of ['white', 'black']) {
  test(`minimax stops at its elapsed budget for ${turn} and restores an interrupted branch`, t => {
    const game = new Chess();
    if (turn === 'black') game.move('e4');
    const fen = game.fen(), history = game.history();
    let elapsed = 0, clockReads = 0;
    t.mock.method(performance, 'now', () => {
      clockReads++;
      elapsed += 20;
      return elapsed;
    });
    const move = selectBotMove(game, 'minimax', { maxTimeMs: 50, maxNodes: 100_000 });
    assert.ok(move && game.moves().includes(move.san));
    assert.equal(clockReads, 4, 'interrupts a recursive branch at the monotonic deadline');
    assert.equal(game.fen(), fen);
    assert.deepEqual(game.history(), history);
  });
}

test('minimax also respects its node budget when the elapsed clock has not advanced', t => {
  const game = new Chess();
  const fen = game.fen();
  let checks = 0;
  t.mock.method(performance, 'now', () => { checks++; return 0; });
  const move = selectBotMove(game, 'minimax', { maxNodes: 100, maxTimeMs: 1000 });
  assert.ok(move && game.moves().includes(move.san));
  assert.ok(checks <= 110, `node budget should bound search work (observed ${checks} checks)`);
  assert.equal(game.fen(), fen);
  assert.deepEqual(game.history(), []);
});

for (const level of ['minimax', 'alphabeta'] as const) {
  for (const invalid of [NaN, Infinity, -Infinity]) {
    test(`${level} falls back to a finite elapsed budget for ${invalid} limits`, t => {
      const game = new Chess();
      game.move('e4');
      const fen = game.fen(), history = game.history();
      let reads = 0;
      t.mock.method(performance, 'now', () => ++reads * 200);
      const move = selectBotMove(game, level, { maxNodes: invalid, maxTimeMs: invalid });
      assert.ok(move && game.moves().includes(move.san));
      assert.ok(reads <= 6, `invalid limits must retain the default deadline (${reads} clock reads)`);
      assert.equal(game.fen(), fen);
      assert.deepEqual(game.history(), history);
    });

    test(`${level} falls back to a finite node budget for ${invalid} limits`, t => {
      const game = new Chess();
      const fen = game.fen();
      let reads = 0;
      // Freeze time to prove the independent node safeguard remains enabled.
      t.mock.method(performance, 'now', () => { reads++; return 0; });
      const move = selectBotMove(game, level, { maxNodes: invalid, maxTimeMs: invalid });
      assert.ok(move && game.moves().includes(move.san));
      assert.ok(reads <= 8100, `invalid limits must retain the default node cap (${reads} clock reads)`);
      if (level === 'alphabeta') assert.ok(reads >= 8000, 'exercise node exhaustion with time frozen');
      assert.equal(game.fen(), fen);
      assert.deepEqual(game.history(), []);
    });
  }
}
