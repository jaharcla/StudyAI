# Grounding for steppable worked examples

The steppable implementation is merged but its own critique found a real risk: per-step claims are not passed through `reviewProvenance`; states carry only `sourceRefs` and a generated badge. A claim authored as `direct` without a retrieved excerpt could read as course fact, violating `ADR-2026-11-24-course-grounding-rule.md` and the owner's 99.9% rule.

## Scope

- `src/artifacts/package.ts`
- `src/canvas/ai/teaching-scene.ts`
- `src/canvas/tutor.ts`
- `tests/steppable-compile.test.ts`, `tests/steppable-schema.test.ts`, new tests as needed.

Do not touch UI, canvas glyphs, examples player, App, Coach, Studio views, or other shipped tracks.

## What to fix

1. Every claim attached to a replay state must carry real `ClaimProvenance` and pass the same `reviewProvenance` gates as any other artifact claim: retrieved refs only, `direct` requires literal excerpt containment, invented refs downgraded, `unresolved-conflict` blocked.
2. A state with no claim may exist as a layout/checkpoint, but must be labelled as a view state, never as course evidence.
3. Keep view-only navigation: no revision bump while stepping. Takeover remains the only write transition.
4. No new dependency, no provider call, no new authority.

## Verification

- Unit tests that a state claim with an unretrieved ref or non-contained excerpt is rejected or downgraded, and that honest states still compile.
- Quote `npm run verify`; name provider-dependent failures separately. Inline critique with three objections.

## Constraints

- Work only in this worktree; commit to `work/fix-steppable-grounding-20261124` with `Discord: https://discord.com/channels/1574451017817399346/1574451617007271966`.
- Native execution only: no subagents, no Groq-hosted models, no paid services. Ports: WEB_PORT=5521, RUNTIME_PORT=8561, DATA_PORT=8562, AGENT_PORT=8461.
