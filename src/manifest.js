// manifest.js — the Manifest: the one record of where each contact
// currently sits in the Tether. Thin persistence wrapper around
// tether.js's pure data shape; all disk access goes through state.js.

import { readJSON, writeJSONAtomic } from './state.js';
import { createManifestEntry } from './tether.js';

/**
 * @param {string} manifestPath
 * @returns {Record<string, import('./tether.js').ManifestEntry>}
 */
export function loadManifest(manifestPath) {
  return readJSON(manifestPath, {});
}

/**
 * @param {string} manifestPath
 * @param {Record<string, import('./tether.js').ManifestEntry>} manifest
 */
export function saveManifest(manifestPath, manifest) {
  writeJSONAtomic(manifestPath, manifest);
}

/**
 * Get a contact's Manifest entry, creating one on first touch if it does
 * not exist yet.
 * @param {Record<string, object>} manifest
 * @param {string} contactId
 * @param {string} sequenceId
 * @returns {object}
 */
export function getOrCreateEntry(manifest, contactId, sequenceId) {
  return manifest[contactId] ?? createManifestEntry(contactId, sequenceId);
}
