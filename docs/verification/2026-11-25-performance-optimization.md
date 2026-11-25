# Performance optimization log (2026-11-25)

## Baseline (before resuming the queued work)

- Uptime: 02:26:38, total RAM 15.71 GB, free RAM 1.43 GB.
- CPU load: 8%; top consumer `opencode` (PID 12248, 335 s CPU, 536 MB).
- GPU: `nvidia-smi` reports 0% utilization and 0 MiB used; no GPU work applies here.
- Full `npm run verify` from the evaluator task is still running as PID 18536.
- Earlier full-verify failures were caused by a missing `CPK_INTELLIGENCE_API_KEY` in the worktree, not a product regression. The key is already present in the project's local `.env`.

## Scope and throttling

- Keep the existing sequential queue: math evaluator, lazy mode-gated surfaces, Creative Muse fixes, then final verification and the two remaining low-risk performance findings.
- No parallel worker while the verify process is running: one Playwright suite at a time.
- Pause new work whenever free RAM is below 1 GB; resume only after it recovers and the verify exits.
- Prefer targeted Vitest and Playwright suites over repeated full `npm run verify` runs; reserve the full gate for final handoff.

## Instrumentation

- Resource baseline captured with OS counters and `nvidia-smi` before any further build or test.
- No profiler was attached because no new hot path is being changed in this step; the audit's concrete findings already identify the targets.

## GPU offload decision

- GPU is idle (0% utilization, 0 MiB used). The queued work is TypeScript compilation, Vitest, Playwright and SQLite/JSON processing, all CPU or I/O bound; offloading it to the GPU would not help.
- The only local model path is CLIP canvas recognition in `server/canvas-intelligence/recognition/clip.ts`, and `CANVAS_CLIP_WARMUP=0` disables it. transformers.js in Node runs ONNX on CPU; GPU execution would need a new ONNX runtime provider dependency and explicit approval.

## Follow-ups

- Wait for PID 18536 to exit, then record its exact result in the worker's verification note.
- Copy `CPK_INTELLIGENCE_API_KEY` from the main `.env` into each worktree that runs e2e tests, without printing its value.
- Resume the lazy-mode-surfaces task only when RAM is above 1 GB.
- Consider a second parallel worker only if RAM stays comfortably above 1 GB and the remaining write scopes do not overlap.
