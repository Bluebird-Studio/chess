import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';

const serverDir = fileURLToPath(new URL('..', import.meta.url));

function inbox(ws: WebSocket) {
  const messages: any[] = [];
  ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
  return async (predicate: (message: any) => boolean) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return messages.splice(index, 1)[0];
      await delay(50);
    }
    throw new Error('Timed out waiting for message: ' + JSON.stringify(messages));
  };
}

test('live seat takeover revokes the old socket without falsely disconnecting the opponent', { timeout: 15000 }, async () => {
  const port = 34000 + Math.floor(Math.random() * 2000);
  const server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir, env: { ...process.env, PORT: String(port) }, stdio: 'pipe'
  });
  const clients: WebSocket[] = [];
  async function connect() {
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const socket = await new Promise<WebSocket>((resolve, reject) => {
          const ws = new WebSocket('ws://127.0.0.1:' + port);
          ws.once('open', () => resolve(ws));
          ws.once('error', reject);
        });
        clients.push(socket);
        return socket;
      } catch { await delay(100); }
    }
    throw new Error('Server did not start');
  }
  try {
    const oldWhite = await connect();
    const oldInbox = inbox(oldWhite);
    oldWhite.send(JSON.stringify({ type: 'create' }));
    const seat = await oldInbox(m => m.type === 'joined');
    await oldInbox(m => m.type === 'state');

    const black = await connect();
    const blackInbox = inbox(black);
    const presence: string[] = [];
    black.on('message', raw => {
      const message = JSON.parse(raw.toString());
      if (message.type.startsWith('opponent_')) presence.push(message.type);
    });
    black.send(JSON.stringify({ type: 'join', roomId: seat.roomId }));
    await blackInbox(m => m.type === 'joined');
    await blackInbox(m => m.type === 'state');
    await oldInbox(m => m.type === 'state');

    oldWhite.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    await blackInbox(m => m.type === 'state' && m.history.length === 1);

    const replacedClose = new Promise<number>(resolve =>
      oldWhite.once('close', code => resolve(code))
    );
    const newWhite = await connect();
    const newInbox = inbox(newWhite);
    newWhite.send(JSON.stringify({
      type: 'reconnect', roomId: seat.roomId, token: seat.token
    }));
    const reclaimed = await newInbox(m => m.type === 'joined');
    assert.equal(reclaimed.color, 'w');
    assert.equal(reclaimed.reconnected, true);
    assert.equal(await replacedClose, 4001, 'old connection must be replaced');
    assert.deepEqual((await newInbox(m => m.type === 'state')).history, ['e4']);
    assert.equal((await blackInbox(m => m.type === 'opponent_reconnected')).color, 'w');

    newWhite.send(JSON.stringify({ type: 'move', from: 'g1', to: 'f3' }));
    assert.equal((await newInbox(m => m.type === 'error')).message, 'Wait for your turn');
    black.send(JSON.stringify({ type: 'move', from: 'e7', to: 'e5' }));
    await newInbox(m => m.type === 'state' && m.history.length === 2);
    newWhite.send(JSON.stringify({ type: 'move', from: 'g1', to: 'f3' }));
    const continued = await blackInbox(m => m.type === 'state' && m.history.length === 3);
    assert.deepEqual(continued.history, ['e4', 'e5', 'Nf3']);
    assert.deepEqual(presence, ['opponent_reconnected'],
      'replacing a live seat must not emit a false disconnect');
  } finally {
    for (const ws of clients) ws.terminate();
    server.kill('SIGTERM');
  }
});
