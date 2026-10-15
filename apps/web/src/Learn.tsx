import { useRef, useState, type PointerEvent } from 'react';
import { Chess, type Square } from 'chess.js';
import { puzzles, puzzleSolution, tryPuzzleMove, type PuzzlePromotion } from './puzzles';
import { nextExerciseIndex, readCompleted, saveCompleted } from './learn-progress';
import { squareAtPoint, boardFocusIndex } from './board-input';
import { resolveMoveText } from './move-text';
import { readBestStreak, saveBestStreak, updateStreak, type PracticeStreak } from './practice-streak';

const glyphs: Record<string, string> = { wk:'♔', wq:'♕', wr:'♖', wb:'♗', wn:'♘', wp:'♙', bk:'♚', bq:'♛', br:'♜', bb:'♝', bn:'♞', bp:'♟' };
export function Learn({ onClose }: { onClose: () => void }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ id: number; from: Square; x: number; y: number; dragging: boolean } | null>(null);
  const suppressClickUntil = useRef(0);
  const [completed, setCompleted] = useState<string[]>(() => {
    try { return readCompleted(window.localStorage, puzzles.map(puzzle => puzzle.id)); }
    catch { return []; }
  });
  const [streak, setStreak] = useState<PracticeStreak>(() => {
    let best = 0;
    try { best = readBestStreak(window.localStorage); } catch { /* Storage may be disabled. */ }
    return { current: 0, best, credited: [] };
  });
  function recordAttempt(success: boolean) {
    const next = updateStreak(streak, puzzle.id, success);
    setStreak(next);
    try { saveBestStreak(window.localStorage, next.best); } catch { /* Storage may be disabled. */ }
  }
  const [index, setIndex] = useState(() => {
    const next = puzzles.findIndex(puzzle => !completed.includes(puzzle.id));
    return next < 0 ? 0 : next;
  });
  const puzzle = puzzles[index];
  const [fen, setFen] = useState(puzzle.fen);
  const [selected, setSelected] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [solved, setSolved] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [moveText, setMoveText] = useState('');
  const [moveError, setMoveError] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);
  const [message, setMessage] = useState('Select a piece, then its destination.');
  const game = new Chess(fen);
  const solvingColor = new Chess(puzzle.fen).turn();
  const sideName = solvingColor === 'w' ? 'White' : 'Black';
  const legal = selected ? game.moves({ square: selected, verbose: true }).map(move => move.to) : [];
  function touchEnd(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const touch = touchRef.current;
    if (!touch || touch.id !== event.pointerId) return;
    touchRef.current = null;
    if (!touch.dragging) return;
    suppressClickUntil.current = Date.now() + 500;
    if (cancelled || !boardRef.current) return;
    const board = boardRef.current;
    const rect = board.getBoundingClientRect();
    const to = squareAtPoint(event.clientX, event.clientY, {
      left: rect.left + board.clientLeft, top: rect.top + board.clientTop,
      width: board.clientWidth, height: board.clientHeight,
    }, solvingColor === 'b');
    if (to) attemptMove(touch.from, to);
    else setSelected(null);
  }
  function select(square: Square) {
    if (solved || revealed || pendingPromotion) return;
    if (game.get(square)?.color === solvingColor) { setSelected(square); return; }
    if (!selected) return;
    attemptMove(selected, square);
  }
  function attemptMove(from: Square, to: Square, promotion?: PuzzlePromotion) {
    if (solved || revealed) return;
    const promotions = game.moves({ square: from, verbose: true }).filter(move => move.to === to && move.promotion);
    if (promotions.length && !promotion) {
      setPendingPromotion({ from, to }); setSelected(null); setMessage('Choose the piece your pawn will become.'); return;
    }
    setPendingPromotion(null);
    const attempt = tryPuzzleMove(puzzle.fen, from, to, promotion);
    setMoveError('');
    setSelected(null);
    if (!attempt) { setMessage('That move is not legal. Choose your piece again.'); return; }
    if (!attempt.solved) { recordAttempt(false); setMessage('A legal move, but there is a mate in one. Try again.'); return; }
    recordAttempt(true);
    setFen(attempt.fen); setLastMove({ from, to }); setMoveText(''); setSolved(true); setMessage(puzzle.explanation);
    if (!completed.includes(puzzle.id)) {
      const updated = [...completed, puzzle.id];
      setCompleted(updated);
      try { saveCompleted(window.localStorage, updated); } catch { /* Storage may be disabled. */ }
    }
  }
  function openExercise(nextIndex: number) {
    setPendingPromotion(null); setMoveText(''); setMoveError(''); setLastMove(null); setIndex(nextIndex); setFen(puzzles[nextIndex].fen); setSelected(null); setSolved(false); setRevealed(false); setHint(false);
    setMessage('Select a piece, then its destination.');
  }
  return <section className="analysis-workspace panel" aria-label="Learn chess">
    <div className="analysis-heading"><div><span className="eyebrow">ONE MOVE, ONE IDEA</span><h2>Learn</h2></div><button onClick={onClose}>Back to Play</button></div>
    <div className="analysis-layout"><div ref={boardRef} className="board analysis-board lesson-board" role="group" aria-label="Puzzle board. Arrow keys move between squares. Enter selects a piece or destination. Escape clears your selection.">
      {Array.from({ length: 64 }, (_, i) => {
        const file = solvingColor === 'w' ? i % 8 : 7 - i % 8;
        const rank = solvingColor === 'w' ? 8 - Math.floor(i / 8) : Math.floor(i / 8) + 1;
        const square = `${'abcdefgh'[file]}${rank}` as Square;
        const piece = game.get(square);
        return <button key={square}
          draggable={!solved && !revealed && !pendingPromotion && piece?.color === solvingColor}
          onDragStart={event => { setSelected(square); event.dataTransfer.setData('text/plain', square); event.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={event => { if (!solved && !revealed && !pendingPromotion) event.preventDefault(); }}
          onDrop={event => {
            event.preventDefault();
            if (pendingPromotion) return;
            const from = event.dataTransfer.getData('text/plain');
            if (/^[a-h][1-8]$/.test(from)) attemptMove(from as Square, square);
          }}
          onPointerDown={event => {
            if (event.pointerType === 'mouse' || solved || revealed || pendingPromotion || piece?.color !== solvingColor) return;
            touchRef.current = { id: event.pointerId, from: square, x: event.clientX, y: event.clientY, dragging: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const touch = touchRef.current;
            if (!touch || touch.id !== event.pointerId || Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 8) return;
            touch.dragging = true; setSelected(touch.from);
          }}
          onPointerUp={event => touchEnd(event)} onPointerCancel={event => touchEnd(event, true)} onLostPointerCapture={event => touchEnd(event, true)}
          tabIndex={i === focusIndex ? 0 : -1} onFocus={() => setFocusIndex(i)} onKeyDown={event => {
          if (event.key === 'Escape') { setSelected(null); return; }
          const next = boardFocusIndex(i, event.key, event.ctrlKey || event.metaKey);
          if (next === null) return;
          event.preventDefault();
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button.square')[next]?.focus();
        }} onClick={event => { if (event.detail === 0 || Date.now() >= suppressClickUntil.current) select(square); }} aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'White' : 'Black'} ${({ k:'king', q:'queen', r:'rook', b:'bishop', n:'knight', p:'pawn' })[piece.type]}` : ''}`} aria-pressed={selected === square} aria-disabled={solved || revealed || !!pendingPromotion} aria-description={legal.includes(square) ? 'Legal destination' : undefined} className={`square ${(file + rank) % 2 === 0 ? 'light' : 'dark'} ${lastMove && (lastMove.from === square || lastMove.to === square) ? 'last-move' : ''} ${game.isCheck() && piece?.type === 'k' && piece.color === game.turn() ? 'in-check' : ''} ${selected === square ? 'active' : ''} ${legal.includes(square) ? 'target' : ''}`}><span className={`piece ${piece?.color === 'w' ? 'white-piece' : 'black-piece'}`}>{piece ? glyphs[piece.color + piece.type] : ''}</span>{i % 8 === 0 && <span className="rank">{rank}</span>}{i >= 56 && <span className="file">{square[0]}</span>}</button>;
      })}
    </div><div className="analysis-tools lesson-copy"><span className="eyebrow">EXERCISE {index + 1} OF {puzzles.length}</span><p aria-label="Exercise progress">{completed.length} of {puzzles.length} exercises completed{completed.length === puzzles.length ? ' · All complete' : ''}</p><progress value={completed.length} max={puzzles.length} aria-label="Completed exercises" /><p className="lesson-streak" role="status">Streak <strong>{streak.current}</strong> · Best <strong>{streak.best}</strong></p><small>Solve different exercises in a row. An incorrect legal move or revealed solution resets your streak; hints are welcome. Best is saved on this device.</small><label htmlFor="learn-exercise">CHOOSE AN EXERCISE</label><select id="learn-exercise" value={index} onChange={event => openExercise(Number(event.target.value))}>{puzzles.map((item, i) => <option key={item.id} value={i}>{i + 1}. {item.title}{completed.includes(item.id) ? ' · Completed' : ''}</option>)}</select><h3>{puzzle.title}{completed.includes(puzzle.id) && <span className="lesson-completed"> ✓ Completed</span>}</h3><p>{sideName} to move · Checkmate in one</p><p role="status" className={solved || revealed ? 'lesson-success' : ''}>{message}</p>{pendingPromotion && <fieldset className="lesson-promotion"><legend>Promote your pawn</legend><div className="promotion-options">{(['q', 'r', 'b', 'n'] as const).map((piece, i) => <button key={piece} autoFocus={i === 0} aria-label={`Promote to ${{ q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }[piece]}`} onClick={() => attemptMove(pendingPromotion.from, pendingPromotion.to, piece)}>{glyphs[solvingColor + piece]}</button>)}</div><button onClick={() => { setPendingPromotion(null); setMessage('Select a piece, then its destination.'); }}>Cancel promotion</button></fieldset>}<form className="lesson-move-input" onSubmit={event => {
        event.preventDefault();
        if (solved || revealed || pendingPromotion) return;
        try {
          const move = resolveMoveText(game, moveText);
          attemptMove(move.from, move.to, move.promotion as PuzzlePromotion | undefined);
        } catch (cause) { setMoveError((cause as Error).message); }
      }}><label htmlFor="lesson-move">OR TYPE YOUR MOVE</label><input id="lesson-move" value={moveText} disabled={solved || revealed || !!pendingPromotion} onChange={event => { setMoveText(event.target.value); setMoveError(''); }} placeholder="Qg7 or g6g7" autoComplete="off" autoCapitalize="off" spellCheck={false} aria-invalid={!!moveError} aria-describedby={moveError ? 'lesson-move-error' : 'lesson-move-help'} /><button disabled={solved || revealed || !!pendingPromotion || !moveText.trim()} type="submit">Try move</button><small id="lesson-move-help">Use chess notation or starting and destination squares. For promotion, include the piece: g7g8r or g8=R.</small>{moveError && <p id="lesson-move-error" role="alert" className="analysis-error">{moveError}</p>}</form>{!solved && !revealed && !pendingPromotion && <button onClick={() => setHint(true)}>Show a hint</button>}{hint && !solved && !revealed && !pendingPromotion && <><p>{puzzle.hint}</p><button onClick={() => {
        recordAttempt(false);
        const solution = puzzleSolution(puzzle);
        setFen(solution.fen); setLastMove(solution); setSelected(null); setRevealed(true);
        setMessage(`${solution.san} · ${puzzle.explanation} Restart to solve this exercise yourself; viewing the solution does not mark it complete.`);
      }}>Show the solution</button></>}{(solved || revealed) && <button onClick={() => openExercise(nextExerciseIndex(puzzles.map(item => item.id), completed, index))}>{completed.length === puzzles.length ? 'Review another exercise' : 'Next unfinished exercise'} →</button>}<button onClick={() => openExercise(index)}>Restart exercise</button><small>Drag a piece or select its destination · Arrow keys explore · Enter selects · Escape clears selection.</small><small>Progress is saved on this device when browser storage is available. Original teaching positions. Take your time; incorrect moves leave the position ready for another try.</small></div></div>
  </section>;
}
