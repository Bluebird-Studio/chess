import { WebSocketServer, WebSocket } from 'ws';
import { Chess, type Square } from 'chess.js';
import { randomUUID } from 'node:crypto';
type Room={game:Chess;players:Map<WebSocket,'w'|'b'>;result?:string;rematch:Set<'w'|'b'>};
const rooms=new Map<string,Room>();
const wss=new WebSocketServer({port:Number(process.env.PORT||8080)});
function send(ws:WebSocket,data:unknown){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data))}
function broadcast(room:Room,data:unknown){for(const ws of room.players.keys())send(ws,data)}
wss.on('connection',ws=>{
 let roomId:string|undefined;
 ws.on('message',raw=>{
  try{
   const msg=JSON.parse(raw.toString());
   if(msg.type==='create'){roomId=randomUUID().slice(0,8).toUpperCase();const room:Room={game:new Chess(),players:new Map([[ws,'w']]),rematch:new Set()};rooms.set(roomId,room);send(ws,{type:'joined',roomId,color:'w',fen:room.game.fen()});return}
   if(msg.type==='join'&&typeof msg.roomId==='string'){const id=msg.roomId.toUpperCase();const room=rooms.get(id);if(!room||room.players.size>=2){send(ws,{type:'error',message:'Room unavailable'});return}roomId=id;room.players.set(ws,'b');send(ws,{type:'joined',roomId:id,color:'b',fen:room.game.fen()});broadcast(room,{type:'state',fen:room.game.fen(),history:room.game.history()});return}
   if(msg.type==='resign'&&roomId){const room=rooms.get(roomId);const color=room?.players.get(ws);if(!room||!color||room.result)return;room.result=color==='w'?'black':'white';broadcast(room,{type:'result',winner:room.result,reason:'resignation'});return}
   if(msg.type==='rematch'&&roomId){const room=rooms.get(roomId);const color=room?.players.get(ws);if(!room||!color||!room.result)return;room.rematch.add(color);broadcast(room,{type:'rematch_requested',color});if(room.rematch.size===2){room.game=new Chess();room.result=undefined;room.rematch.clear();broadcast(room,{type:'state',fen:room.game.fen(),history:[],gameOver:false,rematch:true})}return}
   if(msg.type==='move'&&roomId){const room=rooms.get(roomId);if(!room||room.result||room.players.get(ws)!==room.game.turn())return;const from=msg.from as Square,to=msg.to as Square;if(typeof from!=='string'||typeof to!=='string')return;try{room.game.move({from,to,promotion:msg.promotion||'q'})}catch{send(ws,{type:'error',message:'Illegal move'});return}broadcast(room,{type:'state',fen:room.game.fen(),history:room.game.history(),gameOver:room.game.isGameOver()})}
  }catch{send(ws,{type:'error',message:'Invalid message'})}
 });
 ws.on('close',()=>{if(!roomId)return;const room=rooms.get(roomId);if(!room)return;room.players.delete(ws);room.rematch.clear();broadcast(room,{type:'opponent_disconnected'});if(!room.players.size)rooms.delete(roomId)});
});
console.log('Chess WebSocket server listening on port '+(process.env.PORT||8080));
