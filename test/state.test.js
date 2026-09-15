import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJSON, writeJSONAtomic } from '../src/state.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'minel-state-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('readJSON returns the fallback when the file does not exist', () => {
  withTempDir((dir) => {
    const result = readJSON(join(dir, 'missing.json'), { fallback: true });
    assert.deepEqual(result, { fallback: true });
  });
});

test('writeJSONAtomic then readJSON round-trips the data exactly', () => {
  withTempDir((dir) => {
    const path = join(dir, 'state.json');
    const data = { a: 1, b: ['x', 'y'], c: { nested: true } };
    writeJSONAtomic(path, data);
    const readBack = readJSON(path, null);
    assert.deepEqual(readBack, data);
  });
});

test('writeJSONAtomic creates a missing parent directory', () => {
  withTempDir((dir) => {
    const path = join(dir, 'nested', 'deeper', 'state.json');
    writeJSONAtomic(path, { ok: true });
    assert.ok(existsSync(path));
  });
});

test('writeJSONAtomic leaves no leftover temp files behind', () => {
  withTempDir((dir) => {
    const path = join(dir, 'state.json');
    for (let i = 0; i < 10; i += 1) writeJSONAtomic(path, { i });
    const entries = readdirSync(dir);
    assert.deepEqual(entries, ['state.json']);
  });
});

test('the target file is always valid JSON after many rapid sequential writes', () => {
  withTempDir((dir) => {
    const path = join(dir, 'state.json');
    for (let i = 0; i < 50; i += 1) {
      writeJSONAtomic(path, { i, payload: 'x'.repeat(200) });
    }
    const final = readJSON(path, null);
    assert.equal(final.i, 49);
  });
});
