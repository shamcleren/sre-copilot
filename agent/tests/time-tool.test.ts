import assert from 'node:assert/strict';
import test from 'node:test';
import { getCurrentTime } from '../src/time-tool.js';

test('time tool formats an injected Asia/Shanghai time', () => {
  const result = getCurrentTime({
    now: new Date('2026-08-17T08:00:00.000Z'),
    timeZone: 'Asia/Shanghai',
    model: 'demo-model',
  });

  assert.equal(result.timestamp, '2026-08-17T08:00:00.000Z');
  assert.equal(result.timeZone, 'Asia/Shanghai');
  assert.match(result.utcOffset, /GMT\+08(:00)?/);
  assert.equal(result.model, 'demo-model');
});

test('time tool preserves an explicit not-configured model label', () => {
  const result = getCurrentTime({
    now: new Date('2026-08-17T00:00:00.000Z'),
    timeZone: 'UTC',
    model: 'not-configured',
  });

  assert.equal(result.model, 'not-configured');
  assert.equal(result.timeZone, 'UTC');
});
