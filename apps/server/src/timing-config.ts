// Node timers above this limit overflow to a 1 ms interval. Reject them rather
// than accidentally turning heartbeat checks into an immediate disconnect loop.
const MAX_TIMER_MS = 2 ** 31 - 1;

function milliseconds(raw: string | undefined, fallback: number, minimum: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value > MAX_TIMER_MS) return fallback;
  return Math.max(minimum, value);
}

/** Always publish finite clocks and keep heartbeat intervals in Node's range. */
export function timingConfig(env: Record<string, string | undefined>) {
  return {
    baseMs: milliseconds(env.CLOCK_BASE_MS, 5 * 60_000, 1_000),
    incrementMs: milliseconds(env.CLOCK_INCREMENT_MS, 0, 0),
    heartbeatMs: milliseconds(env.HEARTBEAT_MS, 30_000, 100)
  };
}
