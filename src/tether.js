// tether.js — the Tether: the schedule that keeps a contact connected to
// outreach over time. Pure functions only (no file I/O here); manifest.js
// is the thin wrapper that loads/saves state through state.js.
//
// A sequence (config/sequence.json) is an ordered list of steps, each with
// a `rung` ("clear" | "flag" | "hold") and a `waitDaysAfter` (how long to
// wait, once that step fires, before the next one is due). The Tether
// never executes a send — it only tracks state and reports what's due.

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * @typedef {object} SequenceStep
 * @property {string} name
 * @property {'clear'|'flag'|'hold'} rung
 * @property {number} waitDaysAfter
 *
 * @typedef {object} Sequence
 * @property {string} id
 * @property {SequenceStep[]} steps
 *
 * @typedef {object} ManifestEntry
 * @property {string} contactId
 * @property {string} sequenceId
 * @property {number} stepIndex        index of the NEXT step to fire
 * @property {'active'|'completed'} status
 * @property {string|null} lastTouchAt ISO date of the last step fired
 * @property {string|null} nextDueAt   ISO date the next step becomes due; null means "due now"
 *
 * @typedef {object} AdvanceResult
 * @property {boolean} advanced
 * @property {{step: string, rung: string, dueAt: string}|null} nextAction
 * @property {ManifestEntry} manifestEntry
 * @property {string} reason
 */

/**
 * Create a fresh Manifest entry for a contact starting a sequence today.
 * @param {string} contactId
 * @param {string} sequenceId
 * @returns {ManifestEntry}
 */
export function createManifestEntry(contactId, sequenceId) {
  return {
    contactId,
    sequenceId,
    stepIndex: 0,
    status: 'active',
    lastTouchAt: null,
    nextDueAt: null, // null = due immediately (first touch)
  };
}

/**
 * Advance a contact's Manifest entry through its sequence, if it is due.
 * @param {ManifestEntry} manifestEntry
 * @param {Sequence} sequence
 * @param {Date} today
 * @param {{cutoffEngaged?: boolean}} [options]
 * @returns {AdvanceResult}
 */
export function advance(manifestEntry, sequence, today, options = {}) {
  const entry = { ...manifestEntry };

  if (options.cutoffEngaged) {
    return {
      advanced: false,
      nextAction: describeNextAction(entry, sequence),
      manifestEntry: entry,
      reason: 'the Cutoff is engaged — all Tether advances are halted',
    };
  }

  if (entry.status === 'completed') {
    return {
      advanced: false,
      nextAction: null,
      manifestEntry: entry,
      reason: 'sequence already completed',
    };
  }

  if (entry.nextDueAt && new Date(entry.nextDueAt).getTime() > today.getTime()) {
    return {
      advanced: false,
      nextAction: describeNextAction(entry, sequence),
      manifestEntry: entry,
      reason: `not yet due (next action due ${entry.nextDueAt})`,
    };
  }

  const step = sequence.steps[entry.stepIndex];
  if (!step) {
    entry.status = 'completed';
    entry.nextDueAt = null;
    return {
      advanced: false,
      nextAction: null,
      manifestEntry: entry,
      reason: 'sequence already completed',
    };
  }

  entry.lastTouchAt = today.toISOString().slice(0, 10);
  const dueDate = new Date(today.getTime() + step.waitDaysAfter * DAY_MS);
  entry.nextDueAt = dueDate.toISOString().slice(0, 10);
  entry.stepIndex += 1;

  if (entry.stepIndex >= sequence.steps.length) {
    entry.status = 'completed';
  }

  return {
    advanced: true,
    nextAction: describeNextAction(entry, sequence),
    manifestEntry: entry,
    reason: `fired step "${step.name}" (rung: ${step.rung})`,
  };
}

/**
 * @param {ManifestEntry} entry
 * @param {Sequence} sequence
 * @returns {{step: string, rung: string, dueAt: string}|null}
 */
function describeNextAction(entry, sequence) {
  if (entry.status === 'completed') return null;
  const step = sequence.steps[entry.stepIndex];
  if (!step) return null;
  return {
    step: step.name,
    rung: step.rung,
    dueAt: entry.nextDueAt ?? 'now',
  };
}
