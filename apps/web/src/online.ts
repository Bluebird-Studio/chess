/// <reference types="vite/client" />
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Chess } from 'chess.js';

type Color = 'w' | 'b';
type Session = { roomId: string; token: string };
type ServerMessage = {
  type: string; roomId?: string; color?: Color; token?: string;
  fen?: string; history?: string[]; result?: string; winner?: string;
  message?: string; reason?: string; rematch?: boolean;
};
const SESSION_KEY = 'bluebird-chess-room-v1';
const serverUrl = () => import.meta.env.VITE_CHESS_WS_URL ||
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8080`;
function savedSession(): Session | null {
  try {
    const value = sessionStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const data = JSON.parse(value);
    return typeof data.roomId === 'string' && typeof data.token === 'string' ? data : null;
  } catch { return null; }
}
function fromState(message: ServerMessage): Chess {
  const game = new Chess();
  try {
    for (const san of message.history || []) game.move(san);
    if (message.fen && game.fen() !== message.fen) game.load(message.fen);
  } catch {
    if (message.fen) game.load(message.fen);
  }
  return game;
}
export function useOnlineGame(
  setGame: Dispatch<SetStateAction<Chess>>,
  setResult: Dispatch<SetStateAction<string | null>>,
  setFlipped: Dispatch<SetStateAction<boolean>>
) {
  const [room, setRoom] = useState<string | null>(null);
  const [seat, setSeat] = useState<Color | null>(null);
  const [connection, setConnection] = useState<'offline' | 'connecting' | 'connected' | 'reconnecting'>('offline');
  const [notice, setNotice] = useState('');
  const [resumeAvailable, setResumeAvailable] = useState(() => !!savedSession());
  const socket = useRef<WebSocket | null>(null);
  const generation = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useRef<Session | null>(savedSession());

  function clearRetry() {
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
  }
  function send(type: string, extra: Record<string, unknown> = {}) {
    if (socket.current?.readyState !== WebSocket.OPEN) {
      setNotice('Not connected to the game server.');
      return;
    }
    socket.current.send(JSON.stringify({ type, ...extra }));
  }
  function open(action: Record<string, unknown>, reconnecting = false) {
    clearRetry();
    const id = ++generation.current;
    socket.current?.close();
    setConnection(reconnecting ? 'reconnecting' : 'connecting');
    setNotice(reconnecting ? 'Reconnecting to your seat…' : 'Connecting to the game server…');
    let ws: WebSocket;
    try { ws = new WebSocket(serverUrl()); }
    catch { setConnection('offline'); setNotice('Invalid game server address.'); return; }
    socket.current = ws;
    ws.onopen = () => {
      if (id === generation.current) ws.send(JSON.stringify(action));
    };
    ws.onmessage = event => {
      if (id !== generation.current) return;
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)); }
      catch { return; }
      if (message.type === 'joined' && message.roomId && message.color && message.token) {
        session.current = { roomId: message.roomId, token: message.token };
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session.current)); } catch { /* optional */ }
        setResumeAvailable(true);
        setRoom(message.roomId);
        setSeat(message.color);
        setFlipped(message.color === 'b');
        setConnection('connected');
        setNotice(message.color === 'w' ? 'Share the room code with your opponent.' : 'Joined as Black.');
        if (message.fen) setGame(new Chess(message.fen));
        setResult(null);
      } else if (message.type === 'state') {
        setGame(fromState(message));
        setResult(message.result ? `Game over · ${message.result}` : null);
        if (message.rematch) setNotice('Rematch started.');
      } else if (message.type === 'result') {
        setResult(`${message.winner === 'white' ? 'White' : 'Black'} wins by ${message.reason || 'resignation'}`);
      } else if (message.type === 'opponent_disconnected') {
        setNotice('Opponent disconnected. Waiting for reconnection.');
      } else if (message.type === 'opponent_reconnected') {
        setNotice('Opponent reconnected.');
      } else if (message.type === 'rematch_requested') {
        setNotice('Rematch requested. Waiting for both players.');
      } else if (message.type === 'error') {
        setNotice(message.message || 'Game server rejected the request.');
        if (message.message === 'Invalid reconnect credentials') {
          session.current = null;
          try { sessionStorage.removeItem(SESSION_KEY); } catch { /* optional */ }
          setResumeAvailable(false);
          setConnection('offline');
          ++generation.current;
          ws.close();
        }
      }
    };
    ws.onclose = () => {
      if (id !== generation.current) return;
      socket.current = null;
      if (session.current) {
        setConnection('reconnecting');
        setNotice('Connection lost. Retrying…');
        retry.current = setTimeout(() => {
          if (id === generation.current && session.current) open({ type: 'reconnect', ...session.current }, true);
        }, 1500);
      } else {
        setConnection('offline');
        setNotice('Disconnected from the game server.');
      }
    };
  }
  function create() {
    session.current = null;
    open({ type: 'create' });
  }
  function join(roomId: string) {
    if (!/^[a-f0-9]{8}$/i.test(roomId.trim())) {
      setNotice('Enter an eight-character room code.');
      return;
    }
    session.current = null;
    open({ type: 'join', roomId: roomId.trim().toUpperCase() });
  }
  function resume() {
    const credentials = session.current || savedSession();
    if (credentials) {
      session.current = credentials;
      open({ type: 'reconnect', ...credentials }, true);
    }
  }
  function leave() {
    ++generation.current;
    clearRetry();
    socket.current?.close();
    socket.current = null;
    session.current = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* optional */ }
    setResumeAvailable(false);
    setConnection('offline');
    setNotice('');
    setRoom(null);
    setSeat(null);
  }
  useEffect(() => () => {
    ++generation.current;
    clearRetry();
    socket.current?.close();
  }, []);
  return { room, seat, connection, notice, resumeAvailable, create, join, resume, leave, send };
}
