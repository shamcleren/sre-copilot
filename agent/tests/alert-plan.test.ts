import assert from 'node:assert/strict';
import test from 'node:test';

test('alert plan module is ready for the first implementation', async () => {
  const module = await import('../src/alert-plan.js');
  assert.equal(typeof module.buildAlertRule, 'function');
  assert.equal(typeof module.summarizeAlertDiff, 'function');
  assert.equal(typeof module.createAlertPlan, 'function');
});
