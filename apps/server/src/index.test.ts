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
  let whiteInbox=inbox(white);
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
  assert.equal((await whiteInbox(m=>m.type==='error')).message,'Wait for your turn');
  white.send('{invalid-json');
  assert.equal((await whiteInbox(m=>m.type==='error')).message,'Invalid message');
  black.send(JSON.stringify({type:'move',from:7,to:'e5'}));
  assert.equal((await blackInbox(m=>m.type==='error')).message,'Invalid move');
  black.send(JSON.stringify({type:'move',from:'e7',to:'e4'}));
  assert.equal((await blackInbox(m=>m.type==='error')).message,'Illegal move');
  black.send(JSON.stringify({type:'move',from:'e7',to:'e5'}));
  assert.deepEqual((await whiteInbox(m=>m.type==='state'&&m.history.length===2)).history,['e4','e5']);
  assert.deepEqual((await blackInbox(m=>m.type==='state'&&m.history.length===2)).history,['e4','e5']);
  white.send(JSON.stringify({type:'offer_draw'}));
  await blackInbox(m=>m.type==='draw_offered');
  white.send(JSON.stringify({type:'resign'}));
  assert.deepEqual(await blackInbox(m=>m.type==='result'),{type:'result',winner:'black',reason:'resignation'});
  await whiteInbox(m=>m.type==='result');
  const resignationState = await blackInbox(m=>m.type==='state'&&m.reason==='resignation');
  assert.equal(resignationState.result,'black');
  assert.equal(resignationState.gameOver,true);
  assert.equal(resignationState.activeClock,undefined);
  assert.equal(resignationState.drawOffer,undefined);
  const resignedSeat = await new Promise<WebSocket>((resolve,reject)=>{
   const socket=new WebSocket('ws://127.0.0.1:'+port);
   socket.once('open',()=>resolve(socket));socket.once('error',reject);
  });
  clients.push(resignedSeat);const resignedInbox=inbox(resignedSeat);
  resignedSeat.send(JSON.stringify({type:'reconnect',roomId:joined.roomId,token:joined.token}));
  await resignedInbox(m=>m.type==='joined');
  const resigned=await resignedInbox(m=>m.type==='state');
  assert.equal(resigned.reason,'resignation');
  assert.equal(resigned.drawOffer,undefined,'resignation clears a pending offer');
  assert.equal(resigned.activeClock,undefined);
  white=resignedSeat;
  // Read subsequent responses from the replaced seat.
  whiteInbox=resignedInbox;
  white.send(JSON.stringify({type:'move',from:'g1',to:'f3'}));
  assert.equal((await whiteInbox(m=>m.type==='error')).message,'Game is over');
  white.send(JSON.stringify({type:'rematch'}));
  assert.equal((await blackInbox(m=>m.type==='rematch_requested')).color,'w');
  black.send(JSON.stringify({type:'rematch'}));
  assert.equal((await whiteInbox(m=>m.type==='state'&&m.rematch===true)).history.length,0);
  assert.equal((await blackInbox(m=>m.type==='state'&&m.rematch===true)).gameOver,false);
  white.send(JSON.stringify({type:'offer_draw'}));
  assert.deepEqual(await blackInbox(m=>m.type==='draw_offered'),{type:'draw_offered',color:'w'});
  white.send(JSON.stringify({type:'move',from:'e2',to:'e4'}));
  const offered=await blackInbox(m=>m.type==='state'&&m.history.length===1&&m.drawOffer==='w');
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
  const agreementState = await whiteInbox(m=>m.type==='state'&&m.reason==='agreement');
  assert.equal(agreementState.result,'draw');
  assert.equal(agreementState.gameOver,true);
  assert.equal(agreementState.activeClock,undefined);
  assert.equal(agreementState.drawOffer,undefined);
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
  for (const read of [recoveredInbox, blackInbox]) {
   assert.deepEqual(await read(m=>m.type==='result'),{type:'result',winner:'black',reason:'checkmate'});
  }
  recovered.send(JSON.stringify({type:'move',from:'a2',to:'a3'}));
  assert.equal((await recoveredInbox(m=>m.type==='error')).message,'Game is over');
  await rematch();
  const repetition=await play([
   ['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8'],
   ['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']
  ]);
  assert.equal(repetition.gameOver,true);assert.equal(repetition.result,'draw');
  assert.equal(repetition.reason,'threefold_repetition');assert.equal(repetition.activeClock,undefined);
  for (const read of [recoveredInbox, blackInbox]) {
   assert.deepEqual(await read(m=>m.type==='result'),{type:'result',winner:'draw',reason:'threefold_repetition'});
  }

  await rematch();
  await play([
   ['a2','a4'],['h7','h5'],['a4','a5'],['h5','h4'],
   ['a5','a6'],['h4','h3'],['a6','b7'],['h3','g2']
  ]);
  for (const promotion of [null, false, '', 'king', 'Q', 7, {}]) {
   recovered.send(JSON.stringify({type:'move',from:'b7',to:'a8',promotion}));
   assert.equal((await recoveredInbox(m=>m.type==='error')).message,'Invalid move');
  }
  for (const [from,to] of [['b7','a9'],['B7','a8'],['b7','a8extra']]) {
   recovered.send(JSON.stringify({type:'move',from,to}));
   assert.equal((await recoveredInbox(m=>m.type==='error')).message,'Invalid move');
  }
  recovered.send(JSON.stringify({type:'move',from:'b7',to:'a8',promotion:'n'}));
  const promoted=await recoveredInbox(m=>m.type==='state'&&m.history.length===9);
  const opponentPromotion=await blackInbox(m=>m.type==='state'&&m.history.length===9);
  assert.deepEqual(promoted,opponentPromotion,'both seats see the same underpromotion');
  assert.equal(promoted.history[8],'bxa8=N');
  assert.ok(promoted.fen.startsWith('Nnbqkbnr/'),'the server preserves the chosen knight');
  assert.equal(promoted.activeClock,'b');
  assert.equal(promoted.gameOver,false,'rejected promotion inputs leave the game playable');


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

    white.send(JSON.stringify({ type: 'offer_draw' }));
    await readBlack(m => m.type === 'draw_offered');
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
    const restoredState = await readRecovered(m => m.type === 'state');
    assert.deepEqual(restoredState.history, ['e4']);
    assert.equal(restoredState.drawOffer, 'w', 'disconnect must not reject a pending draw');
    recovered.send(JSON.stringify({ type: 'move', from: 'e7', to: 'e5' }));
    const moved = await readWhite(m => m.type === 'state' && m.history.length === 2);
    assert.deepEqual(moved.history, ['e4', 'e5']);
    assert.equal(moved.drawOffer, undefined, 'a legal reply still declines the recovered offer');

    recovered.send(JSON.stringify({ type: 'offer_draw' }));
    await readWhite(m => m.type === 'draw_offered');
    recovered.close();
    await readWhite(m => m.type === 'opponent_disconnected');
    white.send(JSON.stringify({ type: 'accept_draw' }));
    assert.deepEqual(await readWhite(m => m.type === 'result'), {
      type: 'result', winner: 'draw', reason: 'agreement'
    });

    const returned = await connect();
    const readReturned = inbox(returned);
    returned.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: joined.token }));
    await readReturned(m => m.type === 'joined');
    const finished = await readReturned(m => m.type === 'state');
    assert.equal(finished.result, 'draw');
    assert.equal(finished.reason, 'agreement');
    assert.equal(finished.drawOffer, undefined);

    // A request from either reserved seat survives a transport loss. Rejoining
    // restores the pending request, but cannot itself start the next game.
    returned.send(JSON.stringify({ type: 'rematch' }));
    assert.equal((await readWhite(m => m.type === 'rematch_requested')).color, 'b');
    returned.close();
    await readWhite(m => m.type === 'opponent_disconnected');
    const rematchSeat = await connect();
    const readRematch = inbox(rematchSeat);
    rematchSeat.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: joined.token }));
    await readRematch(m => m.type === 'joined');
    const pending = await readRematch(m => m.type === 'state');
    assert.equal(pending.gameOver, true, 'reconnect does not supply opponent consent');
    assert.equal(pending.activeClock, undefined);
    assert.equal((await readRematch(m => m.type === 'rematch_requested')).color, 'b');
    white.send(JSON.stringify({ type: 'rematch' }));
    const restarted = await readRematch(m => m.type === 'state' && m.rematch === true);
    assert.equal(restarted.gameOver, false);
    assert.deepEqual(restarted.history, []);
    assert.equal(restarted.activeClock, 'w');
    await readWhite(m => m.type === 'state' && m.rematch === true);

    // Starting a new game consumes both old requests.
    white.send(JSON.stringify({ type: 'resign' }));
    await readRematch(m => m.type === 'result');
    white.send(JSON.stringify({ type: 'rematch' }));
    await readRematch(m => m.type === 'rematch_requested' && m.color === 'w');
    rematchSeat.send(JSON.stringify({ type: 'move', from: 'e7', to: 'e5' }));
    assert.equal((await readRematch(m => m.type === 'error')).message, 'Game is over');
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
    let white = await connect();
    let readWhite = inbox(white);
    white.send(JSON.stringify({ type: 'create' }));
    const created = await readWhite(m => m.type === 'joined');
    const lobby = await readWhite(m => m.type === 'state');
    assert.deepEqual(lobby.clocks, { w: 1800, b: 1800 });
    assert.equal(lobby.increment, 120);
    assert.equal(lobby.activeClock, undefined);
    assert.equal(lobby.gameOver, false);
    assert.deepEqual(lobby.history, []);
    await delay(300);
    const recoveredHost = await connect();
    const readRecoveredHost = inbox(recoveredHost);
    recoveredHost.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: created.token }));
    await readRecoveredHost(m => m.type === 'joined');
    const recoveredLobby = await readRecoveredHost(m => m.type === 'state');
    assert.deepEqual(recoveredLobby.clocks, lobby.clocks, 'lobby time is not charged');
    assert.equal(recoveredLobby.activeClock, undefined);
    // Continue the active-game assertions on the current host connection.
    white = recoveredHost;
    readWhite = readRecoveredHost;
    const black = await connect();
    const readBlack = inbox(black);
    black.send(JSON.stringify({ type: 'join', roomId: created.roomId }));
    await readBlack(m => m.type === 'joined');
    const start = await readWhite(m => m.type === 'state' && m.activeClock === 'w');
    assert.equal(start.activeClock, 'w');
    assert.ok(start.clocks.w >= 1700 && start.clocks.w <= 1800);
    assert.ok(start.clocks.b >= 1700 && start.clocks.b <= 1800);
    assert.equal(start.increment, 120);

    white.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    const afterMove = await readWhite(m => m.type === 'state' && m.history.length === 1);
    assert.equal(afterMove.activeClock, 'b');
    assert.ok(afterMove.clocks.w > 1800 && afterMove.clocks.w <= 1920);
    assert.ok(afterMove.clocks.b >= 1750 && afterMove.clocks.b <= 1800);
    white.send(JSON.stringify({ type: 'offer_draw' }));
    await readBlack(m => m.type === 'draw_offered');
    const result = await readBlack(m => m.type === 'result' && m.reason === 'timeout');
    assert.equal(result.winner, 'white');
    assert.deepEqual(await readWhite(m => m.type === 'result' && m.reason === 'timeout'), result);
    const finalWhite = await readWhite(m => m.type === 'state' && m.reason === 'timeout');
    const finalBlack = await readBlack(m => m.type === 'state' && m.reason === 'timeout');
    assert.deepEqual(finalWhite, finalBlack, 'both seats receive identical final clocks');
    assert.equal(finalWhite.clocks.b, 0);
    assert.equal(finalWhite.activeClock, undefined);
    assert.equal(finalWhite.gameOver, true);
    assert.equal(finalWhite.drawOffer, undefined);
    const returned = await connect();
    const readReturned = inbox(returned);
    returned.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: created.token }));
    await readReturned(m => m.type === 'joined');
    const finished = await readReturned(m => m.type === 'state');
    assert.equal(finished.reason, 'timeout');
    assert.equal(finished.drawOffer, undefined, 'timeout clears a pending offer');
    assert.equal(finished.activeClock, undefined);
    assert.equal(finished.clocks.b, 0);
  } finally {
    for (const ws of clients) ws.terminate();
    child.kill('SIGTERM');
  }
});

test('waiting rooms reject gameplay actions and reconnect without starting the clock', { timeout: 15000 }, async () => {
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
    for (const action of [
      { type: 'move', from: 'e2', to: 'e4' },
      { type: 'resign' }, { type: 'offer_draw' }, { type: 'accept_draw' },
      { type: 'decline_draw' }, { type: 'rematch' }
    ]) {
      host.send(JSON.stringify(action));
      assert.equal((await readHost(m => m.type === 'error')).message, 'Waiting for an opponent');
    }

    const recovered = await connect();
    const readRecovered = inbox(recovered);
    recovered.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: created.token }));
    await readRecovered(m => m.type === 'joined');
    const waiting = await readRecovered(m => m.type === 'state');
    assert.deepEqual(waiting.history, []);
    assert.deepEqual(waiting.clocks, { w: 1000, b: 1000 });
    assert.equal(waiting.activeClock, undefined);
    assert.equal(waiting.gameOver, false);
    assert.equal(waiting.result, undefined);
    assert.equal(waiting.drawOffer, undefined);
    // Waiting longer than the time control must not forfeit an unstarted game.
    await delay(1200);
    const black = await connect();
    const readBlack = inbox(black);
    black.send(JSON.stringify({ type: 'join', roomId: created.roomId }));
    await readBlack(m => m.type === 'joined');
    const started = await readBlack(m => m.type === 'state');
    assert.equal(started.gameOver, false);
    assert.equal(started.drawOffer, undefined);
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

test('heartbeat detects silent peers and preserves their seat for reconnect', { timeout: 15000 }, async () => {
  const port = 30000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir, env: { ...process.env, PORT: String(port), HEARTBEAT_MS: '200' }, stdio: 'pipe'
  });
  const clients: WebSocket[] = [];
  async function connect(autoPong = true) {
    for (let i = 0; i < 50; i++) {
      try {
        const ws = await new Promise<WebSocket>((resolve, reject) => {
          const socket = new WebSocket('ws://127.0.0.1:' + port, { autoPong });
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
    const black = await connect(false);
    const readBlack = inbox(black);
    black.send(JSON.stringify({ type: 'join', roomId: created.roomId }));
    const joined = await readBlack(m => m.type === 'joined');
    await readWhite(m => m.type === 'state');
    white.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    const before = await readWhite(m => m.type === 'state' && m.history.length === 1);
    await readWhite(m => m.type === 'opponent_disconnected');
    assert.equal(white.readyState, WebSocket.OPEN, 'responsive peers survive heartbeat checks');

    const recovered = await connect();
    const readRecovered = inbox(recovered);
    recovered.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: joined.token }));
    await readRecovered(m => m.type === 'joined');
    const restored = await readRecovered(m => m.type === 'state');
    assert.deepEqual(restored.history, ['e4']);
    assert.equal(restored.activeClock, 'b');
    assert.ok(restored.clocks.b < before.clocks.b, 'clock keeps running during silent disconnect');
    recovered.send(JSON.stringify({ type: 'move', from: 'e7', to: 'e5' }));
    assert.deepEqual((await readWhite(m => m.type === 'state' && m.history.length === 2)).history, ['e4', 'e5']);
  } finally {
    for (const ws of clients) ws.terminate();
    child.kill('SIGTERM');
  }
});

test('oversized fragmented messages disconnect only the sender and preserve reconnect', { timeout: 15000 }, async () => {
  const port = 30000 + Math.floor(Math.random() * 2000);
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
    const black = await connect();
    const readBlack = inbox(black);
    black.send(JSON.stringify({ type: 'join', roomId: created.roomId }));
    const joined = await readBlack(m => m.type === 'joined');
    await readWhite(m => m.type === 'state');
    white.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    const before = await readWhite(m => m.type === 'state' && m.history.length === 1);
    // Each fragment is below the limit; the assembled message exceeds it.
    const closed = new Promise<void>(resolve => black.once('close', () => resolve()));
    black.send('x'.repeat(3000), { fin: false });
    black.send('x'.repeat(3000), { fin: true });
    await closed;
    await readWhite(m => m.type === 'opponent_disconnected');
    assert.equal(white.readyState, WebSocket.OPEN, 'opponent remains connected after payload rejection');

    const recovered = await connect();
    const readRecovered = inbox(recovered);
    recovered.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: joined.token }));
    await readRecovered(m => m.type === 'joined');
    const restored = await readRecovered(m => m.type === 'state');
    assert.deepEqual(restored.history, ['e4']);
    assert.equal(restored.activeClock, 'b');
    assert.ok(restored.clocks.b < before.clocks.b, 'clock keeps running during payload disconnect');
    recovered.send(JSON.stringify({ type: 'move', from: 'e7', to: 'e5' }));
    assert.deepEqual((await readWhite(m => m.type === 'state' && m.history.length === 2)).history, ['e4', 'e5']);
  } finally {
    for (const ws of clients) ws.terminate();
    child.kill('SIGTERM');
  }
});

test('returning seats receive accurate opponent presence after both players disconnect', { timeout: 15000 }, async () => {
  const port = 32000 + Math.floor(Math.random() * 2000);
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
  async function disconnect(ws: WebSocket) {
    const closed = new Promise<void>(resolve => ws.once('close', () => resolve()));
    ws.close();
    await closed;
  }
  try {
    const white = await connect(), readWhite = inbox(white);
    white.send(JSON.stringify({ type: 'create' }));
    const created = await readWhite(m => m.type === 'joined');
    const black = await connect(), readBlack = inbox(black);
    black.send(JSON.stringify({ type: 'join', roomId: created.roomId }));
    const joined = await readBlack(m => m.type === 'joined');
    await readWhite(m => m.type === 'state');
    await disconnect(black);
    await readWhite(m => m.type === 'opponent_disconnected');
    await disconnect(white);

    const returningWhite = await connect(), readReturningWhite = inbox(returningWhite);
    const whitePresence: string[] = [];
    returningWhite.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type.startsWith('opponent_')) whitePresence.push(msg.type);
    });
    returningWhite.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: created.token }));
    await readReturningWhite(m => m.type === 'joined');
    const restored = await readReturningWhite(m => m.type === 'state');
    assert.equal(restored.activeClock, 'w');
    await readReturningWhite(m => m.type === 'opponent_disconnected');
    assert.deepEqual(whitePresence, ['opponent_disconnected']);

    const returningBlack = await connect(), readReturningBlack = inbox(returningBlack);
    const blackPresence: string[] = [];
    returningBlack.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.type.startsWith('opponent_')) blackPresence.push(msg.type);
    });
    returningBlack.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: joined.token }));
    await readReturningBlack(m => m.type === 'joined');
    await readReturningBlack(m => m.type === 'state');
    assert.equal((await readReturningWhite(m => m.type === 'opponent_reconnected')).color, 'b');
    // A legal move is a response barrier after all reconnect notifications.
    returningWhite.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    await readReturningBlack(m => m.type === 'state' && m.history.length === 1);
    assert.deepEqual(blackPresence, [], 'the returning player must not get a self-reconnect notification');
    assert.deepEqual(whitePresence, ['opponent_disconnected', 'opponent_reconnected']);
  } finally {
    for (const ws of clients) ws.terminate();
    child.kill('SIGTERM');
  }
});

test('joining an offline host reports absence and recovers a playable game', { timeout: 15000 }, async () => {
  const port = 34000 + Math.floor(Math.random() * 2000);
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
    const host = await connect(), readHost = inbox(host);
    host.send(JSON.stringify({ type: 'create' }));
    const created = await readHost(m => m.type === 'joined');
    const closed = new Promise<void>(resolve => host.once('close', () => resolve()));
    host.close();
    await closed;

    const guest = await connect(), readGuest = inbox(guest);
    guest.send(JSON.stringify({ type: 'join', roomId: created.roomId }));
    assert.equal((await readGuest(m => m.type === 'joined')).color, 'b');
    const started = await readGuest(m => m.type === 'state');
    assert.equal(started.activeClock, 'w', 'clocks run while the host reconnects');
    assert.equal(started.gameOver, false);
    await readGuest(m => m.type === 'opponent_disconnected');

    const returningHost = await connect(), readReturningHost = inbox(returningHost);
    returningHost.send(JSON.stringify({ type: 'reconnect', roomId: created.roomId, token: created.token }));
    await readReturningHost(m => m.type === 'joined');
    assert.equal((await readGuest(m => m.type === 'opponent_reconnected')).color, 'w');
    returningHost.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    const moved = await readGuest(m => m.type === 'state' && m.history.length === 1);
    assert.deepEqual(moved.history, ['e4']);
    assert.equal(moved.activeClock, 'b');
    guest.send(JSON.stringify({ type: 'move', from: 'e7', to: 'e5' }));
    assert.deepEqual((await readReturningHost(m => m.type === 'state' && m.history.length === 2)).history, ['e4', 'e5']);
  } finally {
    for (const ws of clients) ws.terminate();
    child.kill('SIGTERM');
  }
});

for (const jump of [-60_000, 60_000]) {
  test(`online clocks ignore ${jump > 0 ? 'forward' : 'backward'} wall-clock adjustments`, { timeout: 15000 }, async () => {
    const port = 33000 + Math.floor(Math.random() * 2000);
    // Simulate repeated system clock corrections inside the server process.
    // Real elapsed time and the test runner's timers remain unaffected.
    const preload = 'data:text/javascript,' + encodeURIComponent(`
      const realNow = Date.now.bind(Date);
      let offset = 0;
      Date.now = () => realNow() + (offset += ${jump});
    `);
    const child = spawn(process.execPath, ['--import', 'tsx', '--import', preload, 'src/index.ts'], {
      cwd: serverDir,
      env: { ...process.env, PORT: String(port), CLOCK_BASE_MS: '5000', CLOCK_INCREMENT_MS: '0' },
      stdio: 'pipe'
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
      const white = await connect(), readWhite = inbox(white);
      white.send(JSON.stringify({ type: 'create' }));
      const created = await readWhite(m => m.type === 'joined');
      const black = await connect(), readBlack = inbox(black);
      black.send(JSON.stringify({ type: 'join', roomId: created.roomId }));
      await readBlack(m => m.type === 'joined');
      const initial = await readWhite(m => m.type === 'state' && m.activeClock === 'w');
      assert.ok(initial.clocks.w > 0 && initial.clocks.w <= 5000);
      const ticking = await readWhite(m => m.type === 'state' && m.clocks.w < initial.clocks.w);
      assert.equal(ticking.gameOver, false, 'clock adjustments must not cause a timeout');
      assert.ok(ticking.clocks.w > 0);
      assert.equal(ticking.clocks.b, 5000, 'the inactive clock stays unchanged');
      white.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
      const moved = await readBlack(m => m.type === 'state' && m.history.length === 1);
      assert.equal(moved.activeClock, 'b');
      assert.equal(moved.gameOver, false);
      assert.ok(moved.clocks.w > 0 && moved.clocks.w <= ticking.clocks.w);
      assert.ok(moved.clocks.b > 0 && moved.clocks.b <= 5000);
    } finally {
      for (const ws of clients) ws.terminate();
      child.kill('SIGTERM');
    }
  });
}

test('invalid timing settings preserve finite ticking clocks and connected seats', { timeout: 15000 }, async () => {
  const port = 35000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), CLOCK_BASE_MS: 'Infinity', CLOCK_INCREMENT_MS: 'Infinity', HEARTBEAT_MS: '2147483648' },
    stdio: 'pipe'
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
    const white = await connect(), readWhite = inbox(white);
    white.send(JSON.stringify({ type: 'create' }));
    const created = await readWhite(m => m.type === 'joined');
    const black = await connect(), readBlack = inbox(black);
    black.send(JSON.stringify({ type: 'join', roomId: created.roomId }));
    await readBlack(m => m.type === 'joined');
    const initial = await readWhite(m => m.type === 'state' && m.activeClock === 'w');
    assert.equal(typeof initial.clocks.w, 'number');
    assert.ok(initial.clocks.w > 0 && initial.clocks.w <= 300_000);
    assert.equal(initial.clocks.b, 300_000);
    assert.equal(initial.increment, 0);
    const ticking = await readWhite(m => m.type === 'state' && m.clocks.w < initial.clocks.w);
    assert.ok(ticking.clocks.w > 0);
    white.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
    const moved = await readBlack(m => m.type === 'state' && m.history.length === 1);
    assert.equal(moved.activeClock, 'b');
    assert.ok(moved.clocks.w > 0 && moved.clocks.w <= ticking.clocks.w);
    assert.ok(moved.clocks.b > 0 && moved.clocks.b <= 300_000);
    assert.equal(white.readyState, WebSocket.OPEN);
    assert.equal(black.readyState, WebSocket.OPEN);
  } finally {
    for (const ws of clients) ws.terminate();
    child.kill('SIGTERM');
  }
});
