# Canvas control gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canvas and canvas-intelligence work verifiable by default: a CI gate on every push, one local verification command, and binding canvas invariants that agents must follow.

**Architecture:** Additive only. No production canvas code changes. CI runs build + unit tests on GitHub runners; the provider-dependent benchmark stays local (keys + gitignored dataset) and is invoked by `/canvas-verify`. Invariants live in the repo-root `AGENTS.md`, which every agent harness reads.

**Tech Stack:** GitHub Actions, npm, TypeScript project references, Vitest, Playwright, tsx benchmark script.

**Spec:** `docs/STATUS.md` (current verification gap), `scripts/benchmark-canvas.ts` (existing gate), `docs/verification/canvas-benchmark-baseline.json` (thresholds).

## Global Constraints

- Do not modify production canvas code, prompts, or providers in this plan.
- Do not regenerate the benchmark baseline.
- Node floor: `>=22` per `package.json` engines; CI pins 24.
- The benchmark DB lives under `data/`, which is gitignored: CI must not attempt to run it.

## Review Focus

- A push to a long-lived canvas branch must not be blocked by unrelated provider outages. CI therefore excludes e2e and benchmark; the local command covers them.
- The baseline file is currently untracked. A gate that compares against a missing file silently passes, so tracking it is part of the plan.
- `/canvas-verify` must report "not run and why" rather than implying coverage it did not have.

---

### Task 1: CI gate

**Files:**
- Create: `.github/workflows/canvas.yml`

**Interfaces:**
- Consumes: `npm run build`, `npx vitest run`.
- Produces: a required status check named `canvas / verify`.

- [x] **Step 1: Write the workflow** — `canvas.yml` checks out, sets up Node 24 with npm cache, runs `npm ci`, `npm run build`, `npx vitest run --reporter=dot`, with `concurrency` cancel-in-progress and a 25-minute timeout.
- [x] **Step 2: Document exclusions in the file** — a trailing comment explains why e2e and `benchmark:canvas` are local-only.
- [x] **Step 3: Verify YAML parses and the job graph is valid**
  Run: `npx --yes js-yaml .github/workflows/canvas.yml`
  Result: parses to the expected `name` / `on` / `jobs` graph, no error.
- [ ] **Step 4: Verify the workflow runs on a branch push**
  Push `control/canvas-gates` and confirm the `canvas / verify` check appears and passes; if it fails, the failure is the real baseline for Task 4.

### Task 2: Local verification command

**Files:**
- Create: `.opencode/command/canvas-verify.md`

**Interfaces:**
- Consumes: `npx tsc -b`, `npx vitest run tests/canvas`, `npx playwright test tests/e2e/canvas*.spec.ts`, `npm run benchmark:canvas`.
- Produces: `/canvas-verify`, usable by any agent session in this repo.

- [x] **Step 1: Write the command** — ordered steps, conditional e2e and benchmark triggers, required report fields (gate numbers, failing file:line, what was not run).
- [x] **Step 2: Encode anti-cheating rules** — no editing tests, no baseline regeneration without an explicit request.
- [ ] **Step 3: Verify the command is discoverable**
  Run: open a session in the repo and confirm `/canvas-verify` is listed; run it and confirm each step either executes or is reported as skipped with a reason.

### Task 3: Canvas invariants

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: existing "Engineering reuse policy" section.
- Produces: a "Canvas invariants" section that names revision bumps, document migrations, new-object-kind checklist, budget floors, the benchmark requirement, the single-authority rule, and the `/canvas-verify` requirement.

- [x] **Step 1: Append the section** — imperative rules only, no rationale paragraphs.
- [ ] **Step 2: Check the single-authority rule against current code**
  Run: `git grep -l "canvas-intelligence/scene" -- "server" "src"` and `git grep -l "canvas-analysis" -- "server" "src"`
  Expected: `scene/` and `canvas-analysis/` are separate paths; no third interpretation path exists. If one does, name it in the rule before merging.

### Task 4: Track the benchmark gate

**Files:**
- Modify (track): `docs/verification/canvas-benchmark-baseline.json`

**Interfaces:**
- Consumes: the current baseline produced at `2026-11-18T22:46:15Z` (7 boards, 0 hard failures, math exact 4, F1 0.91, PhysAlign 0.75).
- Produces: a committed baseline so `benchmark-canvas.ts` can compare in a fresh clone.

- [ ] **Step 1: Confirm the baseline is current** — compare `data/canvas-benchmark/latest.json` against the baseline file; if the live run is newer, ask the phase-3 owner whether to re-record before committing.
- [ ] **Step 2: Commit the baseline** — `git add docs/verification/canvas-benchmark-baseline.json` with the other gate files.
- [ ] **Step 3: Verify a fresh clone can gate**
  Run: `git clone <repo> /tmp/studyai-gate && cd /tmp/studyai-gate && npm ci && npm run build && npx vitest run --reporter=dot`
  Expected: build and unit tests pass; `benchmark:canvas` reports "no baseline" only if the file is absent, so confirm it is present.

---

## Merge protocol with the live phase-3 session

- This branch (`control/canvas-gates`) adds no production canvas code and must never be rebased over `scene/` work.
- Merge after phase 3 lands: `git merge control/canvas-gates` from the phase-3 branch. Conflicts are limited to `AGENTS.md` and possibly `.github/`.
- The phase-3 owner keeps ownership of `server/canvas-intelligence/scene/`, `src/canvas/ai/scene-*`, prompts, providers, and the benchmark script.
- The checkpoint ref `checkpoint/canvas-20261118` (`bd2ac03`) is the fallback if the working tree is lost; it contains tracked modifications only, not untracked scene files.
