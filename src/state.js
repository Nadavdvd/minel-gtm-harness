// state.js — the one file-I/O boundary in the harness.
//
// Every module that needs to persist something goes through readJSON /
// writeJSONAtomic here. Nothing else in this codebase should call
// fs.writeFileSync (or fs.writeFile) on a file that represents live state.
//
// Why atomic writes matter even for a single-user demo CLI: a plain
// "truncate then write" leaves a window where a concurrent reader (or a
// process killed mid-write) sees a half-written, corrupt file. The fix is
// the standard POSIX trick: write the full new contents to a temp file in
// the SAME directory, flush it to disk, then rename() the temp file over
// the target. rename() on POSIX filesystems is atomic — any reader sees
// either the whole old file or the whole new file, never a partial one.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, fsyncSync, openSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Read and parse a JSON file. Returns `fallback` if the file does not exist.
 * @param {string} path
 * @param {*} fallback
 * @returns {*}
 */
export function readJSON(path, fallback) {
  if (!existsSync(path)) return fallback;
  const raw = readFileSync(path, 'utf8');
  if (raw.trim() === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Surface a clean, path-attributed error instead of a bare JSON.parse
    // SyntaxError — every caller further up (the CLI) catches Error and
    // prints .message only, so this is what a user actually sees.
    throw new Error(`malformed JSON in ${path}: ${err.message}`);
  }
}

/**
 * Write `data` to `path` as JSON, atomically. Creates the parent directory
 * if it does not exist. Never leaves a partially-written file at `path`.
 * @param {string} path
 * @param {*} data
 */
export function writeJSONAtomic(path, data) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}`;
  const payload = JSON.stringify(data, null, 2);

  const fd = openSync(tmpPath, 'w');
  try {
    writeFileSync(fd, payload);
    fsyncSync(fd); // force the data blocks to disk before we rename
  } finally {
    closeSync(fd);
  }

  renameAtomicWithRetry(tmpPath, path);
}

/**
 * Append a single line to a file, creating it (and its parent directory)
 * if necessary. Append is atomic on POSIX for writes that fit in one
 * syscall, which every JSON-lines row here does — no temp-and-rename
 * needed for the append path, only for whole-file rewrites.
 * @param {string} path
 * @param {string} line
 */
export function appendLine(path, line) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const fd = openSync(path, 'a');
  try {
    writeFileSync(fd, line.endsWith('\n') ? line : `${line}\n`);
  } finally {
    closeSync(fd);
  }
}

/**
 * Read all lines of a JSON-lines file as parsed objects. Returns [] if the
 * file does not exist. Blank lines are skipped.
 * @param {string} path
 * @returns {object[]}
 */
export function readLines(path) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

function renameAtomicWithRetry(tmpPath, targetPath, attemptsLeft = 5) {
  try {
    renameSync(tmpPath, targetPath);
  } catch (err) {
    // Transient lock holders (backup tools, indexers) can throw EPERM/EBUSY
    // on some platforms even for a same-directory rename. Retry a few times
    // before giving up — this is a demo CLI, not a distributed system, so a
    // short bounded retry is enough; it should never need it in practice.
    if (attemptsLeft > 0 && ['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) {
      renameAtomicWithRetry(tmpPath, targetPath, attemptsLeft - 1);
      return;
    }
    throw err;
  }
}
