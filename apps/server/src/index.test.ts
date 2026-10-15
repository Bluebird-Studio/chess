import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const serverDir = fileURLToPath(new URL('..', import.meta.url));
import { WebSocket } from 'ws';
import { setTimeout as delay } from 'node:timers/promises';

function inbox(ws:WebSocket){
 const messages:any[]=[];
 ws.on('message',raw=>messages.push(JSON.parse(raw.toString())));
 return async (predicate:(m:any)=>boolean)=>{
  for(let i=0;i<60;i++){const index=messages.findIndex(predicate);if(index>=0)return messages.splice(index,1)[0];await delay(50)}
  throw Error('Timed out waiting for server message: '+JSON.stringify(messages));
 };
}
test('server synchronizes legal moves and enforces turn ownership', {timeout:15000}, async()=>{
 const port=19000+Math.floor(Math.random()*3000);
 const child=spawn(process.execPath,['--import','tsx','src/index.ts'],{cwd:serverDir,env:{...process.env,PORT:String(port)},stdio:'pipe'});
 const clients:WebSocket[]=[];
 try{
  let white:WebSocket|undefined;
  for(let i=0;i<50;i++){try{white=await new Promise<WebSocket>((resolve,reject)=>{const socket=new WebSocket('ws://127.0.0.1:'+port);socket.once('open',()=>resolve(socket));socket.once('error',reject)});break}catch{await delay(100)}}
  assert.ok(white);clients.push(white);
  const whiteInbox=inbox(white);
  white.send(JSON.stringify({type:'create'}));
  const joined=await whiteInbox(m=>m.type==='joined');
  assert.equal(joined.color,'w');
  assert.match(joined.roomId,/^[A-F0-9]{8}$/);
  const black=await new Promise<WebSocket>((resolve,reject)=>{const socket=new WebSocket('ws://127.0.0.1:'+port);socket.once('open',()=>resolve(socket));socket.once('error',reject)});
  clients.push(black);const blackInbox=inbox(black);
  black.send(JSON.stringify({type:'join',roomId:joined.roomId}));
  assert.equal((await blackInbox(m=>m.type==='joined')).color,'b');
  await whiteInbox(m=>m.type==='state');
  await blackInbox(m=>m.type==='state');
  white.send(JSON.stringify({type:'move',from:'e2',to:'e4'}));
  assert.deepEqual((await whiteInbox(m=>m.type==='state'&&m.history.length===1)).history,['e4']);
  assert.deepEqual((await blackInbox(m=>m.type==='state'&&m.history.length===1)).history,['e4']);
  white.send(JSON.stringify({type:'move',from:'d2',to:'d4'}));
  white.send('{invalid-json');
  assert.equal((await whiteInbox(m=>m.type==='error')).message,'Invalid message');
  black.send(JSON.stringify({type:'move',from:'e7',to:'e5'}));
  assert.deepEqual((await whiteInbox(m=>m.type==='state'&&m.history.length===2)).history,['e4','e5']);
  white.send(JSON.stringify({type:'resign'}));
  assert.deepEqual(await blackInbox(m=>m.type==='result'),{type:'result',winner:'black',reason:'resignation'});
  await whiteInbox(m=>m.type==='result');
  white.send(JSON.stringify({type:'move',from:'g1',to:'f3'}));
  white.send(JSON.stringify({type:'rematch'}));
  assert.equal((await blackInbox(m=>m.type==='rematch_requested')).color,'w');
  black.send(JSON.stringify({type:'rematch'}));
  assert.equal((await whiteInbox(m=>m.type==='state'&&m.rematch===true)).history.length,0);
  assert.equal((await blackInbox(m=>m.type==='state'&&m.rematch===true)).gameOver,false);
  white.send(JSON.stringify({type:'offer_draw'}));
  assert.deepEqual(await blackInbox(m=>m.type==='draw_offered'),{type:'draw_offered',color:'w'});
  white.send(JSON.stringify({type:'move',from:'e2',to:'e4'}));
  const offered=await blackInbox(m=>m.type==='state'&&m.history.length===1);
  assert.equal(offered.drawOffer,'w','offering player may move without withdrawing the offer');
  black.send(JSON.stringify({type:'move',from:'e7',to:'e4'}));
  assert.equal((await blackInbox(m=>m.type==='error')).message,'Illegal move');
  black.send(JSON.stringify({type:'move',from:'e7',to:'e5'}));
  const declined=await whiteInbox(m=>m.type==='state'&&m.history.length===2);
  assert.equal(declined.drawOffer,undefined,'opponent legal move declines the offer');
  black.send(JSON.stringify({type:'accept_draw'}));
  assert.equal((await blackInbox(m=>m.type==='error')).message,'No opponent draw offer to accept');
  white.send(JSON.stringify({type:'offer_draw'}));
  await blackInbox(m=>m.type==='draw_offered');
  white.send(JSON.stringify({type:'accept_draw'}));
  assert.equal((await whiteInbox(m=>m.type==='error')).message,'No opponent draw offer to accept');
  black.send(JSON.stringify({type:'accept_draw'}));
  assert.deepEqual(await whiteInbox(m=>m.type==='result'),{type:'result',winner:'draw',reason:'agreement'});
  assert.deepEqual(await blackInbox(m=>m.type==='result'),{type:'result',winner:'draw',reason:'agreement'});
  // Reclaiming a finished seat must preserve the result and its reason.
  const recovered = await new Promise<WebSocket>((resolve,reject)=>{
   const socket=new WebSocket('ws://127.0.0.1:'+port);
   socket.once('open',()=>resolve(socket));socket.once('error',reject);
  });
  clients.push(recovered);const recoveredInbox=inbox(recovered);
  recovered.send(JSON.stringify({type:'reconnect',roomId:joined.roomId,token:joined.token}));
  await recoveredInbox(m=>m.type==='joined');
  const agreed=await recoveredInbox(m=>m.type==='state');
  assert.equal(agreed.result,'draw');assert.equal(agreed.reason,'agreement');
  assert.equal(agreed.activeClock,undefined);

  async function rematch(){
   recovered.send(JSON.stringify({type:'rematch'}));
   black.send(JSON.stringify({type:'rematch'}));
   const fresh=await recoveredInbox(m=>m.type==='state'&&m.rematch);
   await blackInbox(m=>m.type==='state'&&m.rematch);
   assert.equal(fresh.result,undefined);assert.equal(fresh.reason,undefined);
   assert.equal(fresh.gameOver,false);assert.equal(fresh.activeClock,'w');
  }
  async function play(moves:string[][]){
   let last:any;
   for(const [index,[from,to]] of moves.entries()){
    (index%2===0?recovered:black).send(JSON.stringify({type:'move',from,to}));
    last=await recoveredInbox(m=>m.type==='state'&&m.history.length===index+1);
    await blackInbox(m=>m.type==='state'&&m.history.length===index+1);
   }
   return last;
  }
  await rematch();
  const mate=await play([['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']]);
  assert.equal(mate.gameOver,true);assert.equal(mate.result,'black');
  assert.equal(mate.reason,'checkmate');assert.equal(mate.activeClock,undefined);
  await rematch();
  const repetition=await play([
   ['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8'],
   ['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']
  ]);
  assert.equal(repetition.gameOver,true);assert.equal(repetition.result,'draw');
  assert.equal(repetition.reason,'threefold_repetition');assert.equal(repetition.activeClock,undefined);

 }finally{for(const ws of clients)ws.terminate();child.kill('SIGTERM')}
});

test('reconnect restores the correct seat and rejects invalid tokens', { timeout: 15000 }, async () => {
  const port = 22000 + Math.floor(Math.random() * 3000);
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir, env: { ...process.env, PORT: String(port) }, stdio: 'pipe'
  });
  const clients: WebSocket[] = [];
  async function connect() {
    for (let i = 0; i < 50; i++) {
      try {
        const ws = await new Promise<WebSocket>((resolve, reject) => {
          const socket = new WebSocket('ws://127.0.0.1:' + port);
          socket.once('open', () => resolve(socket));
          socket.once('error', reject);
        });
        clients.push(ws);
        return ws;
      } catch { await delay(100); }
    }
    throw Error('Server did not start');
  }
  try {
    const white = await connect();
    const readWhite = inbox(white);
    white.send(JSON.stringify({ type: 'create' }));
    const created = await readWhite(m => m.type === 'joined');
    assert.equal(typeof created.token, 'string');

    const black = await connect();
    const readBlack = inbox(black);
    black.send(JSON.stringify({ type: 'join', roomId: created.roomId }));
    const joined = await readBlack(m => m.type === 'joined');
    assert.notEqual(joined.token, created.token);
    await readWhite(m => m.type === 'state');
    await readBlack(m => m.type === 'state');
    white.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    await readBlack(m => m.type === 'state' && m.history.length === 1);

    black.close();
    await readWhite(m => m.type === 'opponent_disconnected');

    const attacker = await connect();
    const readAttacker = inbox(attacker);
    attacker.send(JSON.stringify({ type: 'join', roomId: created.roomId }));
    assert.equal((await readAttacker(m => m.type === 'error')).message, 'Room unavailable');
    attacker.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: 'wrong' }));
    assert.equal((await readAttacker(m => m.type === 'error')).message, 'Invalid reconnect credentials');

    const recovered = await connect();
    const readRecovered = inbox(recovered);
    recovered.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: joined.token }));
    const restored = await readRecovered(m => m.type === 'joined');
    assert.equal(restored.color, 'b');
    assert.equal(restored.reconnected, true);
    assert.deepEqual((await readRecovered(m => m.type === 'state')).history, ['e4']);
    recovered.send(JSON.stringify({ type: 'move', from: 'e7', to: 'e5' }));
    assert.deepEqual((await readWhite(m => m.type === 'state' && m.history.length === 2)).history, ['e4', 'e5']);
  } finally {
    for (const ws of clients) ws.terminate();
    child.kill('SIGTERM');
  }
});

test('authoritative clocks start with both players, apply increments, and adjudicate timeout', { timeout: 15000 }, async () => {
  const port = 25000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir, env: { ...process.env, PORT: String(port), CLOCK_BASE_MS: '1800', CLOCK_INCREMENT_MS: '120' }, stdio: 'pipe'
  });
  const clients: WebSocket[] = [];
  async function connect() {
    for (let i = 0; i < 50; i++) {
      try {
        const ws = await new Promise<WebSocket>((resolve, reject) => {
          const socket = new WebSocket('ws://127.0.0.1:' + port);
          socket.once('open', () => resolve(socket));
          socket.once('error', reject);
        });
        clients.push(ws);
        return ws;
      } catch { await delay(100); }
    }
    throw Error('Server did not start');
  }
  try {
    const white = await connect();
    const readWhite = inbox(white);
    white.send(JSON.stringify({ type: 'create' }));
    const created = await readWhite(m => m.type === 'joined');
    const black = await connect();
    const readBlack = inbox(black);
    black.send(JSON.stringify({ type: 'join', roomId: created.roomId }));
    await readBlack(m => m.type === 'joined');
    const start = await readWhite(m => m.type === 'state');
    assert.equal(start.activeClock, 'w');
    assert.ok(start.clocks.w >= 1700 && start.clocks.w <= 1800);
    assert.ok(start.clocks.b >= 1700 && start.clocks.b <= 1800);
    assert.equal(start.increment, 120);

    white.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    const afterMove = await readWhite(m => m.type === 'state' && m.history.length === 1);
    assert.equal(afterMove.activeClock, 'b');
    assert.ok(afterMove.clocks.w > 1800 && afterMove.clocks.w <= 1920);
    assert.ok(afterMove.clocks.b >= 1750 && afterMove.clocks.b <= 1800);
    const result = await readBlack(m => m.type === 'result' && m.reason === 'timeout');
    assert.equal(result.winner, 'white');
    assert.deepEqual(await readWhite(m => m.type === 'result' && m.reason === 'timeout'), result);
  } finally {
    for (const ws of clients) ws.terminate();
    child.kill('SIGTERM');
  }
});

test('waiting rooms reject moves and reconnect without starting the clock', { timeout: 15000 }, async () => {
  const port = 28000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir, env: { ...process.env, PORT: String(port), CLOCK_BASE_MS: '1000' }, stdio: 'pipe'
  });
  const clients: WebSocket[] = [];
  async function connect() {
    for (let i = 0; i < 50; i++) {
      try {
        const ws = await new Promise<WebSocket>((resolve, reject) => {
          const socket = new WebSocket('ws://127.0.0.1:' + port);
          socket.once('open', () => resolve(socket));
          socket.once('error', reject);
        });
        clients.push(ws);
        return ws;
      } catch { await delay(100); }
    }
    throw Error('Server did not start');
  }
  try {
    const host = await connect();
    const readHost = inbox(host);
    host.send(JSON.stringify({ type: 'create' }));
    const created = await readHost(m => m.type === 'joined');
    host.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    assert.equal((await readHost(m => m.type === 'error')).message, 'Waiting for an opponent');

    const recovered = await connect();
    const readRecovered = inbox(recovered);
    recovered.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: created.token }));
    await readRecovered(m => m.type === 'joined');
    const waiting = await readRecovered(m => m.type === 'state');
    assert.deepEqual(waiting.history, []);
    assert.deepEqual(waiting.clocks, { w: 1000, b: 1000 });
    assert.equal(waiting.activeClock, undefined);
    // Waiting longer than the time control must not forfeit an unstarted game.
    await delay(1200);
    const black = await connect();
    const readBlack = inbox(black);
    black.send(JSON.stringify({ type: 'join', roomId: created.roomId }));
    await readBlack(m => m.type === 'joined');
    const started = await readBlack(m => m.type === 'state');
    assert.equal(started.gameOver, false);
    assert.equal(started.activeClock, 'w');
    assert.ok(started.clocks.w > 900);
    assert.equal(started.clocks.b, 1000);
    recovered.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    const moved = await readBlack(m => m.type === 'state' && m.history.length === 1);
    assert.deepEqual(moved.history, ['e4']);
    assert.equal(moved.activeClock, 'b');
  } finally {
    for (const ws of clients) ws.terminate();
    child.kill('SIGTERM');
  }
});
