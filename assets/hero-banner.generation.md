# Hero banner generation

- Result: successful OpenAI image generation; no fallback generator or hand-drawn substitute.
- Tool called: `image_gen.imagegen` (exposed as `image_gen__imagegen`).
- Model information: the returned PNG's embedded C2PA provenance declares softwareAgent name `gpt-image`, version `2.0`. The tool response does not expose the exact API model identifier or underlying HTTP endpoint; no direct `/v1/images/generations` request was made by this agent.
- Original returned PNG: 2172 × 724 pixels, 899,712 bytes.
- Saved output: `assets/hero-banner.png`, 1200 × 400 pixels, 412,086 bytes.
- Post-processing: resized using macOS `sips -z 400 1200`; no added text or redrawn artwork.
- SHA-256 of saved PNG: `9efe43141eac3b3f0a1e62f13f19b0f3388f8c37fb6240102ab36e5490293b48`.

## Exact generation prompt

```text
Use case: logo-brand
Asset type: wide hero banner PNG for the top of the GitHub README of the public open-source developer tool Minel GTM Harness.
Primary request: Create a clean, modern, confident, plain developer-tool brand illustration. The product is a deterministic outbound-message quality gate and touch sequencer, with zero dependencies and no LLM calls. Express its core idea through a simple gate/checkpoint or mechanical latch motif and a short orderly sequence of connected nodes.
Scene/backdrop: deep charcoal background (#0d1117), restrained slate-gray structural strokes, warm amber (#f0b429) as the single accent, matching the existing repo palette.
Subject: one distinctive geometric latch/checkpoint as the focal point, intersecting a fine horizontal path; a few evenly spaced nodes imply messages passing a deterministic checkpoint and advancing through a sequence. Make the latch recognizable and simple, with strong silhouette and precise alignment.
Style/medium: polished flat graphic illustration with crisp edges, generous negative space, balanced spacing, minimal restrained depth. Modern open-source developer-tool branding, understated and practical.
Composition/framing: a very wide 3:1 horizontal banner, target 1200x400 pixels or a larger exact 3:1 image. Center the complete composition with generous padding, and keep essential elements readable at 600x200. Fill the whole canvas; no mockup frame.
Constraints: absolutely no text, wordmark, letters, numbers, captions, or watermark. No robots, brains, AI sparkles, neon glow, decorative gradients, stock-corporate imagery, complex dashboards, padlock/security shield clichés, or visual clutter. Deliver the actual raster banner artwork.
```

