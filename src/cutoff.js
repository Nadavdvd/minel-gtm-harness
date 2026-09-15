// cutoff.js — the Cutoff: one command that stops every Tether and every
// Latch from shipping anything, instantly, no matter what tier a message
// is running at. Persisted to disk (data/cutoff.json) so it is honored
// across separate CLI invocations, not just within one process's memory.

import { readJSON, writeJSONAtomic } from './state.js';

const DEFAULT_STATE = { engaged: false, engagedAt: null, reason: null };

/**
 * @param {string} cutoffPath
 * @returns {boolean}
 */
export function isEngaged(cutoffPath) {
  return readJSON(cutoffPath, DEFAULT_STATE).engaged === true;
}

/**
 * @param {string} cutoffPath
 * @returns {{engaged: boolean, engagedAt: string|null, reason: string|null}}
 */
export function getState(cutoffPath) {
  return readJSON(cutoffPath, DEFAULT_STATE);
}

/**
 * @param {string} cutoffPath
 * @param {string} [reason]
 */
export function engage(cutoffPath, reason = 'manual cutoff') {
  writeJSONAtomic(cutoffPath, {
    engaged: true,
    engagedAt: new Date().toISOString(),
    reason,
  });
}

/**
 * @param {string} cutoffPath
 */
export function disengage(cutoffPath) {
  writeJSONAtomic(cutoffPath, { ...DEFAULT_STATE });
}
