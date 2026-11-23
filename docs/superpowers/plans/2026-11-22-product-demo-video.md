# StudyAI Product Demo Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a 90-second, 30 fps product demo on the current StudyAI UI that shows seven or more real capabilities, with raea-rendered 3D interludes and captions, as a 16:9 master and a 9:16 recut.

**Architecture:** A committed truth-linked shot plan drives two independent pipelines: (1) raea compositions render short 3D metaphor interludes and chapter cards from pinned sources outside the TypeScript project; (2) the existing `product-demo-video-skill` captures the real app with Playwright using DOM assertions, then finishes and exports both formats. A single `VIDEO.md` is replaced with the new direction and measured result.

**Tech Stack:** raea 0.1.8 (Rust/Bevy, Windows x86_64, sandboxed), Playwright via `product-demo-video-skill` 2.9.1, FFmpeg 9.0.2, H.264 CRF 18, Node 24, PowerShell 5.1.

**Spec:** `docs/superpowers/specs/2026-11-22-product-demo-video-design.md`

## Global Constraints

- raea binary: `C:\Users\Owner\AppData\Local\Temp\opencode\raea-spike\raea\bin\raea.exe` — pinned v0.1.8, FSL-1.1-ALv2; never installed into PATH or `~/.claude/skills`; only rendered output is used.
- App: `npm run dev` starts the full stack; web at `http://127.0.0.1:5183` (`strictPort: true`). Currently down at plan time. No login gate in `src/App.tsx`; only a credit-token bearer.
- 30 fps, 2700 frames total; master 1920×1080, recut 1080×1920. Frame ranges are exact and contiguous (see spec beats table).
- Captions ≥ 40 px at 1080p; any UI label the viewer must read ≥ 24 px; contrast ≥ 5:1.
- No voiceover, music, SFX, or synthesized bed in v1. Finish plan sets `music: null`, `voiceover: null`, `keepSourceAudio: false`.
- Encoding: H.264 CRF 18, `preset: slow`, faststart where the finisher supports it.
- Product truth: every visible claim comes from an observed UI result; raea interludes are metaphors only and never depict a screen the app does not have.
- `demo-video/raea/*.tsx` must stay **outside** `scripts/` — `tsconfig.json` includes `scripts`, and `import from "raea"` would break `npm run verify`.
- `/artifacts/` is gitignored: captures, renders, and QA output are produced but never committed. Committed: plans, raea sources, wrappers, ADR, `VIDEO.md`.
- No subagents for execution; native implementation only.

## Review Focus

1. **A raea interlude accidentally depicts fake UI or an invented metric.** Task 2 Step 4 asserts every interlude PNG contains no app UI text before compositing.
2. **The Tutor capture ends on "Working" with an incomplete answer** (the exact failure that forced the previous re-record). Task 3 Step 4 asserts the timeline contains no `Working` or `streamdown:incomplete-link` in the Tutor beat.
3. **raea `.tsx` sources break the repo typecheck.** Task 5 Step 3 runs `npm run verify` and quotes its output.
4. **Captions or the progress label fail legibility / fall inside the 9:16 platform UI.** Task 4 Step 4 inspects a one-frame-per-second contact sheet for both formats.
5. **Audio leaks into the "silent" cut and breaks the sound-off-first rule.** Task 4 Step 3 probes both exports without `--require-audio` and the finish plans pin null music/voiceover.

---

### Task 1: Truth-linked production plan

**Files:**
- Create: `scripts/demo-video/production-plan.json`
- Create: `scripts/demo-video/check-plan.mjs`

**Interfaces:**
- Produces: `shots[10]`, each `{ id, frames: [start, end], source: "raea"|"capture", caption, claim, evidence: [{role, name, text}] }`, plus `video: { fps: 30, lengthFrames: 2700, master: "1920x1080", recut: "1080x1920" }`. Consumed by Tasks 2, 3, 4.

- [ ] **Step 1: Write `scripts/demo-video/production-plan.json`**

Use the ten beats, exact frame ranges, and exact caption strings from the spec's Beats table and builder-check resolution #4. For each `capture` shot, set `evidence` to the DOM assertion that proves the capability (e.g. beat 4: `assertVisible` on the verified-equation and graph labels; beat 6: `assertVisible` on the Tutor answer; beat 7: `assertVisible` on the citation). For `raea` shots set `evidence: []` and `claim` to the metaphor's meaning, never a product claim. Also emit `progressLabels: [{ text, startFrame, endFrame }]` with exactly three entries: `"1 / 3 · CAPTURE"` 240–1200, `"2 / 3 · CONNECT"` 1200–2070, `"3 / 3 · STUDY PACK"` 2070–2430.

- [ ] **Step 2: Run the skill's truth-plan validator**

Run: `python C:\Users\Owner\.config\opencode\skills\product-demo-video-skill\scripts\validate_production_plan.py scripts/demo-video/production-plan.json`
Expected before Step 1: FAIL (file not found). Expected now: PASS.

- [ ] **Step 3: Write and run `scripts/demo-video/check-plan.mjs`**

Assert `shots.length === 10`; frames start at 0, end at 2700, and are contiguous; each shot has a non-empty `caption` and a `source` in the allowed set; each `capture` shot has at least one `evidence` entry; `progressLabels.length === 3` and their ranges are contiguous within 240–2430. Run: `node scripts/demo-video/check-plan.mjs` → PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/demo-video/production-plan.json scripts/demo-video/check-plan.mjs
git commit -m "feat(demo): add truth-linked shot plan for new product demo"
```

### Task 2: raea constructed interludes

**Files:**
- Create: `demo-video/raea/01-sketch-to-objects.tsx`
- Create: `demo-video/raea/02-components.tsx`
- Create: `demo-video/raea/03-concept-graph.tsx`
- Create: `demo-video/raea/04-end-card.tsx`
- Create: `scripts/demo-video/render-raea.ps1`

**Interfaces:**
- Consumes: `production-plan.json` shots with `source: "raea"`.
- Produces: `artifacts/product-demo/raea/NN-name.mp4` and `NN-frame.png` at 1920×1080, 30 fps, ≤ 120 frames each.

- [ ] **Step 1: Write the four compositions**

Base each on the spike's proven `scene3d.tsx` pattern: imports from `raea`, `raea/3d`, `raea/mesh`, `raea/pbr`, `raea/light`, `raea/transform`, `raea/camera`; `Camera3d` at `Transform.fromXyz(0, 1.6, 5.2).lookingAt([0, 0.7, 0])`, fov 48°; `DirectionalLight` key `illuminance={9000}`, fill `3200`, `PointLight intensity={600000} range={9}`. Use the spike's verified palette — `#5eead4`, `#818cf8`, `#f472b6` on `#070b18` — as a deliberate visual accent, not a claimed brand colour (no brand kit exists; see old `VIDEO.md`). Every animated value derives from `useCurrentFrame()` only. Beat 1: stroke → connected objects; beat 3: vector → components; beat 5: concept nodes connecting; beat 9: held end card. No text that resembles app UI.

- [ ] **Step 2: Write `scripts/demo-video/render-raea.ps1`**

Set `$ErrorActionPreference = "Continue"` (OpenH264 writes harmless stderr, which PowerShell otherwise reports as exit 1) and branch on `$LASTEXITCODE` after each `& $raea render ...` call. Render each composition once to `--frame 45 -o ...png` and once to `-o ...mp4`. Create `artifacts/product-demo/raea/` first.

- [ ] **Step 3: Render and require a clean engine check**

Run: `powershell -File scripts/demo-video/render-raea.ps1`
Expected: every render line reports `0 errors, 0 warns, 0 notes`. If raea reports a contact error or an exposure warning below −2 stops, fix geometry/lighting as in the spike and re-run until clean.

- [ ] **Step 4: Inspect one PNG per interlude (Review Focus #1)**

Read each `artifacts/product-demo/raea/NN-frame.png`. Assert the picture is a 3D metaphor with no app chrome, no fabricated metric, and no text beyond the chapter-card wording. Record any failure and fix the composition before continuing.

- [ ] **Step 5: Commit sources only**

```bash
git add demo-video/raea scripts/demo-video/render-raea.ps1
git commit -m "feat(demo): add raea 3D interludes and pinned render wrapper"
```

### Task 3: Capture the current UI

**Files:**
- Create: `scripts/demo-video/make-capture-plan.mjs`
- Create: `scripts/demo-video/assert-capture.mjs`

**Interfaces:**
- Consumes: `production-plan.json` `capture` shots and their `evidence` arrays.
- Produces: `artifacts/product-demo/capture-plan.json`, `artifacts/product-demo/raw-master.webm`, `artifacts/product-demo/timeline.json`.

- [ ] **Step 1: Start the app and assert it is live**

Run: `npm run dev`, then `Invoke-WebRequest http://127.0.0.1:5183 -UseBasicParsing`.
Expected: HTTP 200. If not, stop and fix startup before any capture.

- [ ] **Step 2: Write `scripts/demo-video/make-capture-plan.mjs`**

Map each `capture` shot's `evidence` into skill actions: `click` (`role`, `name`), `fill` (`label`, `value`), `assertVisible` (`text`), with `hold` gaps sized from the shot's frame range at 30 fps. Emit the skill's exact schema: `baseUrl: "http://127.0.0.1:5183"`, `viewport` and `recordingSize` 1600×900, `headless: true`, `defaultTimeoutMs: 15000`, `actionDelayMs: 450`, `output: "artifacts/product-demo/raw-master.webm"`, `timelineOutput: "artifacts/product-demo/timeline.json"`.

- [ ] **Step 3: Generate the plan and capture**

Run: `node scripts/demo-video/make-capture-plan.mjs` then `node C:\Users\Owner\.config\opencode\skills\product-demo-video-skill\scripts\capture_demo.mjs artifacts/product-demo/capture-plan.json`
Expected: `raw-master.webm` and `timeline.json` exist; raw duration ≥ 85 s before trimming.

- [ ] **Step 4: Assert every beat landed (Review Focus #2)**

Write `scripts/demo-video/assert-capture.mjs`: for every `capture` shot, assert `timeline.json` contains its `evidence` assertions; assert the Tutor beat contains neither `Working` nor `streamdown:incomplete-link` and that its answer text length is stable at the final two samples. Run → PASS. On FAIL, re-record with a longer wait on the Tutor beat (the previous cut failed exactly here).

- [ ] **Step 5: Commit scripts only**

```bash
git add scripts/demo-video/make-capture-plan.mjs scripts/demo-video/assert-capture.mjs
git commit -m "feat(demo): add DOM-asserted capture plan for current UI"
```

### Task 4: Finish and QA both formats

**Files:**
- Create: `scripts/demo-video/make-finish-plan.mjs`

**Interfaces:**
- Consumes: `production-plan.json` captions and `artifacts/product-demo/raw-master.webm`, plus Task 2's interlude MP4s.
- Produces: `artifacts/product-demo/finish-plan-16x9.json`, `finish-plan-9x16.json`, `studyai-demo-16x9.mp4`, `studyai-demo-9x16.mp4`, `qa-summary.md`, contact sheets.

- [ ] **Step 1: Write `scripts/demo-video/make-finish-plan.mjs`**

Emit two plans in the skill's finish schema. For 16:9 set `canvas: {width:1920, height:1080, fps:30, fit:"cover", background:<sampled from live UI>}`; for 9:16 set 1080×1920. Fill `captions` from `production-plan.json` with exact strings and frame-derived `start`/`end`, plus one caption per `progressLabels` entry using `{ start, end, title: text, body: "", position: "top" }` (the finisher supports `position: "top"` at `finish_video.py:118`; the global `titleSize` 48 clears the 24 px floor). Set `captionStyle`: `font:"Inter"`, `titleSize:48`, `bodySize:40`, `marginHorizontal:150`, `marginVertical:110`, `textColor:"#FFFFFF"`, `accentColor:<sampled>`, `backgroundColor:"#111827D9"`. Set `music: null`, `voiceover: null`, `keepSourceAudio: false`, `encoding: {crf:18, preset:"slow"}`. The finisher cannot do per-beat focus pushes; captured UI stays full-window, and the spec's word-slot flip is not available in ASS. Record both as limitations in `VIDEO.md` (Task 5).

- [ ] **Step 2: Finish both exports**

Run: `python <skill>/scripts/finish_video.py artifacts/product-demo/finish-plan-16x9.json` and the 9:16 equivalent.
Expected: both MP4s exist, H.264, ~90 s.

- [ ] **Step 3: Probe both exports (Review Focus #5)**

Run: `python <skill>/scripts/probe_video.py artifacts/product-demo/studyai-demo-16x9.mp4 --min-width 1920 --max-duration 300` (and `--min-width 1080` for the recut). Omit `--require-audio`: v1 deliberately has no audio track. Expected: PASS, duration within 88–92 s, H.264.

- [ ] **Step 4: Contact-sheet review (Review Focus #4)**

Run `make_contact_sheet.py` on both exports and read the PNGs. Assert: no identical consecutive seconds outside the three deliberate holds; every caption and step label legible; progress label inside the 5% safe zone; no reading material in the 9:16 bottom 35%. Fix and re-export if any check fails.

- [ ] **Step 5: Write QA summary and commit the generator**

Write `artifacts/product-demo/qa-summary.md` with measured durations, dimensions, codecs, file sizes, contact-sheet paths, and limitations. Commit only:
```bash
git add scripts/demo-video/make-finish-plan.mjs
git commit -m "feat(demo): add dual-format finishing plan generator"
```

### Task 5: ADR, direction update, and verification

**Files:**
- Create: `docs/decisions/ADR-2026-11-22-raea-constructed-demo.md`
- Modify: `VIDEO.md`

**Interfaces:**
- Consumes: measured results from Task 4 and the tool decision from the spec.

- [ ] **Step 1: Write the ADR**

Record: decision (raea 0.1.8 for constructed interludes, Playwright for proof, pinned skill 2.9.1 for finishing); alternatives (GenMotion — faster but 2D/2.5D and 5 advisories/1 critical; capture-only — reproduces the old limitation; fully synthetic — not a demo); exact licenses (raea FSL-1.1-ALv2, non-competing use, Apache-2.0 two years after each release; skill MIT); sandbox limits (no PATH/skills writes, no committed binary); spike numbers (15.8 ms/frame 2D, 272 ms/frame lit 3D, ~3 s GenMotion capture); verification performed.

- [ ] **Step 2: Replace `VIDEO.md` entirely**

Keep the single direction authority: new Direction, Beats (the ten from the spec), Workflow truth sources, Limitations (no brand kit, no audio, 3D interludes are metaphors, course data confined to the viewport), and Production result with the Task 4 measurements. Do not leave the old cut's direction alongside it.

- [ ] **Step 3: Run full verification (Review Focus #3)**

Run: `npm run verify`
Expected: PASS (`tsc -b && vitest run && playwright test`). Quote its output in the handoff. This proves the raea sources remained outside the TypeScript project.

- [ ] **Step 4: Confirm tracked-file discipline and commit**

Run: `git status --short`. Expected: only `VIDEO.md`, the ADR, and the planned `scripts/demo-video/*` and `demo-video/raea/*` files; no `artifacts/` entries. Commit:
```bash
git add VIDEO.md docs/decisions/ADR-2026-11-22-raea-constructed-demo.md
git commit -m "docs(demo): record new direction, ADR and measured production result"
```
