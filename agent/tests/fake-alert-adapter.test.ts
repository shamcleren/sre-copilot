import assert from 'node:assert/strict';
import test from 'node:test';

test('fake adapter module exposes the planned adapter class', async () => {
  const module = await import('../src/fake-alert-adapter.js');
  assert.equal(typeof module.FakeAlertAdapter, 'function');
});
