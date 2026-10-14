import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess, type Square } from 'chess.js';
import { RotateCcw, Undo2, Crown, ArrowLeftRight } from 'lucide-react';
import { selectBotMove, type BotLevel } from '@bluebird/chess-engine';
import './style.css';

const glyphs: Record<string,string>={wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟'};
const files='abcdefgh';
const levels: {id:BotLevel;name:string;description:string}[]=[
{id:'random',name:'The Beginner',description:'An unpredictable first opponent'},
{id:'greedy',name:'The Collector',description:'Loves winning material'},
{id:'minimax',name:'The Thinker',description:'Looks a few moves ahead'}];
function App(){
 const [game,setGame]=useState(()=>new Chess());
 const [selected,setSelected]=useState<Square|null>(null);
 const [flipped,setFlipped]=useState(false);
 const [mode,setMode]=useState<'local'|'bot'>('local');
 const [level,setLevel]=useState<BotLevel>('random');
 const [thinking,setThinking]=useState(false);
 const legal=useMemo(()=>selected?game.moves({square:selected,verbose:true}).map(m=>m.to):[],[game,selected]);
 const history=game.history();
 const squares=Array.from({length:64},(_,i)=>{const rank=flipped?Math.floor(i/8)+1:8-Math.floor(i/8);const file=files[flipped?7-i%8:i%8];return `${file}${rank}` as Square});
 const status=game.isCheckmate()?'Checkmate · '+(game.turn()==='w'?'Black':'White')+' wins':game.isDraw()?'Game drawn':game.isCheck()?'Check · '+(game.turn()==='w'?'White':'Black')+' to move':(game.turn()==='w'?'White':'Black')+' to move';
 function reset(){setGame(new Chess());setSelected(null);setThinking(false)}
 function undo(){const next=new Chess();next.loadPgn(game.pgn());next.undo();if(mode==='bot')next.undo();setGame(next);setSelected(null)}
 function move(from:Square,to:Square){const next=new Chess();next.loadPgn(game.pgn());try{next.move({from,to,promotion:'q'});}catch{return;}setGame(next);setSelected(null);
  if(mode==='bot'&&!next.isGameOver()){setThinking(true);setTimeout(()=>{const copy=new Chess();copy.loadPgn(next.pgn());const botMove=selectBotMove(copy,level);if(botMove)copy.move(botMove);setGame(copy);setThinking(false)},350);}
 }
 function click(sq:Square){if(thinking||game.isGameOver()||(mode==='bot'&&game.turn()==='b'))return;const piece=game.get(sq);if(selected&&legal.includes(sq)){move(selected,sq);return;}setSelected(piece?.color===game.turn()?sq:null)}
 return <div className="app"><header className="topbar"><div className="brand"><span className="brandmark">♞</span><span>BLUEBIRD <strong>CHESS</strong></span></div><span className="topright">THE ART OF THE GAME <span className="dot"/></span></header><main className="layout"><section className="board-column"><div className="eyebrow">THE CLASSIC GAME, REIMAGINED</div><h1>Make your <em>move.</em></h1><p className="lead">A timeless game. A beautiful place to play.</p><div className="player"><span className="avatar dark">♚</span><div><b>{mode==='bot'?levels.find(x=>x.id===level)?.name:'Black pieces'}</b><small>{mode==='bot'?'Computer opponent':'Local player'}</small></div><span className="player-side">BLACK</span></div><div className="board" role="grid" aria-label="Chessboard">{squares.map((sq,i)=>{const piece=game.get(sq);const isLight=(files.indexOf(sq[0])+Number(sq[1]))%2===0;const active=selected===sq;const target=legal.includes(sq);return <button type="button" role="gridcell" aria-label={`${sq} ${piece?piece.color==='w'?'white':'black':''} ${piece?.type||'empty'}`} key={sq} onClick={()=>click(sq)} className={`square ${isLight?'light':'dark'} ${active?'active':''} ${target?'target':''}`}><span className={`piece ${piece?.color==='w'?'white-piece':'black-piece'}`}>{piece?glyphs[piece.color+piece.type]:''}</span>{i%8===0&&<span className="rank">{sq[1]}</span>}{Math.floor(i/8)===7&&<span className="file">{sq[0]}</span>}</button>})}</div><div className="player"><span className="avatar light-avatar">♔</span><div><b>White pieces</b><small>{mode==='bot'?'You':'Local player'}</small></div><span className="player-side">WHITE</span></div></section><aside className="sidebar"><div className="panel"><span className="eyebrow">YOUR TABLE</span><h2>Play chess</h2><p>Choose your game, then settle in.</p><div className="segmented"><button className={mode==='local'?'chosen':''} onClick={()=>{setMode('local');reset()}}>Two players</button><button className={mode==='bot'?'chosen':''} onClick={()=>{setMode('bot');reset()}}>Play a bot</button></div>{mode==='bot'&&<div className="bot-select"><label htmlFor="bot">CHOOSE YOUR OPPONENT</label><select id="bot" value={level} onChange={e=>{setLevel(e.target.value as BotLevel);reset()}}>{levels.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}</select><small>{levels.find(l=>l.id===level)?.description}</small></div>}<div className="status"><span className="status-dot"/><span>{thinking?'Computer is thinking…':status}</span></div><div className="actions"><button onClick={undo} disabled={!history.length||thinking}><Undo2 size={17}/> Undo</button><button onClick={()=>setFlipped(!flipped)}><ArrowLeftRight size={17}/> Flip</button><button onClick={reset}><RotateCcw size={17}/> New game</button></div></div><div className="panel moves"><div className="moves-heading"><span className="eyebrow">THE STORY SO FAR</span><Crown size={17}/></div><h2>Move history</h2>{!history.length?<p className="empty">Every great game begins with a first move.</p>:<div className="move-list">{Array.from({length:Math.ceil(history.length/2)},(_,i)=><div className="move-row" key={i}><span>{i+1}.</span><b>{history[2*i]}</b><b>{history[2*i+1]||'—'}</b></div>)}</div>}</div><footer>BLUEBIRD STUDIO <span>EST. 2026</span></footer></aside></main></div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
