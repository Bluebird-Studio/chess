import { useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { readReplay } from './replay';

const pieces: Record<string, string> = { wk:'♔', wq:'♕', wr:'♖', wb:'♗', wn:'♘', wp:'♙', bk:'♚', bq:'♛', br:'♜', bb:'♝', bn:'♞', bp:'♟' };
export function Analyze({ pgn, onClose }: { pgn: string; onClose: () => void }) {
  const [replay, setReplay] = useState(() => readReplay(pgn || new Chess().fen()));
  const [ply, setPly] = useState(replay.moves.length);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);
  const game = useMemo(() => new Chess(replay.positions[ply]), [replay, ply]);
  function importGame() {
    try { const next = readReplay(source); setReplay(next); setPly(0); setError(''); }
    catch (cause) { setError((cause as Error).message); }
  }
  return <section className="analysis-workspace panel" aria-label="Analyze game">
    <div className="analysis-heading"><div><span className="eyebrow">EXPLORE THE POSITION</span><h2>Analyze</h2></div><button onClick={onClose}>Back to Play</button></div>
    <p>Replay moves and import your own games. Your Play game stays at its current position.</p>
    <div className="analysis-layout"><div>
      <div className="board analysis-board" role="img" aria-label={`Position after ${ply} half-moves. ${game.turn() === 'w' ? 'White' : 'Black'} to move. FEN: ${game.fen()}`}>
        {Array.from({ length: 64 }, (_, i) => {
          const file = flipped ? 7 - i % 8 : i % 8;
          const rank = flipped ? Math.floor(i / 8) + 1 : 8 - Math.floor(i / 8);
          const sq = `${'abcdefgh'[file]}${rank}` as Square;
          const piece = game.get(sq);
          return <div key={sq} className={`square ${(file + rank) % 2 === 0 ? 'light' : 'dark'}`}><span className={`piece ${piece?.color === 'w' ? 'white-piece' : 'black-piece'}`}>{piece ? pieces[piece.color + piece.type] : ''}</span>{i % 8 === 0 && <span className="rank">{rank}</span>}{i >= 56 && <span className="file">{sq[0]}</span>}</div>;
        })}
      </div>
      <div className="replay-controls" aria-label="Replay navigation">
        <button disabled={ply === 0} onClick={() => setPly(0)} aria-label="First position">|←</button>
        <button disabled={ply === 0} onClick={() => setPly(ply - 1)} aria-label="Previous move">←</button>
        <span role="status">{ply === 0 ? 'Starting position' : `${ply} / ${replay.moves.length} · ${replay.moves[ply - 1]}`}</span>
        <button disabled={ply === replay.moves.length} onClick={() => setPly(ply + 1)} aria-label="Next move">→</button>
        <button disabled={ply === replay.moves.length} onClick={() => setPly(replay.moves.length)} aria-label="Last position">→|</button>
      </div><button onClick={() => setFlipped(!flipped)}>Flip board</button>
    </div><div className="analysis-tools">
      <h3>Moves</h3><div className="replay-moves">{replay.moves.length ? replay.moves.map((move, i) => <button key={i} aria-current={ply === i + 1 ? 'step' : undefined} onClick={() => setPly(i + 1)}>{i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}{move}</button>) : <p>No moves in this position.</p>}</div>
      <label htmlFor="analysis-import">IMPORT PGN OR FEN</label><textarea id="analysis-import" value={source} onChange={event => setSource(event.target.value)} placeholder="Paste a game or position…" spellCheck={false}/><button onClick={importGame}>Import game</button>
      {error && <p role="alert" className="analysis-error">{error}</p>}
      <label htmlFor="analysis-fen">CURRENT POSITION · FEN</label><textarea id="analysis-fen" readOnly value={game.fen()} onFocus={event => event.target.select()} spellCheck={false}/>
      <label htmlFor="analysis-pgn">FULL GAME · PGN</label><textarea id="analysis-pgn" readOnly value={replay.pgn} onFocus={event => event.target.select()} spellCheck={false}/><small>Select an export field to copy it. Replay provides position review; engine evaluation is not included.</small>
    </div></div>
  </section>;
}
