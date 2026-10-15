import { WebSocketServer, WebSocket } from 'ws';
import { Chess, type Square } from 'chess.js';
import { randomUUID } from 'node:crypto';

type Color = 'w' | 'b';
type Room = {
  game: Chess;
  players: Map<WebSocket, Color>;
  tokens: Partial<Record<Color, string>>;
  result?: 'white' | 'black' | 'draw';
  drawOffer?: Color;
  rematch: Set<Color>;
  expiry?: ReturnType<typeof setTimeout>;
};

const rooms = new Map<string, Room>();
const wss = new WebSocketServer({ port: Number(process.env.PORT || 8080) });
const IDLE_ROOM_MS = 10 * 60_000;

function send(ws: WebSocket, data: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function broadcast(room: Room, data: unknown) {
  for (const ws of room.players.keys()) send(ws, data);
}
function state(room: Room) {
  return {
    type: 'state', fen: room.game.fen(), history: room.game.history(),
    gameOver: Boolean(room.result) || room.game.isGameOver(),
    result: room.result,
    drawOffer: room.drawOffer
  };
}
function cancelExpiry(room: Room) {
  if (room.expiry) clearTimeout(room.expiry);
  room.expiry = undefined;
}
function scheduleExpiry(id: string, room: Room) {
  if (room.players.size) return;
  cancelExpiry(room);
  room.expiry = setTimeout(() => {
    if (rooms.get(id) === room && room.players.size === 0) rooms.delete(id);
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
          tokens: { w: token }, rematch: new Set()
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
        roomId = id;
        send(ws, { type: 'joined', roomId: id, color: 'b', token, fen: room.game.fen() });
        broadcast(room, state(room));
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
        roomId = id;
        send(ws, { type: 'joined', roomId: id, color, token: msg.token, fen: room.game.fen(), reconnected: true });
        send(ws, state(room));
        broadcast(room, { type: 'opponent_reconnected', color });
        return;
      }

      if (!roomId) { send(ws, { type: 'error', message: 'Join a room first' }); return; }
      const room = rooms.get(roomId);
      const color = room?.players.get(ws);
      if (!room || !color) return;

      if (msg.type === 'resign') {
        if (room.result || room.game.isGameOver()) return;
        room.result = color === 'w' ? 'black' : 'white';
        broadcast(room, { type: 'result', winner: room.result, reason: 'resignation' });
        return;
      }
      if (msg.type === 'offer_draw') {
        if (room.result || room.game.isGameOver()) return;
        if (room.drawOffer) { send(ws, { type: 'error', message: 'A draw offer is already pending' }); return; }
        room.drawOffer = color;
        broadcast(room, { type: 'draw_offered', color });
        return;
      }
      if (msg.type === 'accept_draw') {
        if (room.result || room.game.isGameOver()) return;
        if (!room.drawOffer || room.drawOffer === color) {
          send(ws, { type: 'error', message: 'No opponent draw offer to accept' });
          return;
        }
        room.drawOffer = undefined;
        room.result = 'draw';
        broadcast(room, { type: 'result', winner: 'draw', reason: 'agreement' });
        return;
      }
      if (msg.type === 'decline_draw') {
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
          room.game = new Chess();
          room.result = undefined;
          room.drawOffer = undefined;
          room.rematch.clear();
          broadcast(room, { ...state(room), rematch: true });
        }
        return;
      }
      if (msg.type === 'move') {
        if (room.result || room.game.isGameOver() || color !== room.game.turn()) return;
        const from = msg.from as Square, to = msg.to as Square;
        if (typeof from !== 'string' || typeof to !== 'string') return;
        try { room.game.move({ from, to, promotion: msg.promotion || 'q' }); }
        catch { send(ws, { type: 'error', message: 'Illegal move' }); return; }
        room.drawOffer = undefined;
        broadcast(room, state(room));
      }
    } catch {
      send(ws, { type: 'error', message: 'Invalid message' });
    }
  });

  ws.on('close', () => {
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || !room.players.has(ws)) return;
    room.players.delete(ws);
    room.rematch.clear();
    room.drawOffer = undefined;
    broadcast(room, { type: 'opponent_disconnected' });
    scheduleExpiry(roomId, room);
  });
});
console.log('Chess WebSocket server listening on port ' + (process.env.PORT || 8080));
