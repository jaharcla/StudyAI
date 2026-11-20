# StudyAI MK3 integration spec

> This spec records the completed integration slice. For current implementation and verification status, see [STATUS.md](STATUS.md); the acceptance checklist below is not a current release verdict.

## Product summary

Connect the existing canvas analysis pipeline to the existing StudyAI Tutor. Prefer Groq when configured and fall back to Ollama, while preserving uncertainty, source provenance, course scope, and authoritative board revisions.

## Target user

Students using the local-first StudyAI canvas and Tutor.

## Current-slice features

- Carry observed native/geometry/OCR evidence and model interpretations through one versioned `CanvasAnalysisResult` contract.
- Bind each result to board, course, lesson, persisted revision, snapshot hash, source IDs, and provenance.
- Reject stale or mismatched analyses and edit proposals at server boundaries.
- Preserve explicit user approval before applying canvas edits.
- Bound Tutor context and Groq requests; provide deterministic pruning, queue limits, timeouts, controlled retries, and cost accounting.
- Prefer Groq when a key is configured; use Ollama fallback and support an explicit Ollama override.

## Non-goals

- Voice, unrelated dependency work, broad UI redesign, deployment, or automatic application of AI proposals.
- Replacing the existing Canvas Intelligence pipeline with `canvas-full-groq`.

## Stack and architecture

- Keep the current TypeScript, React, Vite, Node, LangGraph, SQLite, Quickdraw, and Zod stack.
- Keep the existing local-first services and Canvas analysis types; adapt rather than create a second analysis authority.
- Groq calls use the existing configured key without printing or storing its value. No new authentication, payments, or admin system.

## Definition of done

- Freehand and structured canvas evidence reaches Tutor through the shared contract with source IDs, revision, and uncertainty intact.
- Tutor validates active board/course/lesson and current persisted revision before inference; stale or mismatched proposals cannot be applied.
- Ambiguous writing is described as uncertain; missing visual evidence is not invented.
- Groq-first behavior, bounded request controls, errors, and Ollama fallback pass mocked tests; controlled live tests pass when safe.
- Unit, integration, TypeScript, build, and browser suites pass, with failures attributed to code or environment.
- `main` is merge-clean and manually launchable; no unrelated data, databases, worktrees, or agent changes are lost.
