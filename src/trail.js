// trail.js — the Trail: an append-only log of every Latch verdict and
// every Tether action — what happened, when, and why — so nothing ships
// without a record. JSON-lines, one row per line, never rewritten.
//
// Every row carries `schema_version` from day one. That is deliberate:
// it means a later reader can be written against a stable contract
// instead of sniffing the file to guess its shape.

import { appendLine, readLines } from './state.js';

export const TRAIL_SCHEMA_VERSION = 1;

/**
 * @typedef {object} TrailRow
 * @property {number} schema_version
 * @property {string} ts             ISO timestamp
 * @property {'latch_verdict'|'tether_advance'|'cutoff_change'} type
 */

/**
 * Append one row to the Trail. Adds `schema_version` and `ts` if the
 * caller did not already set them.
 * @param {string} trailPath
 * @param {Partial<TrailRow> & Record<string, unknown>} row
 */
export function append(trailPath, row) {
  const fullRow = {
    schema_version: row.schema_version ?? TRAIL_SCHEMA_VERSION,
    ts: row.ts ?? new Date().toISOString(),
    ...row,
  };
  appendLine(trailPath, JSON.stringify(fullRow));
}

/**
 * Read the last `n` rows of the Trail, oldest of the tail first.
 * @param {string} trailPath
 * @param {number} [n]
 * @returns {TrailRow[]}
 */
export function tail(trailPath, n = 10) {
  const rows = readLines(trailPath);
  return rows.slice(Math.max(0, rows.length - n));
}

/**
 * Read every row of the Trail, in append order.
 * @param {string} trailPath
 * @returns {TrailRow[]}
 */
export function readAll(trailPath) {
  return readLines(trailPath);
}
