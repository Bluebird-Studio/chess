import { useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { boardFocusIndex } from './board-input';
import { toggleAnnotation } from './annotations';
import { readReplay, readReplayFile, replayShortcut, replayStatus } from './replay';

const pieces: Record<string, string> = { wk:'♔', wq:'♕', wr:'♖', wb:'♗', wn:'♘', wp:'♙', bk:'♚', bq:'♛', br:'♜', bb:'♝', bn:'♞', bp:'♟' };
export function Analyze({ pgn, onClose }: { pgn: string; onClose: () => void }) {
  const [replay, setReplay] = useState(() => readReplay(pgn || new Chess().fen()));
  const [ply, setPly] = useState(replay.moves.length);
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
  const positionKey = game.fen();
  const marked = annotations[positionKey] ?? [];
  function mark(square: Square) {
    setAnnotations(previous => toggleAnnotation(previous, positionKey, square));
  }
  const lastMove = replay.details[ply - 1];
  const positionStatus = replayStatus(game);
  function download(format: 'pgn' | 'fen') {
    const text = format === 'pgn' ? replay.pgn : game.fen();
    const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `chess-${format === 'fen' ? `position-${ply}` : 'game'}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importGame() {
    try { const next = readReplay(source); setReplay(next); setPly(0); setAnnotations({}); setError(''); setImportNotice('Pasted game imported.'); }
    catch (cause) { setError((cause as Error).message); setImportNotice(''); }
  }
  async function importFile(file: File) {
    setImporting(true); setError(''); setImportNotice('Opening file…');
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
    if (next !== null) { event.preventDefault(); setPly(next); }
  }}>
    <div className="analysis-heading"><div><span className="eyebrow">EXPLORE THE POSITION</span><h2>Analyze</h2></div><button onClick={onClose}>Back to Play</button></div>
    <p>Replay moves and import your own games. Your Play game stays at its current position.</p>
    <div className="analysis-layout"><div>
      <div className="board analysis-board" role="group" aria-describedby="annotation-help" aria-label={`Position after ${ply} half-moves. ${positionStatus}. FEN: ${game.fen()}`}>
        {Array.from({ length: 64 }, (_, i) => {
          const file = flipped ? 7 - i % 8 : i % 8;
          const rank = flipped ? Math.floor(i / 8) + 1 : 8 - Math.floor(i / 8);
          const sq = `${'abcdefgh'[file]}${rank}` as Square;
          const piece = game.get(sq);
          return <button type="button" key={sq} tabIndex={boardFocus === i ? 0 : -1} aria-pressed={marked.includes(sq)} aria-label={`${sq}, ${piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${{ k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }[piece.type]}` : 'empty'}`} onFocus={() => setBoardFocus(i)} onClick={() => mark(sq)} onContextMenu={event => { event.preventDefault(); mark(sq); }} onKeyDown={event => {
            const next = boardFocusIndex(i, event.key, event.ctrlKey || event.metaKey);
            if (next === null) return;
            event.preventDefault();
            const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
            buttons?.[next]?.focus();
          }} className={`square ${(file + rank) % 2 === 0 ? 'light' : 'dark'} ${marked.includes(sq) ? 'annotated' : ''} ${lastMove && (lastMove.from === sq || lastMove.to === sq) ? 'last-move' : ''} ${game.isCheck() && piece?.type === 'k' && piece.color === game.turn() ? 'in-check' : ''}`}><span className={`piece ${piece?.color === 'w' ? 'white-piece' : 'black-piece'}`}>{piece ? pieces[piece.color + piece.type] : ''}</span>{i % 8 === 0 && <span className="rank">{rank}</span>}{i >= 56 && <span className="file">{sq[0]}</span>}</button>;
        })}
      </div>
      <div className="annotation-controls"><small id="annotation-help">Click or tap squares to mark ideas. Keyboard: arrows explore, Enter / Space mark. Marks stay with this position during review.</small><button disabled={!marked.length} onClick={() => setAnnotations(previous => ({ ...previous, [positionKey]: [] }))}>Clear marks{marked.length ? ` (${marked.length})` : ''}</button></div>
      <div className="replay-controls" tabIndex={0} aria-label="Replay navigation. Use left and right arrows for moves, Home and End for first and last position.">
        <button disabled={ply === 0} onClick={() => setPly(0)} aria-label="First position">|←</button>
        <button disabled={ply === 0} onClick={() => setPly(ply - 1)} aria-label="Previous move">←</button>
        <span role="status">{ply === 0 ? 'Starting position' : `${ply} / ${replay.moves.length} · ${lastMove.label}`}</span>
        <button disabled={ply === replay.moves.length} onClick={() => setPly(ply + 1)} aria-label="Next move">→</button>
        <button disabled={ply === replay.moves.length} onClick={() => setPly(replay.moves.length)} aria-label="Last position">→|</button>
      </div><p role="status">{positionStatus}</p><small>Arrow keys step through moves · Home / End jump to start / finish</small><button onClick={() => setFlipped(!flipped)}>Flip board</button>
    </div><div className="analysis-tools">
      <h3>Moves</h3><div className="replay-moves">{replay.moves.length ? replay.moves.map((_, i) => <button key={i} aria-current={ply === i + 1 ? 'step' : undefined} onClick={() => setPly(i + 1)}>{replay.details[i].label}</button>) : <p>No moves in this position.</p>}</div>
      <label htmlFor="analysis-file">OPEN A PGN OR FEN FILE</label><input id="analysis-file" type="file" accept=".pgn,.fen,.txt" disabled={importing} aria-describedby="analysis-file-help" onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void importFile(file);
      }}/><small id="analysis-file-help">One game or position, up to 1 MB. Files stay on your device.</small>
      <p role="status">{importNotice}</p>
      <label htmlFor="analysis-import">OR PASTE PGN OR FEN</label><textarea id="analysis-import" value={source} onChange={event => setSource(event.target.value)} placeholder="Paste a game or position…" spellCheck={false}/><button disabled={importing} onClick={importGame}>Import game</button>
      {error && <p role="alert" className="analysis-error">{error}</p>}
      <label htmlFor="analysis-fen">CURRENT POSITION · FEN</label><textarea id="analysis-fen" readOnly value={game.fen()} onFocus={event => event.target.select()} spellCheck={false}/>
      <label htmlFor="analysis-pgn">FULL GAME · PGN</label><textarea id="analysis-pgn" readOnly value={replay.pgn} onFocus={event => event.target.select()} spellCheck={false}/><div className="analysis-exports"><button onClick={() => download('pgn')}>Download PGN</button><button onClick={() => download('fen')}>Download FEN</button></div><small>Select an export field to copy it. Replay provides position review; engine evaluation is not included.</small>
    </div></div>
  </section>;
}
