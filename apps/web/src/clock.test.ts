import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { remaining, switchClock, formatClock } from './clock';
test('only the active clock runs and switches preserve elapsed time', () => {
  const start = { w: 300000, b: 300000, active: 'w' as const, since: 1000 };
  assert.deepEqual(remaining(start, 2500), { w: 298500, b: 300000 });
  const black = switchClock(start, 2500);
  assert.deepEqual(remaining(black, 5000), { w: 298500, b: 297500 });
  assert.deepEqual(remaining(start, 0), { w: 300000, b: 300000 });
});
test('timeout clamps at zero and display rounds up', () => {
  assert.equal(remaining({ w: 100, b: 100, active: 'b', since: 0 }, 500).b, 0);
  assert.equal(formatClock(1), '0:01');
  assert.equal(formatClock(60000), '1:00');
  assert.equal(formatClock(-10), '0:00');
});
test('increment rewards only the mover after elapsed time and leaves the opponent unchanged', () => {
  const start = { w: 60000, b: 60000, active: 'w' as const, since: 1000 };
  const black = switchClock(start, 2500, 3000);
  assert.deepEqual(black, { w: 61500, b: 60000, active: 'b', since: 2500 });
  assert.deepEqual(switchClock(black, 4500, 3000), { w: 61500, b: 61000, active: 'w', since: 4500 });
  assert.deepEqual(start, { w: 60000, b: 60000, active: 'w', since: 1000 });
  // Undo snapshots use remaining() before switching, so they exclude the reward.
  assert.deepEqual(remaining(start, 2500), { w: 58500, b: 60000 });
});
test('increment cannot revive expired time or deduct time when negative', () => {
  const start = { w: 1000, b: 60000, active: 'w' as const, since: 0 };
  assert.equal(switchClock(start, 1000, 3000).w, 0);
  assert.equal(switchClock(start, 500, -3000).w, 500);
});
