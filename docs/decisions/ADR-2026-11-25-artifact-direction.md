# ADR-2026-11-25 — Two artifact creation routes with presentation-only direction

Status: accepted (2026-11-25).

## Decision

Studio keeps the existing one-click Create buttons as the quick route. A second, optional route lets a student type a short direction before generating, following the NotebookLM pattern: canned defaults for speed, a chevron-opened field for guiding prompts when the student wants more say.

A direction only shapes **presentation** — audience, angle, length, structure, style and examples. It never authorises new facts, refs, page numbers, numbers, answers or citations. The existing grounding packet, citation rewriting, two-attempt JSON repair, grounded fallback and four-choice practice rule stay authoritative and unchanged.

Implementation uses only what is already in the repo: the existing `GenerateSchema` (zod), the same `server/studio/service.ts` generator, the same SQLite artifact store, and the existing Studio sidebar. No new dependency, provider, key or service is added.

## Alternatives considered

- A separate generator or provider for guided creation: rejected. It would duplicate grounding and create a second authority for the same artifact.
- Letting the direction override the system grounding rules: rejected. It would break the course-grounding rule (`ADR-2026-11-24`) and make invented citations possible.
- A per-button chevron with a different field for every artifact type: rejected for now. One shared field with its own kind selector covers both routes with one code path; the Create buttons remain the fast path.
- Downloading and decompiling the NotebookLM APK: rejected. Public inspection found only server-side quota RPCs, not prompt text; official docs plus read-back prompt evidence are the better source.

## Limits

- Direction is at most 500 characters, matching the existing `focus` cap, and is rejected if it supplies a `studyai://`/`canvas:`/http ref, asks the model to ignore sources, invent an answer/source, or omit citations.
- Direction is advisory text sent to the same model. A model can still ignore it; deterministic validation still drops anything ungrounded after generation.
- Slide decks keep their own compiler and are not part of this change.
- The stored prompt is plain text for reading and re-running in-session, not a machine-readable command language. No IDs or JSON are shown to the student.

## Verification

`tsc -b`, Vitest for `tests/studio.test.ts` and the full unit suite, plus a Playwright spec asserting the one-click request has no direction and the guided request does. See the worker report for the commands and their output.
