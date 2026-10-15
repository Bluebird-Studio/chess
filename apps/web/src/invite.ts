export function inviteRoom(url: string): string | null {
  const room = new URL(url).searchParams.get('room')?.toUpperCase();
  return room && /^[A-Z0-9]{8}$/.test(room) ? room : null;
}

export function inviteLink(url: string, room: string): string {
  const link = new URL(url);
  link.search = '';
  link.hash = '';
  link.searchParams.set('room', room);
  return link.toString();
}

export type SavedSeat = { roomId: string; color: 'w' | 'b' };
export function readSavedSeat(value: string | null): SavedSeat | null {
  try {
    const seat = JSON.parse(value ?? 'null');
    return seat && typeof seat.roomId === 'string' && /^[A-Z0-9]{8}$/.test(seat.roomId)
      && (seat.color === 'w' || seat.color === 'b') ? { roomId: seat.roomId, color: seat.color } : null;
  } catch { return null; }
}
