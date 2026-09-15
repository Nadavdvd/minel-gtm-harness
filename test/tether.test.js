import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createManifestEntry, advance } from '../src/tether.js';

const SEQUENCE = {
  id: 'default-sequence',
  steps: [
    { name: 'connect', rung: 'clear', waitDaysAfter: 3 },
    { name: 'message', rung: 'flag', waitDaysAfter: 4 },
    { name: 'follow-up', rung: 'hold', waitDaysAfter: 0 },
  ],
};

test('a fresh entry advances on the first call (nothing to wait for)', () => {
  const entry = createManifestEntry('c1', SEQUENCE.id);
  const result = advance(entry, SEQUENCE, new Date('2026-09-15'));
  assert.equal(result.advanced, true);
  assert.equal(result.manifestEntry.stepIndex, 1);
  assert.equal(result.manifestEntry.lastTouchAt, '2026-09-15');
  assert.equal(result.manifestEntry.nextDueAt, '2026-09-18');
  assert.equal(result.nextAction.step, 'message');
});

test('advancing before the next-due date is a no-op', () => {
  const entry = createManifestEntry('c1', SEQUENCE.id);
  const first = advance(entry, SEQUENCE, new Date('2026-09-15'));
  const second = advance(first.manifestEntry, SEQUENCE, new Date('2026-09-16'));
  assert.equal(second.advanced, false);
  assert.equal(second.manifestEntry.stepIndex, 1); // unchanged
  assert.match(second.reason, /not yet due/);
});

test('advancing exactly on the due date fires the next step', () => {
  const entry = createManifestEntry('c1', SEQUENCE.id);
  const first = advance(entry, SEQUENCE, new Date('2026-09-15'));
  const second = advance(first.manifestEntry, SEQUENCE, new Date('2026-09-18'));
  assert.equal(second.advanced, true);
  assert.equal(second.manifestEntry.stepIndex, 2);
  assert.equal(second.nextAction.step, 'follow-up');
});

test('advancing twice on the same due date does not double-advance (idempotent)', () => {
  const entry = createManifestEntry('c1', SEQUENCE.id);
  const first = advance(entry, SEQUENCE, new Date('2026-09-15'));
  const secondCallSameDay = advance(first.manifestEntry, SEQUENCE, new Date('2026-09-15'));
  // nextDueAt after step 1 is 2026-09-18, so calling again on 09-15 (same
  // day as the first touch) must NOT fire step 2 early.
  assert.equal(secondCallSameDay.advanced, false);
  assert.equal(secondCallSameDay.manifestEntry.stepIndex, 1);
});

test('the sequence completes after its last step fires', () => {
  let entry = createManifestEntry('c1', SEQUENCE.id);
  entry = advance(entry, SEQUENCE, new Date('2026-09-15')).manifestEntry; // connect
  entry = advance(entry, SEQUENCE, new Date('2026-09-18')).manifestEntry; // message
  const result = advance(entry, SEQUENCE, new Date('2026-09-22')); // follow-up
  assert.equal(result.advanced, true);
  assert.equal(result.manifestEntry.status, 'completed');
  assert.equal(result.nextAction, null);
});

test('advancing a completed sequence is a permanent no-op', () => {
  let entry = createManifestEntry('c1', SEQUENCE.id);
  entry = advance(entry, SEQUENCE, new Date('2026-09-15')).manifestEntry;
  entry = advance(entry, SEQUENCE, new Date('2026-09-18')).manifestEntry;
  entry = advance(entry, SEQUENCE, new Date('2026-09-22')).manifestEntry;
  assert.equal(entry.status, 'completed');
  const result = advance(entry, SEQUENCE, new Date('2027-01-01'));
  assert.equal(result.advanced, false);
  assert.match(result.reason, /already completed/);
});

test('cutoffEngaged halts an advance even when the step is due', () => {
  const entry = createManifestEntry('c1', SEQUENCE.id);
  const result = advance(entry, SEQUENCE, new Date('2026-09-15'), { cutoffEngaged: true });
  assert.equal(result.advanced, false);
  assert.match(result.reason, /Cutoff is engaged/);
  assert.equal(result.manifestEntry.stepIndex, 0); // state untouched
});
