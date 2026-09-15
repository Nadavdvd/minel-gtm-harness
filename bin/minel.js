#!/usr/bin/env node
// bin/minel.js — the CLI entry point. Thin router only: parse argv, call
// into src/, format output. No business logic lives here except the one
// piece of wiring that deliberately stays out of the pure modules: the
// Cutoff override on Latch verdicts (see the comment at applyCutoffToLatch
// below).

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readJSON } from '../src/state.js';
import * as latch from '../src/latch.js';
import * as tether from '../src/tether.js';
import * as manifestStore from '../src/manifest.js';
import * as cutoff from '../src/cutoff.js';
import * as trail from '../src/trail.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// The data directory (Manifest, Cutoff state, Trail) defaults to <repo>/data
// but can be overridden with MINEL_DATA_DIR. This exists for one reason:
// every state file here is a single shared mutable path, so two `minel`
// processes pointed at the same data dir will contend for it (by design —
// that's what the Cutoff's cross-process persistence guarantee depends
// on). Tests that spawn the real CLI need an *isolated* data dir per test
// run so they don't race each other over the repo's own data/ folder.
const DATA_DIR = process.env.MINEL_DATA_DIR ?? join(ROOT, 'data');
const PATHS = {
  rules: join(ROOT, 'config', 'rules.json'),
  sequence: join(ROOT, 'config', 'sequence.json'),
  contacts: join(ROOT, 'config', 'demo-contacts.json'),
  manifest: join(DATA_DIR, 'manifest.json'),
  cutoffState: join(DATA_DIR, 'cutoff.json'),
  trailLog: join(DATA_DIR, 'trail.jsonl'),
};

async function main(argv) {
  try {
    return dispatch(argv);
  } catch (err) {
    // Never let a raw stack trace reach the terminal — a malformed config
    // or message file is a user-facing error, not a crash.
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

function dispatch(argv) {
  const [command, ...rest] = argv;

  switch (command) {
    case 'latch':
      return cmdLatch(rest);
    case 'tether':
      return cmdTether(rest);
    case 'cutoff':
      return cmdCutoff(rest);
    case 'trail':
      return cmdTrail(rest);
    case 'demo':
      return cmdDemo();
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      return printUsage();
    default:
      console.error(`Unknown command: "${command}"`);
      printUsage();
      process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------
// latch score <message-file> [--attempt N]
// ---------------------------------------------------------------------
function cmdLatch(args) {
  const [sub, ...rest] = args;
  if (sub !== 'score') {
    console.error('Usage: minel latch score <message-file.json> [--attempt N]');
    process.exitCode = 1;
    return;
  }
  const messageFile = rest.find((a) => !a.startsWith('--'));
  const attempt = getFlagValue(rest, '--attempt');
  if (!messageFile) {
    console.error('Usage: minel latch score <message-file.json> [--attempt N]');
    process.exitCode = 1;
    return;
  }

  const message = readJSON(messageFile, null);
  if (!message) {
    console.error(`Could not read message file: ${messageFile}`);
    process.exitCode = 1;
    return;
  }

  const rulesConfig = readJSON(PATHS.rules, { rules: [], maxAttempts: undefined });
  const scoreOptions = { today: new Date() };
  if (attempt !== undefined) {
    scoreOptions.attempt = Number(attempt);
    scoreOptions.maxAttempts = rulesConfig.maxAttempts;
  }

  let result = latch.score(message, rulesConfig.rules, scoreOptions);
  result = applyCutoffToLatch(result);

  trail.append(PATHS.trailLog, {
    type: 'latch_verdict',
    messageFile,
    verdict: result.verdict,
    firedRules: result.firedRules,
  });

  console.log(`Latch verdict: ${result.verdict}`);
  if (result.reasons.length > 0) {
    console.log('Reasons:');
    for (const r of result.reasons) console.log(`  - ${r}`);
  } else {
    console.log('Reasons: none — no rule fired.');
  }
}

// The Cutoff forces every Latch verdict to HOLD, unconditionally, the
// moment it is engaged — regardless of what the rules themselves decided.
// This override lives here, at the CLI boundary, and deliberately NOT
// inside latch.js: latch.score() stays a pure function of (message,
// rules), which keeps it trivially unit-testable and keeps the Cutoff's
// global-halt behavior in exactly one place.
function applyCutoffToLatch(result) {
  if (!cutoff.isEngaged(PATHS.cutoffState)) return result;
  return {
    verdict: 'HOLD',
    firedRules: result.firedRules,
    reasons: [...result.reasons, 'the Cutoff is engaged — every Latch verdict is forced to HOLD'],
  };
}

// ---------------------------------------------------------------------
// tether advance|status --contact <id> [--date YYYY-MM-DD]
// ---------------------------------------------------------------------
function cmdTether(args) {
  const [sub, ...rest] = args;
  const contactId = getFlagValue(rest, '--contact');
  const dateFlag = getFlagValue(rest, '--date');
  const today = dateFlag ? new Date(dateFlag) : new Date();

  if (sub !== 'advance' && sub !== 'status') {
    console.error('Usage: minel tether <advance|status> --contact <id> [--date YYYY-MM-DD]');
    process.exitCode = 1;
    return;
  }
  if (!contactId) {
    console.error('Usage: minel tether <advance|status> --contact <id> [--date YYYY-MM-DD]');
    process.exitCode = 1;
    return;
  }

  const sequenceConfig = readJSON(PATHS.sequence, { steps: [] });
  const contactsConfig = readJSON(PATHS.contacts, { contacts: [] });
  const known = contactsConfig.contacts.find((c) => c.contactId === contactId);
  const sequenceId = known ? known.sequenceId : sequenceConfig.id;

  const manifest = manifestStore.loadManifest(PATHS.manifest);
  const entry = manifestStore.getOrCreateEntry(manifest, contactId, sequenceId);

  if (sub === 'status') {
    printManifestEntry(entry, sequenceConfig);
    return;
  }

  const cutoffEngaged = cutoff.isEngaged(PATHS.cutoffState);
  const result = tether.advance(entry, sequenceConfig, today, { cutoffEngaged });

  manifest[contactId] = result.manifestEntry;
  manifestStore.saveManifest(PATHS.manifest, manifest);

  trail.append(PATHS.trailLog, {
    type: 'tether_advance',
    contactId,
    advanced: result.advanced,
    reason: result.reason,
    nextAction: result.nextAction,
  });

  console.log(`Tether: ${result.advanced ? 'advanced' : 'did not advance'} (${result.reason})`);
  printManifestEntry(result.manifestEntry, sequenceConfig);
}

function printManifestEntry(entry, sequenceConfig) {
  console.log(`Contact: ${entry.contactId}`);
  console.log(`Status: ${entry.status}`);
  console.log(`Last touch: ${entry.lastTouchAt ?? 'never'}`);
  if (entry.status === 'completed') {
    console.log('Next action: none — sequence complete.');
    return;
  }
  const step = sequenceConfig.steps[entry.stepIndex];
  console.log(`Next action: "${step?.name ?? 'unknown'}" (rung: ${step?.rung ?? 'unknown'}), due ${entry.nextDueAt ?? 'now'}`);
}

// ---------------------------------------------------------------------
// cutoff on|off|status [--reason "..."]
// ---------------------------------------------------------------------
function cmdCutoff(args) {
  const [sub, ...rest] = args;
  const reason = getFlagValue(rest, '--reason');

  if (sub === 'on') {
    cutoff.engage(PATHS.cutoffState, reason ?? 'manual cutoff');
    trail.append(PATHS.trailLog, { type: 'cutoff_change', engaged: true, reason: reason ?? 'manual cutoff' });
    console.log('Cutoff engaged. All Latch verdicts will read HOLD; all Tether advances are halted.');
    return;
  }
  if (sub === 'off') {
    cutoff.disengage(PATHS.cutoffState);
    trail.append(PATHS.trailLog, { type: 'cutoff_change', engaged: false, reason: null });
    console.log('Cutoff disengaged. Normal operation resumed.');
    return;
  }
  if (sub === 'status') {
    const state = cutoff.getState(PATHS.cutoffState);
    console.log(`Cutoff engaged: ${state.engaged}`);
    if (state.engaged) {
      console.log(`  since: ${state.engagedAt}`);
      console.log(`  reason: ${state.reason}`);
    }
    return;
  }
  console.error('Usage: minel cutoff <on|off|status> [--reason "..."]');
  process.exitCode = 1;
}

// ---------------------------------------------------------------------
// trail tail [-n N]
// ---------------------------------------------------------------------
function cmdTrail(args) {
  const [sub, ...rest] = args;
  if (sub !== 'tail') {
    console.error('Usage: minel trail tail [-n N]');
    process.exitCode = 1;
    return;
  }
  const n = Number(getFlagValue(rest, '-n') ?? 10);
  const rows = trail.tail(PATHS.trailLog, n);
  if (rows.length === 0) {
    console.log('Trail is empty.');
    return;
  }
  for (const row of rows) {
    console.log(JSON.stringify(row));
  }
}

// ---------------------------------------------------------------------
// demo — a scripted end-to-end run touching every piece
// ---------------------------------------------------------------------
function cmdDemo() {
  console.log('=== Minel GTM Harness — demo ===\n');

  console.log('-- The Latch: scoring three demo messages --');
  for (const file of ['clean-pass.json', 'banned-phrase-fail.json', 'multi-ask-hold.json']) {
    console.log(`\n> minel latch score config/demo-messages/${file}`);
    cmdLatch(['score', join(ROOT, 'config', 'demo-messages', file)]);
  }

  console.log('\n-- The Tether: advancing a fictional contact through its sequence --');
  console.log('\n> minel tether advance --contact jordan-vale-bramblewood');
  cmdTether(['advance', '--contact', 'jordan-vale-bramblewood']);

  console.log('\n-- The Trail: the last few rows written above --');
  console.log('\n> minel trail tail -n 4');
  cmdTrail(['tail', '-n', '4']);

  console.log('\n-- The Cutoff: engage it, then show it halts both the Latch and the Tether --');
  console.log('\n> minel cutoff on --reason "demo"');
  cmdCutoff(['on', '--reason', 'demo']);
  console.log('\n> minel latch score config/demo-messages/clean-pass.json');
  cmdLatch(['score', join(ROOT, 'config', 'demo-messages', 'clean-pass.json')]);
  console.log('\n> minel tether advance --contact jordan-vale-bramblewood');
  cmdTether(['advance', '--contact', 'jordan-vale-bramblewood']);
  console.log('\n> minel cutoff off');
  cmdCutoff(['off']);

  console.log('\n=== demo complete ===');
}

// ---------------------------------------------------------------------
function printUsage() {
  console.log(`Minel GTM Harness

Usage:
  minel latch score <message-file.json> [--attempt N]
  minel tether advance --contact <id> [--date YYYY-MM-DD]
  minel tether status  --contact <id>
  minel cutoff on|off|status [--reason "..."]
  minel trail tail [-n N]
  minel demo
`);
}

function getFlagValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1 || i === args.length - 1) return undefined;
  return args[i + 1];
}

main(process.argv.slice(2));
