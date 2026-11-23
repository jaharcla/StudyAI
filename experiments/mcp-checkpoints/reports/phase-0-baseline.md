# Phase 0 — Baseline report

Date: 2026-11-23
Worktree: `C:\Users\Owner\.local\share\opencode\worktree\e35993\mcp-checkpoint-experiments-2026-11-23`
Branch: `spike/mcp-checkpoint-experiments-2026-11-23`
Base commit: `773416f1cdf145b11a122aa8771a3ee6f4d221b0`

## Toolchain (measured here, not claimed)

| Component | Version / result |
|---|---|
| Node | v24.13.0 (repo requires ≥22) |
| npm | 11.6.2 |
| Python | 3.10.11 (host) |
| uv | 0.10.8 (c021be36a, 2026-03-03) |
| Python 3.13 | `cpython-3.13.12-windows-x86_64-none` available via uv |
| Git network | `git ls-remote` succeeded for all five upstreams |
| Playwright browsers | installed: chromium-1194/1223/1234/1243/1248/1255, headless shells, firefox-1543, webkit-2359 |
| Local `node_modules` | absent in this worktree; harness tests use pinned `npx --yes vitest@3.2.7` |

## Pinned checkpoints

All pins came from `git ls-remote ... HEAD` on 2026-11-23, then verified against the cloned checkout with `git rev-parse HEAD`. Full record: `checkpoints/pins.json`.

| Checkpoint | Commit | Version | License |
|---|---|---|---|
| mcp_excalidraw | `81720ac819d2325177cd6137c6ad41d52d0f5374` | mcp-excalidraw-server 2.2.0 | MIT |
| excalidraw-mcp | `157aa23ceb1976008aadc89eb05e3444060f09d6` | 0.3.2 | MIT |
| handwriting-ocr-mcp-server | `1afb28df399d2758f14fc93d0d95c6f440af7541` | 0.1.0 | no LICENSE in repo tree |
| PaddleOCR | `dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf` | mcp_server package 0.8.5 | Apache-2.0 (source headers) |
| dim0 | `1bf00bae37bf06234271b6e16e014f2395b3d335` | 0.3.103 | MIT |

Clones are shallow, blobless; PaddleOCR is sparse-checked-out to `mcp_server/` only. They live in the gitignored `checkpoints/upstream/` directory.

## Harness smoke test — actually run

```
npx --yes vitest@3.2.7 run --config experiments/mcp-checkpoints/harness/vitest.config.ts experiments/mcp-checkpoints/harness/src/evidence.test.ts
```
- RED: `Cannot find module './evidence' imported from evidence.test.ts` (vitest "Start at 12:51:29" local time, 2026-11-23, vitest 3.2.7).
- GREEN after implementing `evidence.ts`: `Test Files 1 passed (1); Tests 1 passed (1)`.
- The test writes a real evidence JSON under `experiments/mcp-checkpoints/evidence/phase-0/phase-0/` and verifies path, content and SHA-256.

A separate minimal Vitest config was needed because the repo's `vite.config.ts` imports `vitest/config`, which the npx-installed runner could not resolve from the repo root. This is harness infrastructure, not a StudyAI change.

## Upstream claims NOT verified here

These were reported in earlier primary-source research but no experiment in this campaign has reproduced them yet. They are recorded as claims, not results:

1. mcp_excalidraw: "byte-identical SVG and PNG for an unchanged scene"; text within half a pixel of browser; 7 test suites plus a manual 3-way render parity script. The repo is cloned but the parity script has not been executed here.
2. mcp_excalidraw: 27 MCP tools and the seven-point screenshot checklist — source read in research; not executed.
3. excalidraw-mcp: open issues #111, #112, #115, #107, #109, #110, #113/#114 — read from GitHub issue API in research; not reproduced locally.
4. PaddleOCR: timeouts (600/120/600 s), model set, provider validation — read from source; models not installed or run here.
5. dim0: oplog-as-seq-authority, AgentBoardBridge, MLflow eval harness — read from source; dim0 not executed here.
6. Handwriting OCR MCP: three-tool async job lifecycle — read from source; remote service not contacted.

## Reproduction commands

```sh
# pins
git ls-remote https://github.com/yctimlin/mcp_excalidraw.git HEAD
git ls-remote https://github.com/excalidraw/excalidraw-mcp.git HEAD
git ls-remote https://github.com/Handwriting-OCR/handwriting-ocr-mcp-server.git HEAD
git ls-remote https://github.com/PaddlePaddle/PaddleOCR.git HEAD
git ls-remote https://github.com/vcmf/dim0.git HEAD

# clones (shallow, blobless; PaddleOCR sparse)
git clone --depth 1 --filter=blob:none <url> checkpoints/upstream/<name>
git clone --depth 1 --filter=blob:none --sparse <PaddleOCR-url> checkpoints/upstream/PaddleOCR
git -C checkpoints/upstream/PaddleOCR sparse-checkout set mcp_server

# verify pins
git -C checkpoints/upstream/<name> rev-parse HEAD

# harness test
npx --yes vitest@3.2.7 run --config experiments/mcp-checkpoints/harness/vitest.config.ts experiments/mcp-checkpoints/harness/src/evidence.test.ts
```

## Phase 0 did not verify

- No StudyAI bridge behavior, rendering, recognition, approval or mutation test has run.
- No upstream benchmark, render parity or model accuracy number was reproduced.
- No external service was contacted beyond public GitHub reads and npm package download for vitest.
- No `npm install` of the StudyAI dependency tree was performed.
