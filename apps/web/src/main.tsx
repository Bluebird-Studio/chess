import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { RotateCcw, Undo2, Crown, ArrowLeftRight, Volume2, VolumeX, Flag, Handshake } from 'lucide-react';
import { selectBotMove, type BotLevel } from '@bluebird/chess-engine';
import './style.css';

const glyphs: Record<string, string> = {
  wk:'♔', wq:'♕', wr:'♖', wb:'♗', wn:'♘', wp:'♙',
  bk:'♚', bq:'♛', br:'♜', bb:'♝', bn:'♞', bp:'♟',
};
const files = 'abcdefgh';
const levels: { id: BotLevel; name: string; description: string }[] = [
  { id:'random', name:'The Beginner', description:'An unpredictable first opponent' },
  { id:'greedy', name:'The Collector', description:'Loves winning material' },
  { id:'minimax', name:'The Thinker', description:'Looks a few moves ahead' },
];
type Promotion = { from: Square; to: Square; color: 'w' | 'b' };
const promotionPieces: PieceSymbol[] = ['q','r','b','n'];
function copyGame(game: Chess): Chess {
  const next = new Chess();
  next.loadPgn(game.pgn());
  return next;
}
function App() {
  const [game, setGame] = useState(() => new Chess());
  const [selected, setSelected] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<'local' | 'bot'>('local');
  const [level, setLevel] = useState<BotLevel>('random');
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [sound, setSound] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const history = game.history({ verbose: true });
  const lastMove = history.at(-1);
  const botTurn = mode === 'bot' && game.turn() === 'b' && !game.isGameOver() && !result;
  const canInteract = !botTurn && !game.isGameOver() && !result && !promotion;
  const legal = useMemo(() => selected ? game.moves({ square: selected, verbose: true }).map(m => m.to) : [], [game, selected]);
  const squares = Array.from({length: 64}, (_, i) => {
    const rank = flipped ? Math.floor(i / 8) + 1 : 8 - Math.floor(i / 8);
    const file = files[flipped ? 7 - i % 8 : i % 8];
    return `${file}${rank}` as Square;
  });
  const status = result || (game.isCheckmate()
    ? `Checkmate · ${game.turn() === 'w' ? 'Black' : 'White'} wins`
    : game.isDraw() ? 'Game drawn'
    : game.isCheck() ? `Check · ${game.turn() === 'w' ? 'White' : 'Black'} to move`
    : `${game.turn() === 'w' ? 'White' : 'Black'} to move`);

  function playSound() {
    if (!sound) return;
    try {
      const ctx = audioRef.current ?? new AudioContext();
      audioRef.current = ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 540;
      gain.gain.setValueAtTime(0.045, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.1);
    } catch { /* Sound is optional; the game remains playable without audio. */ }
  }
  useEffect(() => {
    if (!botTurn) return;
    const id = window.setTimeout(() => {
      const next = copyGame(game);
      const move = selectBotMove(next, level);
      if (move) next.move(move);
      setGame(next);
      playSound();
    }, 300);
    return () => window.clearTimeout(id);
    // Sound setting is read for the next move, without restarting bot search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, mode, level, botTurn]);

  function reset() {
    setGame(new Chess());
    setSelected(null);
    setPromotion(null);
    setResult(null);
  }
  function undo() {
    if (botTurn || !history.length) return;
    const next = copyGame(game);
    next.undo();
    if (mode === 'bot' && next.history().length > 0) next.undo();
    setGame(next);
    setSelected(null);
    setPromotion(null);
    setResult(null);
  }
  function commitMove(from: Square, to: Square, piece: PieceSymbol = 'q') {
    const next = copyGame(game);
    try { next.move({ from, to, promotion: piece }); }
    catch { return; }
    setGame(next);
    setSelected(null);
    setPromotion(null);
    playSound();
  }
  function attemptMove(from: Square, to: Square) {
    if (!canInteract) return;
    const legalMoves = game.moves({ square: from, verbose: true });
    if (!legalMoves.some(m => m.to === to)) return;
    const moving = game.get(from);
    if (moving?.type === 'p' && (to.endsWith('8') || to.endsWith('1'))) {
      setPromotion({ from, to, color: moving.color });
      return;
    }
    commitMove(from, to);
  }
  function click(sq: Square) {
    if (!canInteract) return;
    const piece = game.get(sq);
    if (selected && legal.includes(sq)) { attemptMove(selected, sq); return; }
    setSelected(piece?.color === game.turn() ? sq : null);
  }
  function onDrop(event: React.DragEvent<HTMLButtonElement>, to: Square) {
    event.preventDefault();
    const from = event.dataTransfer.getData('text/plain') as Square;
    if (from && /^[a-h][1-8]$/.test(from)) attemptMove(from, to);
  }
  function onBoardKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = ({ ArrowLeft:-1, ArrowRight:1, ArrowUp:-8, ArrowDown:8 } as Record<string, number>)[event.key];
    if (step === undefined) return;
    const next = index + step;
    if (next < 0 || next >= 64 || (Math.abs(step) === 1 && Math.floor(next / 8) !== Math.floor(index / 8))) return;
    event.preventDefault();
    const cells = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button.square');
    cells?.[next]?.focus();
  }
  const checkedKing = game.isCheck()
    ? game.board().flat().find(p => p?.type === 'k' && p.color === game.turn())?.square
    : null;
  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="brandmark">♞</span><span>BLUEBIRD <strong>CHESS</strong></span></div>
      <span className="topright">THE ART OF THE GAME <span className="dot"/></span>
    </header>
    <main className="layout">
      <section className="board-column">
        <div className="eyebrow">THE CLASSIC GAME, REIMAGINED</div>
        <h1>Make your <em>move.</em></h1>
        <p className="lead">A timeless game. A beautiful place to play.</p>
        <div className="player">
          <span className="avatar dark">♚</span>
          <div><b>{mode === 'bot' ? levels.find(x => x.id === level)?.name : 'Black pieces'}</b><small>{mode === 'bot' ? 'Computer opponent' : 'Local player'}</small></div>
          <span className="player-side">BLACK</span>
        </div>
        <div className="board" role="group" aria-label="Chessboard. Select a piece, then its destination. Arrow keys move focus.">
          {squares.map((sq, i) => {
            const piece = game.get(sq);
            const isLight = (files.indexOf(sq[0]) + Number(sq[1])) % 2 === 0;
            const active = selected === sq;
            const target = legal.includes(sq);
            const last = lastMove?.from === sq || lastMove?.to === sq;
            const check = checkedKing === sq;
            return <button type="button" key={sq}
              aria-label={`${sq}, ${piece ? `${piece.color === 'w' ? 'white' : 'black'} ${({p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'} as Record<string,string>)[piece.type]}` : 'empty'}${target ? ', legal destination' : ''}${check ? ', king in check' : ''}`}
              aria-pressed={active} onClick={() => click(sq)} onKeyDown={e => onBoardKey(e, i)}
              draggable={canInteract && piece?.color === game.turn()}
              onDragStart={e => { setSelected(sq); e.dataTransfer.setData('text/plain', sq); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={e => e.preventDefault()} onDrop={e => onDrop(e, sq)}
              className={`square ${isLight ? 'light' : 'dark'} ${active ? 'active' : ''} ${target ? 'target' : ''} ${last ? 'last-move' : ''} ${check ? 'in-check' : ''}`}>
              <span className={`piece ${piece?.color === 'w' ? 'white-piece' : 'black-piece'}`}>{piece ? glyphs[piece.color + piece.type] : ''}</span>
              {i % 8 === 0 && <span className="rank">{sq[1]}</span>}
              {Math.floor(i / 8) === 7 && <span className="file">{sq[0]}</span>}
            </button>;
          })}
        </div>
        <div className="player"><span className="avatar light-avatar">♔</span><div><b>White pieces</b><small>{mode === 'bot' ? 'You' : 'Local player'}</small></div><span className="player-side">WHITE</span></div>
      </section>
      <aside className="sidebar">
        <div className="panel">
          <span className="eyebrow">YOUR TABLE</span><h2>Play chess</h2><p>Choose your game, then settle in.</p>
          <div className="segmented" aria-label="Game mode">
            <button aria-pressed={mode === 'local'} className={mode === 'local' ? 'chosen' : ''} onClick={() => { setMode('local'); reset(); }}>Two players</button>
            <button aria-pressed={mode === 'bot'} className={mode === 'bot' ? 'chosen' : ''} onClick={() => { setMode('bot'); reset(); }}>Play a bot</button>
          </div>
          {mode === 'bot' && <div className="bot-select"><label htmlFor="bot">CHOOSE YOUR OPPONENT</label>
            <select id="bot" value={level} onChange={e => { setLevel(e.target.value as BotLevel); reset(); }}>{levels.map(l => <option value={l.id} key={l.id}>{l.name}</option>)}</select>
            <small>{levels.find(l => l.id === level)?.description}</small>
          </div>}
          <div className="status" role="status" aria-live="polite"><span className="status-dot"/><span>{botTurn ? 'Computer is thinking…' : status}</span></div>
          <div className="actions">
            <button onClick={undo} disabled={!history.length || botTurn}><Undo2 size={17}/> Undo</button>
            <button onClick={() => setFlipped(!flipped)}><ArrowLeftRight size={17}/> Flip</button>
            <button onClick={reset}><RotateCcw size={17}/> New game</button>
            <button aria-pressed={sound} onClick={() => setSound(!sound)}>{sound ? <Volume2 size={17}/> : <VolumeX size={17}/>} Sound {sound ? 'on' : 'off'}</button>
          </div>
          {!game.isGameOver() && !result && history.length > 0 && <div className="end-actions">
            <button onClick={() => setResult(`${game.turn() === 'w' ? 'White' : 'Black'} resigned · ${game.turn() === 'w' ? 'Black' : 'White'} wins`)}><Flag size={15}/> Resign</button>
            <button onClick={() => setResult('Draw by agreement')}><Handshake size={15}/> Agree draw</button>
          </div>}
          {(game.isGameOver() || result) && <div className="game-over"><Crown size={20}/><b>{status}</b><button onClick={reset}>Play again</button></div>}
        </div>
        <div className="panel moves"><div className="moves-heading"><span className="eyebrow">THE STORY SO FAR</span><Crown size={17}/></div><h2>Move history</h2>
          {!history.length ? <p className="empty">Every great game begins with a first move.</p> :
            <div className="move-list">{Array.from({length: Math.ceil(history.length / 2)}, (_, i) => <div className="move-row" key={i}><span>{i + 1}.</span><b>{history[2 * i]?.san}</b><b>{history[2 * i + 1]?.san || '—'}</b></div>)}</div>}
        </div>
        <footer>BLUEBIRD STUDIO <span>EST. 2026</span></footer>
      </aside>
    </main>
    {promotion && <div className="modal-backdrop" onClick={() => setPromotion(null)}>
      <div className="promotion-dialog" role="dialog" aria-modal="true" aria-labelledby="promotion-title" onClick={e => e.stopPropagation()}>
        <span className="eyebrow">YOUR MOVE</span><h2 id="promotion-title">Choose a promotion</h2>
        <p>What should your pawn become?</p>
        <div className="promotion-options">{promotionPieces.map(p => <button key={p} aria-label={`Promote to ${({q:'queen',r:'rook',b:'bishop',n:'knight'} as Record<string,string>)[p]}`} onClick={() => commitMove(promotion.from, promotion.to, p)}>{glyphs[promotion.color + p]}</button>)}</div>
        <button className="cancel-promotion" onClick={() => setPromotion(null)}>Cancel</button>
      </div>
    </div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
