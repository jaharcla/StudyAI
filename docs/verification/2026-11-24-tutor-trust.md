# Verification — tutor trust (2026-11-24)

Branch: `work/tutor-trust-20261124`.

## What changed

- `server/agent.ts` — strengthened the tutor system prompt with an explicit honest-refusal instruction: when the course material has no evidence for the answer, the tutor must say "Not in your course material" and must not guess or invent course facts. This closes the gap between the course-grounding rule (99.9% from retrieved material) and the model's prior wording, which only said to "say so briefly before giving general knowledge" and left room for a confident guess.
- Commit: `2cdac92`. Critique: https://critique.work/v/a1f3ad5f5e1fcccb4e80ac5569cfcfc9

## Decisions recorded

1. **Prompt-level refusal over a hard gate.** A deterministic post-filter cannot tell "no evidence" from "evidence present but ignored" without re-running retrieval, so the refusal is enforced in the system prompt, consistent with the existing course-grounding instruction. The tutor already receives `evidence?.status`; when it is not `"evidence"`, the prompt now names the exact refusal phrase.
2. **No change to citation grammar or rendering.** `presentTutorResponse` already drops ungrounded citation links and counts them as `rejectedCitationCount`. Touching it risked the hygiene specs; left as-is.
3. **No new UI for uncertainty.** The course-grounding rule's "Generated · not verified" label is data-layer only today; surfacing it in the tutor rail is a separate UI change and out of scope for this worker to avoid colliding with the Studio parity worker.
4. **Canvas-aware context left intact.** Selection already flows into `promptCanvasContext` via `savedShapeContext`; no change needed.
5. **Artifact generation in chat** (`author_board`) already wired and gated by server-side citation containment (commit `efd377e`); verified by `tests/tutor-author-board.test.ts` and `tests/e2e/canvas-author-board`-adjacent specs.

## Verification

- `tsc -b`: exit 0.
- `vitest run` (original default ports): 133 files / 846 tests passed.
- Playwright targeted:
  - `tests/e2e/tutor-experience.spec.ts`: 1 passed.
  - `tests/e2e/tutor-hygiene.spec.ts`: 1 passed.
  - `tests/e2e/tutor-round2-hygiene.spec.ts`: 2 passed.
  - `tests/e2e/tutor-math.spec.ts`: 1 passed.
  - `canvas-to-tutor-live.spec.ts`: 1 skipped (Groq provider unavailable in this worktree).
- Dev server ran on 5704/8717/8718/8614 with `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`; tutor replies streamed and grounded on real c120/c121 course material.

## Three strongest objections

1. **Prompt instruction is not a guarantee.** A free-tier model may still guess; only a measured eval (held-out refusal set) would prove the refusal rate. No such eval exists yet.
2. **No DOM-level assertion for refusal.** I did not add a Playwright spec asserting the refusal phrase, because LLM phrasing is non-deterministic and a brittle assertion would either pass vacuously or flake. A robust version needs a deterministic hook (e.g. a server-side flag when `evidence.status !== "evidence"`).
3. **Single commit, narrow scope.** The full J2 journey (citation click → highlight exact passage, uncertainty signal in rail, "quiz me"/"make cards"/"make slides" producing library artifacts) was not end-to-end verified on the real app in this pass; only the prompt change and hygiene specs were. The artifact-in-chat path relies on `author_board`, which is covered by unit tests but not by a live e2e in this run.

## Not verified

- No `benchmark:canvas` run (no prompt/model/threshold change beyond wording).
- No new e2e spec added; existing tutor specs pass.
- Live refusal behaviour not measured; only instructed.