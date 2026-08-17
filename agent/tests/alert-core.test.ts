import assert from 'node:assert/strict';
import test from 'node:test';

test('core module exposes the planned facade factory', async () => {
  const module = await import('../src/index.js');
  assert.equal(typeof module.createSreCore, 'function');
  assert.equal(typeof module.FakeAlertAdapter, 'function');
});
