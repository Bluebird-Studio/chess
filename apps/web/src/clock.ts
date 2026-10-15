export type ClockState = { w: number; b: number; active: 'w' | 'b'; since: number };
export function remaining(clock: ClockState, now: number): { w: number; b: number } {
  return { ...{ w: clock.w, b: clock.b }, [clock.active]: Math.max(0, clock[clock.active] - Math.max(0, now - clock.since)) };
}
export function switchClock(clock: ClockState, now: number): ClockState {
  return { ...remaining(clock, now), active: clock.active === 'w' ? 'b' : 'w', since: now };
}
export function formatClock(milliseconds: number): string {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
