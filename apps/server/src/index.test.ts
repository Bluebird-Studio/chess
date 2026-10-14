import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
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
 const child=spawn(process.execPath,['--import','tsx','src/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(port)},stdio:'pipe'});
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
 }finally{for(const ws of clients)ws.terminate();child.kill('SIGTERM')}
});
