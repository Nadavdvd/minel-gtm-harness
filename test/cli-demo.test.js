// cli-demo.test.js — spawns the real CLI as a subprocess (not an import),
// the way a stranger cloning the repo actually runs it, and asserts on
// stdout. This is the one test that proves "clone and run" actually works
// end to end, not just that the internal functions compose correctly.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, 'bin', 'minel.js');

// Each test FILE gets its own isolated data directory (via MINEL_DATA_DIR),
// not the repo's own data/ — node's test runner runs test files
// concurrently by default, and two files hammering the same shared state
// files is a real race, not a hypothetical one (caught by this exact
// suite: see the cross-process Cutoff test in cli-adversarial.test.js).
let dataDir;
before(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'minel-cli-demo-test-'));
});
after(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function runCli(args) {
  return spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, MINEL_DATA_DIR: dataDir },
  });
}

test('minel demo runs clean, exits 0, and touches every piece', () => {
  const result = runCli(['demo']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Latch verdict: PASS/);
  assert.match(result.stdout, /Latch verdict: FAIL/);
  assert.match(result.stdout, /Latch verdict: HOLD/);
  assert.match(result.stdout, /Tether: advanced/);
  assert.match(result.stdout, /Cutoff engaged/);
  assert.match(result.stdout, /Cutoff disengaged/);
  assert.match(result.stdout, /demo complete/);
});

test('minel with no arguments prints usage and does not crash', () => {
  const result = runCli([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
});

test('minel with an unknown command exits non-zero', () => {
  const result = runCli(['not-a-real-command']);
  assert.notEqual(result.status, 0);
});

test('minel latch score on a missing file exits non-zero, does not throw a stack trace at the user', () => {
  const result = runCli(['latch', 'score', 'config/demo-messages/does-not-exist.json']);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /at Object/); // no raw Node stack trace leaking
});
