import { Chess } from 'chess.js';
import { selectBotMove } from '@bluebird/chess-engine';

/** A short, bounded continuation from the original engine, not a precise evaluation. */
export function candidateLine(pgn: string): string[] {
  const game = new Chess();
  game.loadPgn(pgn);
  const line: string[] = [];
  for (let ply = 0; ply < 3 && !game.isGameOver(); ply++) {
    const move = selectBotMove(game, 'alphabeta', { maxTimeMs: 180, maxNodes: 1800 });
    if (!move) break;
    line.push(game.move(move).san);
  }
  return line;
}
