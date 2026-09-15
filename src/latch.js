// latch.js — the Latch: a scoring checkpoint a message must click through
// before it's allowed to ship. Pure functions only (no file I/O here) so
// the scoring logic stays trivially unit-testable and stays swappable
// later without touching any caller.
//
// A rule is a plain data object (see config/rules.json) — never hardcoded
// logic — so a future rule pack is a config change, not a code change.
// Each rule carries a `rung`: "clear" | "flag" | "hold". That is the Rungs
// concept applied per-rule: how much autonomy a violation of that rule
// gets.
//
// Verdict mapping (Minel's own design, not a message-severity vote — the
// worst rung among the rules that actually fired decides the verdict):
//   - no rule fires, or only "clear"-rung rules fire  -> PASS
//   - the worst fired rung is "flag"                  -> HOLD  (ships-adjacent, needs a human look, logged)
//   - the worst fired rung is "hold"                  -> FAIL  (never ships until fixed)
//   - the revision cap is exceeded                    -> FAIL  (regardless of rule outcome)

const RUNG_SEVERITY = { clear: 0, flag: 1, hold: 2 };

/**
 * @typedef {object} Message
 * @property {string} text
 * @property {string} [recipient]
 * @property {string} [subject]
 * @property {string} [referenceDate]  ISO date string, e.g. "2026-08-01"
 *
 * @typedef {object} Rule
 * @property {string} id
 * @property {string} type
 * @property {'clear'|'flag'|'hold'} rung
 * @property {string} description
 *
 * @typedef {object} FiredRule
 * @property {string} id
 * @property {'clear'|'flag'|'hold'} rung
 * @property {string} reason
 *
 * @typedef {object} Verdict
 * @property {'PASS'|'HOLD'|'FAIL'} verdict
 * @property {FiredRule[]} firedRules
 * @property {string[]} reasons
 */

/**
 * Score one message against a rule set.
 * @param {Message} message
 * @param {Rule[]} rules
 * @param {{today?: Date, attempt?: number, maxAttempts?: number}} [options]
 * @returns {Verdict}
 */
export function score(message, rules, options = {}) {
  const today = options.today ?? new Date();
  const firedRules = [];

  for (const rule of rules) {
    const fired = evaluateRule(rule, message, today);
    if (fired) firedRules.push({ id: rule.id, rung: rule.rung, reason: fired });
  }

  if (typeof options.attempt === 'number' && typeof options.maxAttempts === 'number' &&
      options.attempt > options.maxAttempts) {
    firedRules.push({
      id: 'revision-cap',
      rung: 'hold',
      reason: `attempt ${options.attempt} exceeds the revision cap of ${options.maxAttempts}`,
    });
  }

  const worstSeverity = firedRules.reduce(
    (max, r) => Math.max(max, RUNG_SEVERITY[r.rung] ?? 0),
    -1,
  );

  let verdict = 'PASS';
  if (worstSeverity === RUNG_SEVERITY.hold) verdict = 'FAIL';
  else if (worstSeverity === RUNG_SEVERITY.flag) verdict = 'HOLD';

  return {
    verdict,
    firedRules,
    reasons: firedRules.map((r) => `[${r.id}/${r.rung}] ${r.reason}`),
  };
}

/**
 * @param {Rule} rule
 * @param {Message} message
 * @param {Date} today
 * @returns {string|null} the fired reason, or null if the rule did not fire
 */
function evaluateRule(rule, message, today) {
  switch (rule.type) {
    case 'banned-phrases':
      return evalBannedPhrases(rule, message);
    case 'max-asks':
      return evalMaxAsks(rule, message);
    case 'stale-reference-date':
      return evalStaleReferenceDate(rule, message, today);
    case 'required-fields':
      return evalRequiredFields(rule, message);
    default:
      throw new Error(`Latch: unknown rule type "${rule.type}" (rule id: ${rule.id})`);
  }
}

function evalBannedPhrases(rule, message) {
  const text = (message.text ?? '').toLowerCase();
  const hit = (rule.phrases ?? []).find((p) => text.includes(String(p).toLowerCase()));
  return hit ? `banned phrase found: "${hit}"` : null;
}

function evalMaxAsks(rule, message) {
  const text = message.text ?? '';
  const askCount = (text.match(/\?/g) ?? []).length;
  const max = rule.max ?? 1;
  return askCount > max
    ? `message contains ${askCount} asks, more than the allowed ${max}`
    : null;
}

function evalStaleReferenceDate(rule, message, today) {
  const field = rule.field ?? 'referenceDate';
  const raw = message[field];
  if (!raw) return null; // nothing to check
  const refDate = new Date(raw);
  if (Number.isNaN(refDate.getTime())) {
    return `field "${field}" is not a valid date: "${raw}"`;
  }
  const ageDays = (today.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24);
  const maxAgeDays = rule.maxAgeDays ?? 30;
  return ageDays > maxAgeDays
    ? `field "${field}" (${raw}) is ${Math.floor(ageDays)} days old, older than the ${maxAgeDays}-day limit`
    : null;
}

function evalRequiredFields(rule, message) {
  const missing = (rule.fields ?? []).filter((f) => {
    const v = message[f];
    return v === undefined || v === null || String(v).trim() === '';
  });
  return missing.length > 0
    ? `missing required field(s): ${missing.join(', ')}`
    : null;
}
