import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { boardFocusIndex } from './board-input';
import { toggleAnnotation } from './annotations';
import { candidatePreview } from './candidate-preview';
import { materialBalance } from './material';
import { readReplay, readReplayFile, replayShortcut, replayStatus } from './replay';

const pieces: Record<string, string> = { wk:'♔', wq:'♕', wr:'♖', wb:'♗', wn:'♘', wp:'♙', bk:'♚', bq:'♛', br:'♜', bb:'♝', bn:'♞', bp:'♟' };
export function Analyze({ pgn, onClose }: { pgn: string; onClose: () => void }) {
  const [replay, setReplay] = useState(() => readReplay(pgn || new Chess().fen()));
  const [ply, setPly] = useState(replay.moves.length);
  const [playing, setPlaying] = useState(false);
  const [intervalMs, setIntervalMs] = useState(1500);
  function navigate(next: number) { setPlaying(false); setPreviewPly(0); setPly(next); }
  useEffect(() => {
    if (!playing) return;
    if (ply >= replay.moves.length) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setPly(current => Math.min(current + 1, replay.moves.length)), intervalMs);
    return () => window.clearTimeout(timer);
  }, [playing, ply, replay, intervalMs]);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [annotations, setAnnotations] = useState<Record<string, Square[]>>({});
  const [boardFocus, setBoardFocus] = useState(0);
  const game = useMemo(() => {
    const position = new Chess(replay.positions[0]);
    for (const move of replay.moves.slice(0, ply)) position.move(move);
    return position;
  }, [replay, ply]);
  const [candidate, setCandidate] = useState<string[]>([]);
  const [previewPly, setPreviewPly] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const worker = useRef<Worker | null>(null);
  function cancelSearch() {
    worker.current?.terminate(); worker.current = null; setSearching(false);
  }
  useEffect(() => {
    setCandidate([]); setPreviewPly(0); setSearchError(''); setSearching(false);
    return () => { worker.current?.terminate(); worker.current = null; };
  }, [game]);
  function findCandidate() {
    cancelSearch(); setPlaying(false); setCandidate([]); setPreviewPly(0); setSearchError('');
    try {
      const next = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
      worker.current = next; setSearching(true);
      next.onmessage = (event: MessageEvent<{ line?: string[]; error?: string }>) => {
        if (worker.current !== next) return;
        setCandidateSource(game.pgn()); setCandidate(event.data.line ?? []); setSearchError(event.data.error ?? ''); cancelSearch();
      };
      next.onerror = () => {
        if (worker.current !== next) return;
        setSearchError('Analysis is unavailable. Try again.'); cancelSearch();
      };
      next.postMessage(game.pgn());
    } catch { setSearchError('This browser could not start analysis.'); cancelSearch(); }
  }
  // Bind previews to their source position so navigation never applies a stale line.
  const [candidateSource, setCandidateSource] = useState('');
  const previewing = previewPly > 0 && candidateSource === game.pgn();
  const displayGame = useMemo(() => previewing ? candidatePreview(candidateSource, candidate, previewPly) : game, [game, candidateSource, candidate, previewPly, previewing]);
  const material = materialBalance(displayGame);
  const positionKey = displayGame.fen();
  const marked = annotations[positionKey] ?? [];
  function mark(square: Square) {
    setAnnotations(previous => toggleAnnotation(previous, positionKey, square));
  }
  const lastMove = previewing ? displayGame.history({ verbose: true }).at(-1) : replay.details[ply - 1];
  const positionStatus = replayStatus(displayGame);
  function download(format: 'pgn' | 'fen') {
    const text = format === 'pgn' ? replay.pgn : displayGame.fen();
    const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `chess-${format === 'fen' ? `position-${ply}${previewing ? `-candidate-${previewPly}` : ''}` : 'game'}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importGame() {
    setPlaying(false);
    try { const next = readReplay(source); setReplay(next); setPly(0); setAnnotations({}); setError(''); setImportNotice('Pasted game imported.'); }
    catch (cause) { setError((cause as Error).message); setImportNotice(''); }
  }
  async function importFile(file: File) {
    setPlaying(false); setImporting(true); setError(''); setImportNotice('Opening file…');
    try {
      const next = await readReplayFile(file);
      setReplay(next); setPly(0); setAnnotations({}); setImportNotice(`Imported ${file.name}.`);
    } catch (cause) { setError((cause as Error).message); setImportNotice(''); }
    finally { setImporting(false); }
  }
  return <section className="analysis-workspace panel" aria-label="Analyze game" onKeyDown={event => {
    const target = event.target as HTMLElement;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || target.closest('textarea, input, select, [contenteditable="true"], .analysis-board')) return;
    const next = replayShortcut(event.key, ply, replay.moves.length);
    if (next !== null) { event.preventDefault(); navigate(next); }
  }}>
    <div className="analysis-heading"><div><span className="eyebrow">EXPLORE THE POSITION</span><h2>Analyze</h2></div><button onClick={onClose}>Back to Play</button></div>
    <p>Replay moves and import your own games. Your Play game stays at its current position.</p>
    <div className="analysis-layout"><div>
      {previewing && <p className="candidate-preview-notice" role="status">Candidate preview · {candidate.slice(0, previewPly).join(' · ')}</p>}
      <div className="board analysis-board" role="group" aria-describedby="annotation-help" aria-label={`${previewing ? `Candidate preview, move ${previewPly}` : `Position after ${ply} half-moves`}. ${positionStatus}. FEN: ${displayGame.fen()}`}>
        {Array.from({ length: 64 }, (_, i) => {
          const file = flipped ? 7 - i % 8 : i % 8;
          const rank = flipped ? Math.floor(i / 8) + 1 : 8 - Math.floor(i / 8);
          const sq = `${'abcdefgh'[file]}${rank}` as Square;
          const piece = displayGame.get(sq);
          return <button type="button" key={sq} tabIndex={boardFocus === i ? 0 : -1} aria-pressed={marked.includes(sq)} aria-label={`${sq}, ${piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${{ k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }[piece.type]}` : 'empty'}`} onFocus={() => setBoardFocus(i)} onClick={() => mark(sq)} onContextMenu={event => { event.preventDefault(); mark(sq); }} onKeyDown={event => {
            const next = boardFocusIndex(i, event.key, event.ctrlKey || event.metaKey);
            if (next === null) return;
            event.preventDefault();
            const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
            buttons?.[next]?.focus();
          }} className={`square ${(file + rank) % 2 === 0 ? 'light' : 'dark'} ${marked.includes(sq) ? 'annotated' : ''} ${lastMove && (lastMove.from === sq || lastMove.to === sq) ? 'last-move' : ''} ${displayGame.isCheck() && piece?.type === 'k' && piece.color === displayGame.turn() ? 'in-check' : ''}`}><span className={`piece ${piece?.color === 'w' ? 'white-piece' : 'black-piece'}`}>{piece ? pieces[piece.color + piece.type] : ''}</span>{i % 8 === 0 && <span className="rank">{rank}</span>}{i >= 56 && <span className="file">{sq[0]}</span>}</button>;
        })}
      </div>
      <div className="annotation-controls"><small id="annotation-help">Click or tap squares to mark ideas. Keyboard: arrows explore, Enter / Space mark. Marks stay with this position during review.</small><button disabled={!marked.length} onClick={() => setAnnotations(previous => ({ ...previous, [positionKey]: [] }))}>Clear marks{marked.length ? ` (${marked.length})` : ''}</button></div>
      <div className="replay-controls" tabIndex={0} aria-label="Replay navigation. Use left and right arrows for moves, Home and End for first and last position.">
        <button disabled={ply === 0} onClick={() => navigate(0)} aria-label="First position">|←</button>
        <button disabled={ply === 0} onClick={() => navigate(ply - 1)} aria-label="Previous move">←</button>
        <span role="status">{ply === 0 ? 'Starting position' : `${ply} / ${replay.moves.length} · ${replay.details[ply - 1].label}`}</span>
        <button disabled={ply === replay.moves.length} onClick={() => navigate(ply + 1)} aria-label="Next move">→</button>
        <button disabled={ply === replay.moves.length} onClick={() => navigate(replay.moves.length)} aria-label="Last position">→|</button>
      </div><div className="replay-playback">
        <button disabled={!replay.moves.length || importing} aria-pressed={playing} onClick={() => {
          if (playing) { setPlaying(false); return; }
          setPreviewPly(0);
          if (ply >= replay.moves.length) setPly(0);
          setPlaying(true);
        }}>{playing ? 'Pause replay' : ply >= replay.moves.length ? 'Replay from start' : 'Play replay'}</button>
        <label htmlFor="replay-speed">Replay speed</label><select id="replay-speed" value={intervalMs} onChange={event => setIntervalMs(Number(event.target.value))}>
          <option value={3000}>Slow · 3 seconds</option><option value={1500}>Normal · 1.5 seconds</option><option value={750}>Fast · 0.75 seconds</option>
        </select>
      </div><p role="status">{positionStatus}</p><small>Arrow keys step through moves · Home / End jump to start / finish</small><button onClick={() => setFlipped(!flipped)}>Flip board</button>
    </div><div className="analysis-tools">
      <div className="material-summary">
        <h3>Material balance</h3><p role="status">{material.label}</p>
        <div className="material-bar" role="img" aria-label={`White ${material.white} points, Black ${material.black} points. ${material.label}.`}><span style={{ width: `${material.whitePercent}%` }} /></div>
        <div className="material-totals"><span>White · {material.white}</span><span>Black · {material.black}</span></div>
        <small>Piece values: pawn 1, knight / bishop 3, rook 5, queen 9. Material alone does not measure position quality or predict the result.</small>
      </div>
      <h3>Candidate line</h3><p>A short continuation from our original alpha-beta engine. This bounded search can miss tactics; it is not a precise evaluation.</p>
      <button disabled={game.isGameOver() || importing} onClick={searching ? cancelSearch : findCandidate}>{searching ? 'Cancel search' : 'Find a candidate'}</button>
      <p role="status">{searching ? 'Searching this position…' : candidate.length ? candidate.join(' · ') : game.isGameOver() ? 'Game over · no continuation.' : 'Choose a position, then search for an idea.'}</p>
      {searchError && <p role="alert" className="analysis-error">{searchError}</p>}
      {candidate.length > 0 && <div className="candidate-preview"><div className="analysis-exports" aria-label="Preview candidate moves">{candidate.map((san, i) => <button key={i} aria-pressed={previewing && previewPly === i + 1} onClick={() => { setPlaying(false); setPreviewPly(i + 1); }}>{i + 1} · {san}</button>)}</div><button disabled={!previewing} onClick={() => setPreviewPly(0)}>Return to game position</button><small role="status">{previewing ? `Previewing candidate move ${previewPly} of ${candidate.length}. Your game is unchanged.` : 'Select a candidate move to preview its position.'}</small></div>}
      <h3>Moves</h3><div className="replay-moves">{replay.moves.length ? replay.moves.map((_, i) => <button key={i} aria-current={ply === i + 1 ? 'step' : undefined} onClick={() => navigate(i + 1)}>{replay.details[i].label}</button>) : <p>No moves in this position.</p>}</div>
      <label htmlFor="analysis-file">OPEN A PGN OR FEN FILE</label><input id="analysis-file" type="file" accept=".pgn,.fen,.txt" disabled={importing} aria-describedby="analysis-file-help" onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void importFile(file);
      }}/><small id="analysis-file-help">One game or position, up to 1 MB. Files stay on your device.</small>
      <p role="status">{importNotice}</p>
      <label htmlFor="analysis-import">OR PASTE PGN OR FEN</label><textarea id="analysis-import" value={source} onChange={event => setSource(event.target.value)} placeholder="Paste a game or position…" spellCheck={false}/><button disabled={importing} onClick={importGame}>Import game</button>
      {error && <p role="alert" className="analysis-error">{error}</p>}
      <label htmlFor="analysis-fen">{previewing ? 'CANDIDATE PREVIEW · FEN' : 'CURRENT POSITION · FEN'}</label><textarea id="analysis-fen" readOnly value={displayGame.fen()} onFocus={event => event.target.select()} spellCheck={false}/>
      <label htmlFor="analysis-pgn">FULL GAME · PGN</label><textarea id="analysis-pgn" readOnly value={replay.pgn} onFocus={event => event.target.select()} spellCheck={false}/><div className="analysis-exports"><button onClick={() => download('pgn')}>Download PGN</button><button onClick={() => download('fen')}>Download FEN</button></div><small>Select an export field to copy it. Replay provides position review; engine evaluation is not included.</small>
    </div></div>
  </section>;
}
