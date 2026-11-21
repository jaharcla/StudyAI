# ADR: Adopt product-demo-video-skill for outreach video finishing

Date: 2026-11-21

Status: accepted for the outreach video.

## Decision

Install `Afnanksalal/product-demo-video-skill` v2.9.1 (MIT) as an opt-in external skill at
`~/.config/opencode/skills/product-demo-video-skill`, pinned by its committed `package-lock.json`.
Use it for the **finishing and QA layer** of the outreach demo: truth-linked production plan,
pilot approval, deterministic capture plan, caption/audio finishing, multi-format (16:9 / 9:16)
exports, and contact-sheet validation.

Use the existing Playwright MCP (`browser_run_code_unsafe`) as the authority for **live canvas
interaction** — stepped mouse movement, press/drag/release strokes, and screenshots. The new
skill does not draw on the canvas. Existing `screen-recording` and `showcase-video` skills stay
in place for simple captures.

## Alternatives considered

- **Bespoke Playwright + FFmpeg script (existing `screen-recording` skill).** Rejected as the
  only route: it covers viewport capture and webm→mp4 but not truth-linked storyboards, pilot
  gating, styled captions, music ducking, platform variants, or contact-sheet QA.
- **Remotion skills** (`remotion-*`, already installed). Rejected for this skill's constructed
  scenes: the skill mandates Genmotion for designed motion and explicitly forbids substituting
  Remotion/HTML compositions. Remotion remains available independently.
- **`showcase-video` skill.** Rejected: scoped to game mods, not a web app walkthrough.
- **Do nothing / manual recording by the human.** Rejected per the user's request for smooth,
  deterministic movement and a finished product.

## Limits

- Pinned versions: skill 2.9.1, bundled `genmotion` 1.9.1 tarball, `playwright` ^1.62.1. Installed
  with `npm ci`; do not run `npm audit fix`, which would move the pinned Genmotion dependency chain.
- Maintenance risk: upstream is new (1 star, 17 commits, 0 forks). Scripts were reviewed before
  execution: no network calls beyond the product URL opened by Playwright; `spawnSync` appears only
  in `register_genmotion_tools.mjs`. The skill's own suite passes (13 Python + 5 Node tests).
- Genmotion MCP is **not registered**. Its registration script targets Codex/Claude CLIs, not
  OpenCode, and `npm audit --omit=dev` reports 5 production advisories (1 critical `proxy-addr`,
  3 high, 1 moderate) in the Genmotion MCP dependency chain. Those modules are not loaded by the
  capture or finish scripts. Before any constructed motion/title-card work, register Genmotion in
  OpenCode and re-audit/upgrade its chain first; otherwise stay in walkthrough/capture-and-finish
  mode, which does not require it.
- The skill's default is cursor decoration off; explicitly request cursor **on** so the smooth
  canvas strokes are visible in the demo.
- Product truth rule binds: every visible claim in the video must come from an observed UI result
  in the running app. No simulated dashboard or invented metric.
- Real course data from Waterloo Learn may appear on screen; keep it inside the captured viewport
  and out of logs, plans, and any open-world tool.

## Verification

- `npm ci` — 105 packages installed from lockfile.
- `npm test` — 13 Python + 5 Node tests pass; `node --check scripts/capture_demo.mjs` passes.
- `npx playwright install --dry-run chromium` plus local cache check — matching Chromium 1234 and
  ffmpeg 1011 already present; no download needed.
- Prerequisites present: Python 3.10.11, Node 24.13.0, FFmpeg/ffprobe 9.0.2, Playwright 1.56.1
  (skill-local 1.62.1).
