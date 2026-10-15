import { useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { puzzles, tryPuzzleMove } from './puzzles';
import { readCompleted, saveCompleted } from './learn-progress';
import { boardFocusIndex } from './board-input';

const glyphs: Record<string, string> = { wk:'♔', wq:'♕', wr:'♖', wb:'♗', wn:'♘', wp:'♙', bk:'♚', bq:'♛', br:'♜', bb:'♝', bn:'♞', bp:'♟' };
export function Learn({ onClose }: { onClose: () => void }) {
  const [completed, setCompleted] = useState<string[]>(() => {
    try { return readCompleted(window.localStorage, puzzles.map(puzzle => puzzle.id)); }
    catch { return []; }
  });
  const [index, setIndex] = useState(() => {
    const next = puzzles.findIndex(puzzle => !completed.includes(puzzle.id));
    return next < 0 ? 0 : next;
  });
  const puzzle = puzzles[index];
  const [fen, setFen] = useState(puzzle.fen);
  const [selected, setSelected] = useState<Square | null>(null);
  const [solved, setSolved] = useState(false);
  const [hint, setHint] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [message, setMessage] = useState('Select a piece, then its destination.');
  const game = new Chess(fen);
  const solvingColor = new Chess(puzzle.fen).turn();
  const sideName = solvingColor === 'w' ? 'White' : 'Black';
  const legal = selected ? game.moves({ square: selected, verbose: true }).map(move => move.to) : [];
  function select(square: Square) {
    if (solved) return;
    if (game.get(square)?.color === solvingColor) { setSelected(square); return; }
    if (!selected) return;
    const attempt = tryPuzzleMove(puzzle.fen, selected, square);
    setSelected(null);
    if (!attempt) { setMessage('That move is not legal. Choose your piece again.'); return; }
    if (!attempt.solved) { setMessage('A legal move, but there is a mate in one. Try again.'); return; }
    setFen(attempt.fen); setSolved(true); setMessage(puzzle.explanation);
    if (!completed.includes(puzzle.id)) {
      const updated = [...completed, puzzle.id];
      setCompleted(updated);
      try { saveCompleted(window.localStorage, updated); } catch { /* Storage may be disabled. */ }
    }
  }
  function openExercise(nextIndex: number) {
    setIndex(nextIndex); setFen(puzzles[nextIndex].fen); setSelected(null); setSolved(false); setHint(false);
    setMessage('Select a piece, then its destination.');
  }
  return <section className="analysis-workspace panel" aria-label="Learn chess">
    <div className="analysis-heading"><div><span className="eyebrow">ONE MOVE, ONE IDEA</span><h2>Learn</h2></div><button onClick={onClose}>Back to Play</button></div>
    <div className="analysis-layout"><div className="board analysis-board lesson-board" role="group" aria-label="Puzzle board. Arrow keys move between squares. Enter selects a piece or destination. Escape clears your selection.">
      {Array.from({ length: 64 }, (_, i) => {
        const file = solvingColor === 'w' ? i % 8 : 7 - i % 8;
        const rank = solvingColor === 'w' ? 8 - Math.floor(i / 8) : Math.floor(i / 8) + 1;
        const square = `${'abcdefgh'[file]}${rank}` as Square;
        const piece = game.get(square);
        return <button key={square} tabIndex={i === focusIndex ? 0 : -1} onFocus={() => setFocusIndex(i)} onKeyDown={event => {
          if (event.key === 'Escape') { setSelected(null); return; }
          const next = boardFocusIndex(i, event.key, event.ctrlKey || event.metaKey);
          if (next === null) return;
          event.preventDefault();
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button.square')[next]?.focus();
        }} onClick={() => select(square)} aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'White' : 'Black'} ${({ k:'king', q:'queen', r:'rook', b:'bishop', n:'knight', p:'pawn' })[piece.type]}` : ''}`} aria-pressed={selected === square} aria-disabled={solved} aria-description={legal.includes(square) ? 'Legal destination' : undefined} className={`square ${(file + rank) % 2 === 0 ? 'light' : 'dark'} ${selected === square ? 'active' : ''} ${legal.includes(square) ? 'target' : ''}`}><span className={`piece ${piece?.color === 'w' ? 'white-piece' : 'black-piece'}`}>{piece ? glyphs[piece.color + piece.type] : ''}</span>{i % 8 === 0 && <span className="rank">{rank}</span>}{i >= 56 && <span className="file">{square[0]}</span>}</button>;
      })}
    </div><div className="analysis-tools lesson-copy"><span className="eyebrow">EXERCISE {index + 1} OF {puzzles.length}</span><p aria-label="Exercise progress">{completed.length} of {puzzles.length} exercises completed{completed.length === puzzles.length ? ' · All complete' : ''}</p><progress value={completed.length} max={puzzles.length} aria-label="Completed exercises" /><label htmlFor="learn-exercise">CHOOSE AN EXERCISE</label><select id="learn-exercise" value={index} onChange={event => openExercise(Number(event.target.value))}>{puzzles.map((item, i) => <option key={item.id} value={i}>{i + 1}. {item.title}{completed.includes(item.id) ? ' · Completed' : ''}</option>)}</select><h3>{puzzle.title}{completed.includes(puzzle.id) && <span className="lesson-completed"> ✓ Completed</span>}</h3><p>{sideName} to move · Checkmate in one</p><p role="status" className={solved ? 'lesson-success' : ''}>{message}</p>{!solved && <button onClick={() => setHint(true)}>Show a hint</button>}{hint && !solved && <p>{puzzle.hint}</p>}{solved && <button onClick={() => openExercise((index + 1) % puzzles.length)}>{index === puzzles.length - 1 ? 'Practice again' : 'Next exercise'} →</button>}<button onClick={() => openExercise(index)}>Restart exercise</button><small>Arrow keys move between squares · Enter selects · Escape clears selection.</small><small>Progress is saved on this device when browser storage is available. Original teaching positions. Take your time; incorrect moves leave the position ready for another try.</small></div></div>
  </section>;
}
