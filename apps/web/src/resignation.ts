/** The human is White against bots; online seats are independent of whose turn it is. */
export function resigningColor(mode: 'local' | 'bot' | 'online', turn: 'w' | 'b', seat: 'w' | 'b' | null): 'w' | 'b' | null {
  return mode === 'bot' ? 'w' : mode === 'online' ? seat : turn;
}
