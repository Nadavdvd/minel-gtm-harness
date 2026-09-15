# Naming

Minel uses a small, deliberate vocabulary instead of generic terms like "validator" or "queue." Here's what each word means and why it exists.

### The Latch

The scoring checkpoint a message has to click through before it's allowed to ship. It runs your rule set against a draft, returns a verdict — `PASS`, `HOLD`, or `FAIL` — and says which rule fired and why. It caps how many times a single message can be re-scored, and it can be forced shut for everything at once (see The Cutoff).

### The Tether

The schedule that keeps a contact connected to your outreach over time. It defines what touch comes next, how long to wait between them, and what stops the sequence early (a reply always does — that's not configurable). It doesn't send anything itself; it tells you what's next-due.

### The Manifest

The one record of where a given contact currently sits in the Tether: last touch, next-due touch, current status. One file format, one source of truth — nothing else in Minel keeps its own copy of contact state.

### The Rungs — Clear / Flag / Hold

Three levels of how much a message ships without a person looking at it first:

- **Clear** — ships on its own.
- **Flag** — ships, but gets logged for review.
- **Hold** — never ships without a person's yes.

Set per rule and per sequence step, in config. Not hardcoded, so a stricter or looser policy is a config change, not a code change.

### The Cutoff

One command. It halts every Tether from advancing and forces every Latch verdict to `HOLD`, instantly, regardless of what Rung a message was running at. It's the panic button — a single point that overrides everything else in the system at once.

### The Trail

An append-only log of every Latch verdict and every Tether advance — what happened, when, and why. Nothing ships or advances without a row landing here. It's the audit record, and it's schema-versioned from day one so future tooling can read it without guessing its shape.

### The Floor

The cheap, deterministic checks that run before the Latch does any real scoring — banned phrases, missing required fields, obviously broken formatting. The stuff that never needs judgment, so it never costs you a scoring pass to catch it.

---

These names are stable across the project. If you're extending Minel, reuse them rather than inventing new words for the same concepts — that's what makes the system legible across the codebase, the docs, and the Trail's own log entries.
