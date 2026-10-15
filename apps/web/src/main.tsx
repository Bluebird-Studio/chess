import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { RotateCcw, Undo2, Crown, ArrowLeftRight, Volume2, VolumeX, Flag, Handshake, Copy, Wifi, WifiOff } from 'lucide-react';
import { selectBotMove, type BotLevel } from '@bluebird/chess-engine';
import { restoreOnlineGame } from './online-game';
import { remaining, switchClock, formatClock, type ClockState } from './clock';
import { boardFocusIndex, squareAtPoint } from './board-input';
import { inviteLink, inviteRoom, readSavedSeat } from './invite';
import './style.css';
import { Analyze } from './Analyze';
import { Learn } from './Learn';

const glyphs: Record<string, string> = {
  wk:'♔', wq:'♕', wr:'♖', wb:'♗', wn:'♘', wp:'♙',
  bk:'♚', bq:'♛', br:'♜', bb:'♝', bn:'♞', bp:'♟',
};
const files = 'abcdefgh';
const levels: { id: BotLevel; name: string; description: string }[] = [
  { id:'random', name:'The Beginner', description:'An unpredictable first opponent' },
  { id:'greedy', name:'The Collector', description:'Loves winning material' },
  { id:'positional', name:'The Strategist', description:'Evaluates material and piece placement' },
  { id:'minimax', name:'The Thinker', description:'Looks a few moves ahead' },
  { id:'alphabeta', name:'The Tactician', description:'Bounded iterative alpha-beta search' },
];
type Promotion = { from: Square; to: Square; color: 'w' | 'b' };
const promotionPieces: PieceSymbol[] = ['q','r','b','n'];
function copyGame(game: Chess): Chess {
  const next = new Chess();
  next.loadPgn(game.pgn());
  return next;
}
function App() {
  const [learning, setLearning] = useState(false);
  const [analysisPgn, setAnalysisPgn] = useState<string | null>(null);
  const [invitedRoom] = useState(() => inviteRoom(window.location.href));
  const [savedSeat, setSavedSeat] = useState(() => {
    try { return readSavedSeat(sessionStorage.getItem('bluebird:last-seat')); } catch { return null; }
  });
  const [timeControl, setTimeControl] = useState(0);
  const [clock, setClock] = useState<ClockState | null>(null);
  const clockHistory = useRef<ClockState[]>([]);
  const [now, setNow] = useState(Date.now);
  const [game, setGame] = useState(() => new Chess());
  const [selected, setSelected] = useState<Square | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<'local' | 'bot' | 'online'>(invitedRoom || savedSeat ? 'online' : 'local');
  const [level, setLevel] = useState<BotLevel>('random');
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [sound, setSound] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [roomInput, setRoomInput] = useState(invitedRoom ?? '');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [onlineColor, setOnlineColor] = useState<'w' | 'b' | null>(null);
  const [connection, setConnection] = useState<'offline' | 'connecting' | 'connected' | 'disconnected'>('offline');
  const [onlineNotice, setOnlineNotice] = useState('');
  const [onlineClocks, setOnlineClocks] = useState<{ w: number; b: number } | null>(null);
  const [drawOffer, setDrawOffer] = useState<'w' | 'b' | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [focusedSquare, setFocusedSquare] = useState<Square>('e2');
  const promotionRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const touchRef = useRef<{ id: number; from: Square; x: number; y: number; dragging: boolean } | null>(null);
  const suppressClickUntil = useRef(0);
  const [touchDrag, setTouchDrag] = useState<{ from: Square; x: number; y: number } | null>(null);

  useEffect(() => {
    touchRef.current = null; setTouchDrag(null);
  }, [game, mode, flipped, result, connection]);
  useEffect(() => {
    if (!promotion) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    promotionRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previousFocus?.focus();
  }, [promotion]);
  const onlineFen = useRef<string | null>(null);

  const history = game.history({ verbose: true });
  const lastMove = history.at(-1);
  const clockValues = clock ? remaining(clock, now) : null;
  const timedOut = mode !== 'online' && clockValues && clockValues[game.turn()] === 0;
  const botTurn = mode === 'bot' && game.turn() === 'b' && !game.isGameOver() && !result && !timedOut;
  const canInteract = !timedOut && !botTurn && !game.isGameOver() && !result && !promotion && (mode !== 'online' || (connection === 'connected' && onlineColor === game.turn()));
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

  useEffect(() => {
    if (!clock || result || game.isGameOver()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [clock, result, game]);
  useEffect(() => {
    if (timedOut && !result) setResult(`${game.turn() === 'w' ? 'Black' : 'White'} wins · time expired`);
  }, [timedOut, result, game]);
  function advanceClock() {
    if (!timeControl || mode === 'online') return;
    const timestamp = Date.now();
    const current = clock ?? { w: timeControl, b: timeControl, active: game.turn(), since: timestamp };
    if (remaining(current, timestamp)[game.turn()] === 0) { setNow(timestamp); return false; }
    clockHistory.current.push({ ...remaining(current, timestamp), active: current.active, since: timestamp });
    setClock(switchClock(current, timestamp)); setNow(timestamp);
    return true;
  }

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
      if (move) { if (advanceClock() === false) return; next.move(move); }
      setGame(next);
      playSound();
    }, 300);
    return () => window.clearTimeout(id);
    // Sound setting is read for the next move, without restarting bot search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, mode, level, botTurn]);

  useEffect(() => () => socketRef.current?.close(), []);

  function connectOnline(action: 'create' | 'join' | 'reconnect', requestedRoom?: string, reconnectToken?: string) {
    const previous = socketRef.current;
    socketRef.current = null;
    previous?.close();
    setSelected(null); setPromotion(null);
    setConnection('connecting'); setOnlineNotice('Connecting to the game server…');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.hostname}:8080`);
    socketRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify(action === 'create' ? { type: 'create' } : action === 'join' ? { type: 'join', roomId: requestedRoom } : { type: 'reconnect', roomId: requestedRoom, token: reconnectToken }));
    ws.onmessage = event => {
      if (socketRef.current !== ws) return;
      let data;
      try { data = JSON.parse(event.data); }
      catch { setOnlineNotice('The server sent an unreadable update. Reconnect to sync your game.'); return; }
      if (data.type === 'joined') {
        setClock(null); setOnlineClocks(null); setDrawOffer(null);
        setFlipped(data.color === 'b');
        setRoomId(data.roomId); setOnlineColor(data.color); setConnection('connected');
        if (data.token) {
          const seat = { roomId: data.roomId, color: data.color };
          setSavedSeat(seat);
          try {
            sessionStorage.setItem(`bluebird:${data.roomId}:${data.color}`, data.token);
            sessionStorage.setItem('bluebird:last-seat', JSON.stringify(seat));
          } catch { setOnlineNotice('Browser storage is unavailable. Keep this tab open to retain your seat.'); }
        }
        setGame(new Chess(data.fen)); setResult(null); setOnlineNotice(data.reconnected ? 'Reconnected. Your game is back in sync.' : data.color === 'w' ? 'Room ready. Share the code with your opponent.' : 'You joined the room as Black.');
      } else if (data.type === 'state') {
        try { setGame(restoreOnlineGame(data.fen, data.history)); }
        catch { setOnlineNotice('Game sync failed. Reconnect to restore the position.'); return; }
        setOnlineClocks(data.clocks ?? null); setDrawOffer(data.drawOffer ?? null);
        if (onlineFen.current !== data.fen) { setSelected(null); setPromotion(null); }
        onlineFen.current = data.fen;
        setResult(data.result ? `${data.result === 'draw' ? 'Draw' : `${data.result === 'white' ? 'White' : 'Black'} wins`}` : null);
        if (data.rematch) setOnlineNotice('Rematch started. White to move.');
      } else if (data.type === 'result') { setDrawOffer(null); setResult(data.winner === 'draw' ? `Draw · ${data.reason}` : `${data.winner === 'white' ? 'White' : 'Black'} wins · ${data.reason}`); }
      else if (data.type === 'draw_offered') setDrawOffer(data.color);
      else if (data.type === 'draw_declined') { setDrawOffer(null); setOnlineNotice('Draw offer declined.'); }
      else if (data.type === 'opponent_disconnected') setOnlineNotice('Opponent disconnected. Waiting for them to return…');
      else if (data.type === 'opponent_reconnected') setOnlineNotice('Opponent reconnected.');
      else if (data.type === 'rematch_requested') setOnlineNotice('Rematch requested. Waiting for the other player…');
      else if (data.type === 'error') { setOnlineNotice(data.message || 'Could not complete that action.'); setConnection(current => current === 'connecting' ? 'offline' : current); }
    };
    ws.onclose = () => {
      if (socketRef.current !== ws) return;
      setConnection(current => current === 'connected' ? 'disconnected' : 'offline');
      setOnlineNotice('Connection closed. Reconnect or try joining again.');
    };
    ws.onerror = () => {
      if (socketRef.current === ws) setOnlineNotice('Could not reach the game server. Check that it is running and try again.');
    };
  }

  function recoverSeat(id: string, color: 'w' | 'b' | null) {
    let token: string | null = null;
    try { token = sessionStorage.getItem(`bluebird:${id}:${color}`); } catch { /* Recovery is optional. */ }
    if (token) connectOnline('reconnect', id, token);
    else setOnlineNotice('This seat cannot be recovered in this browser. Create or join a room instead.');
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink(window.location.href, roomId!));
      setOnlineNotice('Invite link copied. Send it to your opponent.');
    } catch { setOnlineNotice(`Could not copy the invite. Share room code ${roomId} instead.`); }
  }
  function reset() {
    if (mode === 'online' || roomId) { const previous = socketRef.current; socketRef.current = null; previous?.close(); setRoomId(null); setOnlineColor(null); setConnection('offline'); setOnlineNotice('Create a room or enter an invite code to play online.'); }
    setOnlineClocks(null); setDrawOffer(null); onlineFen.current = null;
    setClock(null); clockHistory.current = [];
    setGame(new Chess());
    setSelected(null);
    setPromotion(null);
    setResult(null);
  }
  function undo() {
    if (botTurn || !history.length) return;
    const next = copyGame(game);
    next.undo();
    let restoredClock = clockHistory.current.pop();
    if (mode === 'bot' && next.history().length > 0) { next.undo(); restoredClock = clockHistory.current.pop(); }
    setClock(restoredClock ? { ...restoredClock, since: Date.now() } : null); setNow(Date.now());
    setGame(next);
    setSelected(null);
    setPromotion(null);
    setResult(null);
  }
  function commitMove(from: Square, to: Square, piece: PieceSymbol = 'q') {
    if (mode === 'online') {
      socketRef.current?.send(JSON.stringify({ type: 'move', from, to, promotion: piece }));
      setSelected(null); setPromotion(null); return;
    }
    const next = copyGame(game);
    try { next.move({ from, to, promotion: piece }); }
    catch { return; }
    if (advanceClock() === false) return;
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
  function touchStart(event: React.PointerEvent<HTMLButtonElement>, from: Square) {
    if (event.pointerType === 'mouse' || !canInteract || game.get(from)?.color !== game.turn()) return;
    touchRef.current = { id: event.pointerId, from, x: event.clientX, y: event.clientY, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function touchMove(event: React.PointerEvent<HTMLButtonElement>) {
    const touch = touchRef.current;
    if (!touch || touch.id !== event.pointerId) return;
    if (!touch.dragging && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 8) return;
    touch.dragging = true;
    setSelected(touch.from);
    setTouchDrag({ from: touch.from, x: event.clientX, y: event.clientY });
  }
  function touchEnd(event: React.PointerEvent<HTMLButtonElement>, cancelled = false) {
    const touch = touchRef.current;
    if (!touch || touch.id !== event.pointerId) return;
    touchRef.current = null; setTouchDrag(null);
    if (!touch.dragging) return;
    suppressClickUntil.current = Date.now() + 500;
    if (cancelled) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const to = squareAtPoint(event.clientX, event.clientY, {
      left: rect.left + board.clientLeft, top: rect.top + board.clientTop,
      width: board.clientWidth, height: board.clientHeight,
    }, flipped);
    if (to) attemptMove(touch.from, to);
  }
  function onBoardKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = boardFocusIndex(index, event.key, event.ctrlKey || event.metaKey);
    if (next === null) return;
    event.preventDefault();
    const cells = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button.square');
    cells?.[next]?.focus();
  }
  function renderPlayer(color: 'w' | 'b') {
    const name = color === 'w' ? 'White' : 'Black';
    const isYou = mode === 'online' && onlineColor === color;
    const isBot = mode === 'bot' && color === 'b';
    return <div className={`player ${game.turn() === color && !result && !game.isGameOver() ? 'to-move' : ''}`}>
      <span className={`avatar ${color === 'w' ? 'light-avatar' : 'dark'}`}>{color === 'w' ? '♔' : '♚'}</span>
      <div><b>{isBot ? levels.find(x => x.id === level)?.name : isYou ? `You · ${name}` : `${name} pieces`}</b><small>{isBot ? 'Computer opponent' : isYou || (mode === 'bot' && color === 'w') ? 'You' : mode === 'online' ? 'Online opponent' : 'Local player'}</small></div>
      {mode === 'online' && onlineClocks ? <span className={`clock ${onlineClocks[color] < 30000 ? 'low-time' : ''}`} aria-label={`${name} time remaining`}>{formatClock(onlineClocks[color])}</span> : mode !== 'online' && timeControl > 0 ? <span className={`clock ${clockValues && clockValues[color] < 30000 ? 'low-time' : ''}`} aria-label={`${name} time remaining`}>{formatClock(clockValues?.[color] ?? timeControl)}</span> : <span className="player-side">{name.toUpperCase()}</span>}
    </div>;
  }
  const checkedKing = game.isCheck()
    ? game.board().flat().find(p => p?.type === 'k' && p.color === game.turn())?.square
    : null;
  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="brandmark">♞</span><span>BLUEBIRD <strong>CHESS</strong></span></div>
      <span className="topright">THE ART OF THE GAME <span className="dot"/></span>
    </header>
    {learning && <Learn onClose={() => setLearning(false)}/>}
    {analysisPgn !== null && <Analyze pgn={analysisPgn} onClose={() => setAnalysisPgn(null)}/>}
    <main className="layout" hidden={analysisPgn !== null || learning}>
      <section className="board-column">
        <div className="eyebrow">THE CLASSIC GAME, REIMAGINED</div>
        <h1>Make your <em>move.</em></h1>
        <p className="lead">A timeless game. A beautiful place to play.</p>
        {renderPlayer(flipped ? 'w' : 'b')}
        <div ref={boardRef} className="board" role="group" aria-label="Chessboard. Select a piece, then its destination. Arrow keys move focus. Home and End jump within a rank. Enter selects a piece or destination.">
          {squares.map((sq, i) => {
            const piece = game.get(sq);
            const isLight = (files.indexOf(sq[0]) + Number(sq[1])) % 2 === 0;
            const active = selected === sq;
            const target = legal.includes(sq);
            const last = lastMove?.from === sq || lastMove?.to === sq;
            const check = checkedKing === sq;
            return <button type="button" key={sq}
              aria-label={`${sq}, ${piece ? `${piece.color === 'w' ? 'white' : 'black'} ${({p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'} as Record<string,string>)[piece.type]}` : 'empty'}${target ? ', legal destination' : ''}${check ? ', king in check' : ''}`}
              tabIndex={focusedSquare === sq ? 0 : -1} onFocus={() => setFocusedSquare(sq)}
              aria-pressed={active} onClick={e => { if (e.detail === 0 || Date.now() >= suppressClickUntil.current) click(sq); }}
              onPointerDown={e => touchStart(e, sq)} onPointerMove={touchMove} onPointerUp={e => touchEnd(e)} onPointerCancel={e => touchEnd(e, true)} onLostPointerCapture={e => touchEnd(e, true)} onKeyDown={e => { if (e.key === 'Escape') setSelected(null); else onBoardKey(e, i); }}
              draggable={canInteract && piece?.color === game.turn()}
              onDragStart={e => { setSelected(sq); e.dataTransfer.setData('text/plain', sq); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={e => e.preventDefault()} onDrop={e => onDrop(e, sq)}
              className={`square ${isLight ? 'light' : 'dark'} ${active ? 'active' : ''} ${target ? 'target' : ''} ${last ? 'last-move' : ''} ${check ? 'in-check' : ''} ${touchDrag?.from === sq ? 'touch-origin' : ''}`}>
              <span className={`piece ${piece?.color === 'w' ? 'white-piece' : 'black-piece'}`}>{piece ? glyphs[piece.color + piece.type] : ''}</span>
              {i % 8 === 0 && <span className="rank">{sq[1]}</span>}
              {Math.floor(i / 8) === 7 && <span className="file">{sq[0]}</span>}
            </button>;
          })}
        </div>
        {renderPlayer(flipped ? 'b' : 'w')}
      </section>
      <aside className="sidebar">
        <div className="panel">
          <span className="eyebrow">YOUR TABLE</span><h2>Play chess</h2><p>Choose your game, then settle in.</p>
          <div className="segmented" aria-label="Game mode">
            <button aria-pressed={mode === 'local'} className={mode === 'local' ? 'chosen' : ''} onClick={() => { setMode('local'); reset(); }}>Two players</button>
            <button aria-pressed={mode === 'bot'} className={mode === 'bot' ? 'chosen' : ''} onClick={() => { setMode('bot'); reset(); }}>Play a bot</button>
            <button aria-pressed={mode === 'online'} className={mode === 'online' ? 'chosen' : ''} onClick={() => { setMode('online'); reset(); }}>Online</button>
          </div>
          {mode === 'online' && <div className="online-box">
            <div className={`connection ${connection}`}><span>{connection === 'connected' ? <Wifi size={15}/> : <WifiOff size={15}/>}</span>{connection === 'connected' ? 'Connected' : connection === 'connecting' ? 'Connecting…' : connection === 'disconnected' ? 'Disconnected' : 'Not connected'}</div>
            {roomId ? <><label>ROOM CODE</label><div className="room-code">{roomId}<button title="Copy invite" aria-label="Copy invite link" onClick={() => void copyInvite()}><Copy size={15}/></button></div><small>Copy an invite link or share this room code.</small></> : <>
              {savedSeat && (!invitedRoom || invitedRoom === savedSeat.roomId) && <button className="primary-action" disabled={connection === 'connecting'} onClick={() => recoverSeat(savedSeat.roomId, savedSeat.color)}>Rejoin {savedSeat.roomId} as {savedSeat.color === 'w' ? 'White' : 'Black'}</button>}
              {invitedRoom && <p className="online-notice">You’re invited to room {invitedRoom}. Join below to play as Black.</p>}
              <button className="primary-action" disabled={connection === 'connecting'} onClick={() => connectOnline('create')}>Create a room</button>
              <label htmlFor="room-code-input">JOIN WITH A ROOM CODE</label><div className="join-room"><input id="room-code-input" value={roomInput} onChange={e => setRoomInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} placeholder="e.g. 4F8A21BC" maxLength={8}/><button disabled={roomInput.length !== 8 || connection === 'connecting'} onClick={() => connectOnline('join', roomInput)}>Join</button></div>
            </>}
            {connection === 'disconnected' && roomId && <button className="primary-action" onClick={() => recoverSeat(roomId, onlineColor)}>Reconnect</button>}
            {onlineNotice && <p className="online-notice" role="status">{onlineNotice}</p>}
          </div>}
          {mode === 'bot' && <div className="bot-select"><label htmlFor="bot">CHOOSE YOUR OPPONENT</label>
            <select id="bot" value={level} onChange={e => { setLevel(e.target.value as BotLevel); reset(); }}>{levels.map(l => <option value={l.id} key={l.id}>{l.name}</option>)}</select>
            <small>{levels.find(l => l.id === level)?.description}</small>
          </div>}
          {mode !== 'online' && <div className="bot-select"><label htmlFor="time-control">TIME PER PLAYER</label><select id="time-control" value={timeControl} onChange={e => { reset(); setTimeControl(Number(e.target.value)); }}><option value={0}>Untimed · take your time</option><option value={300000}>5 minutes · blitz</option><option value={600000}>10 minutes · rapid</option></select><small>{clock ? 'Clock running. Each move starts your opponent’s time.' : 'The clock starts after White’s first move.'}</small></div>}
          <div className="status" role="status" aria-live="polite"><span className="status-dot"/><span>{botTurn ? 'Computer is thinking…' : status}</span></div>
          <div className="actions">
            <button onClick={undo} disabled={!history.length || botTurn || mode === 'online'}><Undo2 size={17}/> Undo</button>
            <button onClick={() => setFlipped(!flipped)}><ArrowLeftRight size={17}/> Flip</button>
            <button onClick={reset}><RotateCcw size={17}/> New game</button>
            <button aria-pressed={sound} onClick={() => setSound(!sound)}>{sound ? <Volume2 size={17}/> : <VolumeX size={17}/>} Sound {sound ? 'on' : 'off'}</button>
          </div>
          {!game.isGameOver() && !result && history.length > 0 && <div className="end-actions">
            <button onClick={() => mode === 'online' ? socketRef.current?.send(JSON.stringify({ type: 'resign' })) : setResult(`${game.turn() === 'w' ? 'White' : 'Black'} resigned · ${game.turn() === 'w' ? 'Black' : 'White'} wins`)}><Flag size={15}/> Resign</button>
            {mode === 'online' && <button disabled={connection !== 'connected' || !!drawOffer} onClick={() => socketRef.current?.send(JSON.stringify({ type: 'offer_draw' }))}><Handshake size={15}/>{drawOffer === onlineColor ? 'Draw offered' : 'Offer draw'}</button>}
            {mode !== 'online' && <button onClick={() => setResult('Draw by agreement')}><Handshake size={15}/> Agree draw</button>}
          </div>}
          {mode === 'online' && drawOffer && drawOffer !== onlineColor && !result && <div className="end-actions"><span>Opponent offers a draw.</span><button onClick={() => socketRef.current?.send(JSON.stringify({ type: 'accept_draw' }))}>Accept</button><button onClick={() => socketRef.current?.send(JSON.stringify({ type: 'decline_draw' }))}>Decline</button></div>}
          {(game.isGameOver() || result) && <div className="game-over"><Crown size={20}/><b>{status}</b>{mode === 'online' ? <button onClick={() => socketRef.current?.send(JSON.stringify({ type: 'rematch' }))}>Request rematch</button> : <button onClick={reset}>Play again</button>}</div>}
        </div>
        <div className="panel moves"><div className="moves-heading"><span className="eyebrow">THE STORY SO FAR</span><Crown size={17}/></div><h2>Move history</h2><button className="analyze-action" disabled={!game.isGameOver() && !result && ((mode === 'online' && !!roomId) || !!clock)} onClick={() => setLearning(true)}>Learn · Mate in one</button> <button className="analyze-action" disabled={!game.isGameOver() && !result && ((mode === 'online' && !!roomId) || !!clock)} title="Review untimed games or finished games" onClick={() => setAnalysisPgn(game.pgn())}>Analyze this game</button>
          {!history.length ? <p className="empty">Every great game begins with a first move.</p> :
            <div className="move-list">{Array.from({length: Math.ceil(history.length / 2)}, (_, i) => <div className="move-row" key={i}><span>{i + 1}.</span><b>{history[2 * i]?.san}</b><b>{history[2 * i + 1]?.san || '—'}</b></div>)}</div>}
        </div>
        <footer>BLUEBIRD STUDIO <span>EST. 2026</span></footer>
      </aside>
    </main>
    {touchDrag && <span aria-hidden="true" className={`touch-piece piece ${game.get(touchDrag.from)?.color === 'w' ? 'white-piece' : 'black-piece'}`} style={{ left: touchDrag.x, top: touchDrag.y }}>{glyphs[(game.get(touchDrag.from)?.color ?? '') + (game.get(touchDrag.from)?.type ?? '')]}</span>}
    {promotion && <div className="modal-backdrop" onClick={() => setPromotion(null)}>
      <div ref={promotionRef} className="promotion-dialog" onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setPromotion(null); }
        if (event.key === 'Tab') {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault();
          buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      }} role="dialog" aria-modal="true" aria-labelledby="promotion-title" onClick={e => e.stopPropagation()}>
        <span className="eyebrow">YOUR MOVE</span><h2 id="promotion-title">Choose a promotion</h2>
        <p>What should your pawn become?</p>
        <div className="promotion-options">{promotionPieces.map(p => <button key={p} aria-label={`Promote to ${({q:'queen',r:'rook',b:'bishop',n:'knight'} as Record<string,string>)[p]}`} onClick={() => commitMove(promotion.from, promotion.to, p)}>{glyphs[promotion.color + p]}</button>)}</div>
        <button className="cancel-promotion" onClick={() => setPromotion(null)}>Cancel</button>
      </div>
    </div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
