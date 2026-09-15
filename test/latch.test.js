import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../src/latch.js';

const RULES = [
  { id: 'banned-phrases', type: 'banned-phrases', rung: 'hold', phrases: ['act now', 'guaranteed results'] },
  { id: 'one-ask-only', type: 'max-asks', rung: 'flag', max: 1 },
  { id: 'stale-reference-date', type: 'stale-reference-date', rung: 'flag', field: 'referenceDate', maxAgeDays: 30 },
  { id: 'required-fields', type: 'required-fields', rung: 'hold', fields: ['recipient', 'subject'] },
];

const TODAY = new Date('2026-09-15T00:00:00Z');

test('clean message with no rule violations scores PASS', () => {
  const message = { recipient: 'Jordan', subject: 'Hi', text: 'One clean ask?', referenceDate: '2026-09-10' };
  const result = score(message, RULES, { today: TODAY });
  assert.equal(result.verdict, 'PASS');
  assert.deepEqual(result.firedRules, []);
});

test('a hold-rung rule firing produces FAIL', () => {
  const message = { recipient: 'Jordan', subject: 'Hi', text: 'Act now for guaranteed results.' };
  const result = score(message, RULES, { today: TODAY });
  assert.equal(result.verdict, 'FAIL');
  assert.ok(result.firedRules.some((r) => r.id === 'banned-phrases'));
});

test('only a flag-rung rule firing produces HOLD, not FAIL', () => {
  const message = { recipient: 'Jordan', subject: 'Hi', text: 'One? Two? Three?' };
  const result = score(message, RULES, { today: TODAY });
  assert.equal(result.verdict, 'HOLD');
  assert.equal(result.firedRules.length, 1);
  assert.equal(result.firedRules[0].id, 'one-ask-only');
});

test('missing required fields produces FAIL with both fields named', () => {
  const message = { text: 'No recipient or subject here.' };
  const result = score(message, RULES, { today: TODAY });
  assert.equal(result.verdict, 'FAIL');
  const fired = result.firedRules.find((r) => r.id === 'required-fields');
  assert.ok(fired);
  assert.match(fired.reason, /recipient/);
  assert.match(fired.reason, /subject/);
});

test('an empty-string required field counts as missing, not present', () => {
  const message = { recipient: '   ', subject: 'Hi', text: 'One ask?' };
  const result = score(message, RULES, { today: TODAY });
  assert.equal(result.verdict, 'FAIL');
});

test('a stale referenceDate fires the flag-rung rule', () => {
  const message = { recipient: 'Jordan', subject: 'Hi', text: 'One ask?', referenceDate: '2026-06-01' };
  const result = score(message, RULES, { today: TODAY });
  assert.equal(result.verdict, 'HOLD');
  assert.ok(result.firedRules.some((r) => r.id === 'stale-reference-date'));
});

test('a referenceDate exactly at the age boundary does not fire', () => {
  // TODAY is 2026-09-15; 30 days before is 2026-08-16.
  const message = { recipient: 'Jordan', subject: 'Hi', text: 'One ask?', referenceDate: '2026-08-16' };
  const result = score(message, RULES, { today: TODAY });
  assert.equal(result.verdict, 'PASS');
});

test('a referenceDate one day past the boundary fires', () => {
  const message = { recipient: 'Jordan', subject: 'Hi', text: 'One ask?', referenceDate: '2026-08-15' };
  const result = score(message, RULES, { today: TODAY });
  assert.equal(result.verdict, 'HOLD');
});

test('exactly the max number of asks does not fire max-asks', () => {
  const message = { recipient: 'Jordan', subject: 'Hi', text: 'One ask?' };
  const result = score(message, RULES, { today: TODAY });
  assert.equal(result.verdict, 'PASS');
});

test('scoring is deterministic: identical input, identical output, repeatedly', () => {
  const message = { recipient: 'Jordan', subject: 'Hi', text: 'Act now.', referenceDate: '2026-09-10' };
  const first = score(message, RULES, { today: TODAY });
  for (let i = 0; i < 25; i += 1) {
    const again = score(message, RULES, { today: TODAY });
    assert.deepEqual(again, first);
  }
});

test('an unknown rule type throws rather than silently passing', () => {
  const badRules = [{ id: 'mystery', type: 'not-a-real-type', rung: 'hold' }];
  assert.throws(() => score({ text: 'hi' }, badRules, { today: TODAY }));
});
