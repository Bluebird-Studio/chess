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
