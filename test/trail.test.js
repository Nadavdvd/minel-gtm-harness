import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { append, tail, readAll, TRAIL_SCHEMA_VERSION } from '../src/trail.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'minel-trail-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('append adds schema_version and ts if the caller did not set them', () => {
  withTempDir((dir) => {
    const trailPath = join(dir, 'trail.jsonl');
    append(trailPath, { type: 'latch_verdict', verdict: 'PASS' });
    const rows = readAll(trailPath);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].schema_version, TRAIL_SCHEMA_VERSION);
    assert.equal(typeof rows[0].ts, 'string');
    assert.equal(rows[0].type, 'latch_verdict');
  });
});

test('the Trail is append-only: writing three rows leaves all three, in order', () => {
  withTempDir((dir) => {
    const trailPath = join(dir, 'trail.jsonl');
    append(trailPath, { type: 'latch_verdict', verdict: 'PASS' });
    append(trailPath, { type: 'latch_verdict', verdict: 'HOLD' });
    append(trailPath, { type: 'latch_verdict', verdict: 'FAIL' });
    const rows = readAll(trailPath);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.verdict), ['PASS', 'HOLD', 'FAIL']);
  });
});

test('tail returns only the last n rows, oldest-of-the-tail first', () => {
  withTempDir((dir) => {
    const trailPath = join(dir, 'trail.jsonl');
    for (let i = 0; i < 5; i += 1) append(trailPath, { type: 'latch_verdict', i });
    const last2 = tail(trailPath, 2);
    assert.deepEqual(last2.map((r) => r.i), [3, 4]);
  });
});

test('every row has schema_version, no exceptions, across many appends', () => {
  withTempDir((dir) => {
    const trailPath = join(dir, 'trail.jsonl');
    for (let i = 0; i < 40; i += 1) {
      append(trailPath, { type: i % 2 === 0 ? 'latch_verdict' : 'tether_advance', i });
    }
    const rows = readAll(trailPath);
    assert.equal(rows.length, 40);
    assert.ok(rows.every((r) => r.schema_version === TRAIL_SCHEMA_VERSION));
  });
});

test('reading a Trail file that does not exist yet returns an empty array', () => {
  withTempDir((dir) => {
    const rows = readAll(join(dir, 'never-written.jsonl'));
    assert.deepEqual(rows, []);
  });
});

test('the underlying file never shrinks after an append (true append, not rewrite)', () => {
  withTempDir((dir) => {
    const trailPath = join(dir, 'trail.jsonl');
    append(trailPath, { type: 'latch_verdict', verdict: 'PASS' });
    const sizeAfterOne = readFileSync(trailPath, 'utf8').length;
    append(trailPath, { type: 'latch_verdict', verdict: 'HOLD' });
    const sizeAfterTwo = readFileSync(trailPath, 'utf8').length;
    assert.ok(sizeAfterTwo > sizeAfterOne);
  });
});
