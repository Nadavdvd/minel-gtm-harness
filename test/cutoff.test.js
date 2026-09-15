import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isEngaged, engage, disengage, getState } from '../src/cutoff.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'minel-cutoff-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('isEngaged is false when no cutoff file has ever been written', () => {
  withTempDir((dir) => {
    assert.equal(isEngaged(join(dir, 'cutoff.json')), false);
  });
});

test('engage() persists engaged=true with a reason and a timestamp', () => {
  withTempDir((dir) => {
    const path = join(dir, 'cutoff.json');
    engage(path, 'test reason');
    const state = getState(path);
    assert.equal(state.engaged, true);
    assert.equal(state.reason, 'test reason');
    assert.equal(typeof state.engagedAt, 'string');
    assert.equal(isEngaged(path), true);
  });
});

test('disengage() clears the state back to not-engaged', () => {
  withTempDir((dir) => {
    const path = join(dir, 'cutoff.json');
    engage(path, 'test reason');
    disengage(path);
    assert.equal(isEngaged(path), false);
    const state = getState(path);
    assert.equal(state.reason, null);
  });
});

test('the on-disk file is always valid, parseable JSON — never a half-written file', () => {
  withTempDir((dir) => {
    const path = join(dir, 'cutoff.json');
    for (let i = 0; i < 20; i += 1) {
      engage(path, `reason-${i}`);
      disengage(path);
    }
    const raw = readFileSync(path, 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw));
  });
});
