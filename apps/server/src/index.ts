import { WebSocketServer, WebSocket } from 'ws';
import { Chess, type Square } from 'chess.js';
import { randomUUID } from 'node:crypto';
import { timeoutResult } from './timeout.js';

type Color = 'w' | 'b';
type Room = {
  game: Chess;
  players: Map<WebSocket, Color>;
  tokens: Partial<Record<Color, string>>;
  result?: 'white' | 'black' | 'draw';
  reason?: string;
  drawOffer?: Color;
  remaining: Record<Color, number>;
  increment: number;
  turnStartedAt?: number;
  clockInterval?: ReturnType<typeof setInterval>;
  rematch: Set<Color>;
  expiry?: ReturnType<typeof setTimeout>;
};

const rooms = new Map<string, Room>();
// Gameplay commands are tiny; bound the complete message (including fragments)
// before JSON parsing so one peer cannot exhaust memory across active rooms.
const wss = new WebSocketServer({ port: Number(process.env.PORT || 8080), maxPayload: 4096 });
const IDLE_ROOM_MS = 10 * 60_000;
const CLOCK_BASE_MS = Math.max(1_000, Number(process.env.CLOCK_BASE_MS) || 5 * 60_000);
const CLOCK_INCREMENT_MS = Math.max(0, Number(process.env.CLOCK_INCREMENT_MS) || 0);
const HEARTBEAT_MS = Math.max(100, Number(process.env.HEARTBEAT_MS) || 30_000);

// TCP can stay open after a sleeping device or network loss. Reap silent
// sockets so opponents receive a disconnect and the seat remains reclaimable.
const awaitingPong = new Set<WebSocket>();
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (awaitingPong.has(ws)) {
      ws.terminate();
      continue;
    }
    if (ws.readyState === WebSocket.OPEN) {
      awaitingPong.add(ws);
      ws.ping();
    }
  }
}, HEARTBEAT_MS);
heartbeat.unref();
wss.on('close', () => clearInterval(heartbeat));

function send(ws: WebSocket, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function broadcast(room: Room, data: unknown) {
  for (const ws of room.players.keys()) send(ws, data);
}
function state(room: Room) {
  const remaining = { ...room.remaining };
  if (room.turnStartedAt !== undefined && !room.result && !room.game.isGameOver()) {
    const active = room.game.turn();
    remaining[active] = Math.max(0, remaining[active] - (Date.now() - room.turnStartedAt));
  }
  return {
    type: 'state', fen: room.game.fen(), history: room.game.history(),
    gameOver: Boolean(room.result) || room.game.isGameOver(),
    result: room.result,
    reason: room.reason,
    drawOffer: room.drawOffer,
    clocks: remaining,
    activeClock: room.turnStartedAt === undefined ? undefined : room.game.turn(),
    increment: room.increment
  };
}
function stopClock(room: Room) {
  if (room.clockInterval) clearInterval(room.clockInterval);
  room.clockInterval = undefined;
  room.turnStartedAt = undefined;
}
function settleClock(room: Room): boolean {
  if (room.turnStartedAt === undefined || room.result || room.game.isGameOver()) return false;
  const active = room.game.turn();
  const elapsed = Date.now() - room.turnStartedAt;
  if (elapsed < room.remaining[active]) {
    room.remaining[active] -= elapsed;
    room.turnStartedAt = Date.now();
    return false;
  }
  room.remaining[active] = 0;
  room.result = timeoutResult(room.game);
  room.reason = room.result === 'draw' ? 'timeout_insufficient_material' : 'timeout';
  room.drawOffer = undefined;
  stopClock(room);
  broadcast(room, { type: 'result', winner: room.result, reason: room.reason });
  return true;
}
function startClock(room: Room) {
  if (!room.tokens.w || !room.tokens.b) return;
  if (room.turnStartedAt !== undefined || room.result || room.game.isGameOver()) return;
  room.turnStartedAt = Date.now();
  room.clockInterval = setInterval(() => {
    if (settleClock(room)) return;
    broadcast(room, state(room));
  }, 250);
  room.clockInterval.unref();
}
function cancelExpiry(room: Room) {
  if (room.expiry) clearTimeout(room.expiry);
  room.expiry = undefined;
}
function scheduleExpiry(id: string, room: Room) {
  if (room.players.size) return;
  cancelExpiry(room);
  room.expiry = setTimeout(() => {
    if (rooms.get(id) === room && room.players.size === 0) {
      stopClock(room);
      rooms.delete(id);
    }
  }, IDLE_ROOM_MS);
  room.expiry.unref();
}
function roomCode(): string {
  let id: string;
  do { id = randomUUID().slice(0, 8).toUpperCase(); } while (rooms.has(id));
  return id;
}

wss.on('connection', ws => {
  let roomId: string | undefined;
  ws.on('pong', () => awaitingPong.delete(ws));
  // Transport failures must close this connection rather than crash all rooms.
  ws.on('error', () => ws.terminate());

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString());
      if (!msg || typeof msg !== 'object') throw Error('Invalid message');

      if (msg.type === 'create') {
        if (roomId) { send(ws, { type: 'error', message: 'Already in a room' }); return; }
        const id = roomCode();
        const token = randomUUID();
        const room: Room = {
          game: new Chess(), players: new Map([[ws, 'w']]),
          tokens: { w: token }, rematch: new Set(), remaining: { w: CLOCK_BASE_MS, b: CLOCK_BASE_MS }, increment: CLOCK_INCREMENT_MS
        };
        rooms.set(id, room);
        roomId = id;
        send(ws, { type: 'joined', roomId: id, color: 'w', token, fen: room.game.fen() });
        return;
      }

      if (msg.type === 'join' && typeof msg.roomId === 'string') {
        if (roomId) { send(ws, { type: 'error', message: 'Already in a room' }); return; }
        const id = msg.roomId.toUpperCase();
        const room = rooms.get(id);
        if (!room || room.tokens.b) { send(ws, { type: 'error', message: 'Room unavailable' }); return; }
        const token = randomUUID();
        room.tokens.b = token;
        room.players.set(ws, 'b');
        cancelExpiry(room);
        startClock(room);
        roomId = id;
        send(ws, { type: 'joined', roomId: id, color: 'b', token, fen: room.game.fen() });
        broadcast(room, state(room));
        // The host's reserved seat can outlive its connection in the lobby.
        if (![...room.players.values()].includes('w')) {
          send(ws, { type: 'opponent_disconnected' });
        }
        return;
      }

      if (msg.type === 'reconnect' && typeof msg.roomId === 'string' && typeof msg.token === 'string') {
        if (roomId) { send(ws, { type: 'error', message: 'Already in a room' }); return; }
        const id = msg.roomId.toUpperCase();
        const room = rooms.get(id);
        const color = room && (room.tokens.w === msg.token ? 'w' : room.tokens.b === msg.token ? 'b' : undefined);
        if (!room || !color) { send(ws, { type: 'error', message: 'Invalid reconnect credentials' }); return; }
        // The token identifies the seat; the old socket must lose authority immediately.
        for (const [old, seat] of room.players) {
          if (seat === color) {
            room.players.delete(old);
            old.close(4001, 'Session replaced');
          }
        }
        room.players.set(ws, color);
        cancelExpiry(room);
        startClock(room);
        roomId = id;
        send(ws, { type: 'joined', roomId: id, color, token: msg.token, fen: room.game.fen(), reconnected: true });
        send(ws, state(room));
        // Notify only the other seat: reconnecting is not evidence that the
        // opponent is present (both players may have lost their connection).
        for (const [peer, seat] of room.players) {
          if (seat !== color) send(peer, { type: 'opponent_reconnected', color });
        }
        const opponent = color === 'w' ? 'b' : 'w';
        if (room.tokens[opponent] && ![...room.players.values()].includes(opponent)) {
          send(ws, { type: 'opponent_disconnected' });
        }
        return;
      }

      if (!roomId) { send(ws, { type: 'error', message: 'Join a room first' }); return; }
      const room = rooms.get(roomId);
      const color = room?.players.get(ws);
      if (!room || !color) return;

      // A reserved white seat is a lobby, not an active game. Reject every
      // gameplay action until the opponent joins so the invite stays playable.
      if (!room.tokens.w || !room.tokens.b) {
        send(ws, { type: 'error', message: 'Waiting for an opponent' });
        return;
      }

      if (msg.type === 'resign') {
        if (settleClock(room)) return;
        if (room.result || room.game.isGameOver()) return;
        room.result = color === 'w' ? 'black' : 'white';
        room.reason = 'resignation';
        room.drawOffer = undefined;
        stopClock(room);
        broadcast(room, { type: 'result', winner: room.result, reason: room.reason });
        return;
      }
      if (msg.type === 'offer_draw') {
        if (settleClock(room)) return;
        if (room.result || room.game.isGameOver()) return;
        if (room.drawOffer) { send(ws, { type: 'error', message: 'A draw offer is already pending' }); return; }
        room.drawOffer = color;
        broadcast(room, { type: 'draw_offered', color });
        return;
      }
      if (msg.type === 'accept_draw') {
        if (settleClock(room)) return;
        if (room.result || room.game.isGameOver()) return;
        if (!room.drawOffer || room.drawOffer === color) {
          send(ws, { type: 'error', message: 'No opponent draw offer to accept' });
          return;
        }
        room.drawOffer = undefined;
        room.result = 'draw';
        room.reason = 'agreement';
        stopClock(room);
        broadcast(room, { type: 'result', winner: 'draw', reason: 'agreement' });
        return;
      }
      if (msg.type === 'decline_draw') {
        if (settleClock(room)) return;
        if (room.result || room.game.isGameOver()) return;
        if (!room.drawOffer || room.drawOffer === color) {
          send(ws, { type: 'error', message: 'No opponent draw offer to decline' });
          return;
        }
        room.drawOffer = undefined;
        broadcast(room, { type: 'draw_declined' });
        return;
      }
      if (msg.type === 'rematch') {
        if (!room.result && !room.game.isGameOver()) return;
        room.rematch.add(color);
        broadcast(room, { type: 'rematch_requested', color });
        if (room.rematch.size === 2) {
          stopClock(room);
          room.game = new Chess();
          room.result = undefined;
          room.reason = undefined;
          room.remaining = { w: CLOCK_BASE_MS, b: CLOCK_BASE_MS };
          room.drawOffer = undefined;
          startClock(room);
          room.rematch.clear();
          broadcast(room, { ...state(room), rematch: true });
        }
        return;
      }
      if (msg.type === 'move') {
        if (settleClock(room)) return;
        if (room.result || room.game.isGameOver()) {
          send(ws, { type: 'error', message: 'Game is over' });
          return;
        }
        if (color !== room.game.turn()) {
          send(ws, { type: 'error', message: 'Wait for your turn' });
          return;
        }
        const from = msg.from as Square, to = msg.to as Square;
        if (typeof from !== 'string' || typeof to !== 'string') {
          send(ws, { type: 'error', message: 'Invalid move' });
          return;
        }
        try { room.game.move({ from, to, promotion: msg.promotion || 'q' }); }
        catch { send(ws, { type: 'error', message: 'Illegal move' }); return; }
        room.remaining[color] += room.increment;
        room.turnStartedAt = room.game.isGameOver() ? undefined : Date.now();
        if (room.game.isGameOver()) {
          room.result = room.game.isCheckmate() ? (room.game.turn() === 'w' ? 'black' : 'white') : 'draw';
          room.reason = room.game.isCheckmate() ? 'checkmate' :
            room.game.isStalemate() ? 'stalemate' :
            room.game.isInsufficientMaterial() ? 'insufficient_material' :
            room.game.isThreefoldRepetition() ? 'threefold_repetition' : 'fifty_move_rule';
          stopClock(room);
        }
        // An offer made before moving remains available during the opponent's turn.
        // The opponent declines implicitly by making a legal move.
        if (room.result || room.drawOffer !== color) room.drawOffer = undefined;
        broadcast(room, state(room));
      }
    } catch {
      send(ws, { type: 'error', message: 'Invalid message' });
    }
  });

  ws.on('close', () => {
    awaitingPong.delete(ws);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || !room.players.has(ws)) return;
    room.players.delete(ws);
    // Clocks keep running while a player reconnects; the active side remains charged.
    room.rematch.clear();
    // A connection loss is not a draw rejection. Keep the offer in authoritative
    // state so either seat can recover it and the opponent can still accept.
    broadcast(room, { type: 'opponent_disconnected' });
    scheduleExpiry(roomId, room);
  });
});
console.log('Chess WebSocket server listening on port ' + (process.env.PORT || 8080));
