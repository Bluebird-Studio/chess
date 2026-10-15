import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { timingConfig } from './timing-config.js';

test('timing configuration defaults missing, blank, malformed and non-finite values', () => {
  for (const value of [undefined, '', '  ', 'invalid', 'NaN', 'Infinity', '-Infinity', '1e309', '2147483648']) {
    assert.deepEqual(timingConfig({ CLOCK_BASE_MS: value, CLOCK_INCREMENT_MS: value, HEARTBEAT_MS: value }), {
      baseMs: 300_000, incrementMs: 0, heartbeatMs: 30_000
    }, `configuration value: ${value}`);
  }
});

test('timing configuration retains valid controls and clamps small durations', () => {
  assert.deepEqual(timingConfig({ CLOCK_BASE_MS: '60000', CLOCK_INCREMENT_MS: '2000', HEARTBEAT_MS: '500' }), {
    baseMs: 60_000, incrementMs: 2_000, heartbeatMs: 500
  });
  for (const value of ['0', '-1']) {
    assert.deepEqual(timingConfig({ CLOCK_BASE_MS: value, CLOCK_INCREMENT_MS: value, HEARTBEAT_MS: value }), {
      baseMs: 1_000, incrementMs: 0, heartbeatMs: 100
    });
  }
});
