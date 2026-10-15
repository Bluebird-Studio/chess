import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { candidatePreview } from './candidate-preview';

test('candidate preview steps forward and returns without modifying the source game', () => {
  const source = new Chess();
  source.move('e4');
  const pgn = source.pgn();
  const line = ['e5', 'Nf3', 'Nc6'];
  const preview = candidatePreview(pgn, line, 2);
  assert.deepEqual(preview.history(), ['e4', 'e5', 'Nf3']);
  assert.equal(candidatePreview(pgn, line, 0).fen(), source.fen());
  assert.equal(source.pgn(), pgn);
  assert.deepEqual(line, ['e5', 'Nf3', 'Nc6']);
});

test('preview preserves custom starting positions, black turn and checkmate', () => {
  const source = new Chess('7k/8/5KQ1/8/8/8/8/8 w - - 0 12');
  assert.ok(candidatePreview(source.pgn(), ['Qg7#'], 1).isCheckmate());
  const black = new Chess();
  black.move('e4');
  assert.equal(candidatePreview(black.pgn(), ['e5'], 1).turn(), 'w');
});

test('preview rejects invalid prefixes and illegal candidate moves', () => {
  const pgn = new Chess().pgn();
  for (const count of [-1, 2, 0.5, NaN]) {
    assert.throws(() => candidatePreview(pgn, ['e4'], count));
  }
  assert.throws(() => candidatePreview(pgn, ['e5'], 1));
});

test('exported preview PGN round-trips source history and only the selected continuation', () => {
  const source = new Chess();
  for (const move of ['e4', 'e5', 'Nf3', 'Nc6']) source.move(move);
  const original = source.pgn();
  const preview = candidatePreview(original, ['Bb5', 'a6', 'Ba4'], 2);
  const imported = new Chess();
  imported.loadPgn(preview.pgn());
  assert.deepEqual(imported.history(), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  assert.equal(imported.fen(), preview.fen());
  assert.equal(source.pgn(), original);
});

test('exported preview PGN retains a custom black-to-move starting position', () => {
  const source = new Chess('8/8/8/8/8/5kq1/8/7K b - - 0 12');
  const preview = candidatePreview(source.pgn(), ['Qg2#'], 1);
  const imported = new Chess();
  imported.loadPgn(preview.pgn());
  assert.equal(imported.getHeaders().FEN, source.fen());
  assert.equal(imported.fen(), preview.fen());
  assert.equal(imported.isCheckmate(), true);
  assert.match(preview.pgn(), /12\. \.\.\. Qg2#/);
});
