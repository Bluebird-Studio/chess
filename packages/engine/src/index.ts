import { Chess, type Move } from 'chess.js';
export type BotLevel='random'|'greedy'|'minimax';
const values:Record<string,number>={p:100,n:320,b:330,r:500,q:900,k:20000};
function evaluate(g:Chess){let score=0;for(const row of g.board())for(const p of row)if(p)score+=(p.color==='w'?1:-1)*values[p.type];return score}
function minimax(g:Chess,depth:number,alpha:number,beta:number):number{
 if(g.isCheckmate())return g.turn()==='w'?-100000-depth:100000+depth;
 if(g.isDraw())return 0;
 if(depth===0)return evaluate(g);
 const maximizing=g.turn()==='w';let best=maximizing?-Infinity:Infinity;
 for(const move of g.moves({verbose:true})){g.move(move);const v=minimax(g,depth-1,alpha,beta);g.undo();best=maximizing?Math.max(best,v):Math.min(best,v);if(maximizing)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);if(beta<=alpha)break}
 return best
}
export function selectBotMove(g:Chess,level:BotLevel):Move|null{
 const moves=g.moves({verbose:true});if(!moves.length)return null;
 if(level==='random')return moves[Math.floor(Math.random()*moves.length)];
 if(level==='greedy')return [...moves].sort((a,b)=>(values[b.captured||'']||0)-(values[a.captured||'']||0))[0];
 const maximizing=g.turn()==='w';let best=moves[0],score=maximizing?-Infinity:Infinity;
 for(const m of moves){g.move(m);const v=minimax(g,2,-Infinity,Infinity);g.undo();if(maximizing?v>score:v<score){score=v;best=m}}
 return best
}
