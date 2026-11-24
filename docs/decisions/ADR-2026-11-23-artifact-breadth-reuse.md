# ADR-2026-11-23 — Artifact breadth: reuse and provider deferral

Date: 2026-11-23
Status: accepted for Phase A and Phase B only
Baseline: design `docs/superpowers/specs/2026-11-23-artifact-breadth-design.md`; boundary `ADR-2026-11-23-artifact-intelligence-system.md`.

## Decision

1. **No new provider is selected.** Phase A and Phase B use the already-approved local-first text path (`TUTOR_PROVIDER=opencode-go`, `hy4-flash-free`) only where text grounding already exists. TTS, STT, image and video engines stay unselected; podcasts, video and voice tutoring remain later phases with their own ADR and explicit opt-in. No paid service, no cloud render, no benchmark spend.
2. **Reuse, do not rebuild.** `src/artifacts/package.ts` remains the only composition format; `ClaimProvenance` in `src/artifacts/contracts.ts` remains the only provenance authority; `compilePackage` remains the only dispatcher; `studio_artifacts` remains the only store for guide and infographic artifacts. The existing `summary` component becomes a first-class `study-guide`, and the existing `diagram` component becomes a first-class `infographic` through an additive `format: "infographic"` routing hint. No second generator, store, renderer or authoring path.
3. **Context is arguments, not authority.** `GenerationContext` and `RenderContext` (`src/artifacts/context.ts`) carry course/lesson scope, evidence, concept state and layout anchors into generation. Intelligence never reads a board or document table and never writes a board; `author_board` stays the only board mutation verb.
4. **Three Phase A gates are enforced at parse time.** A package cannot carry a `sourceRef` or claim `sourceRef` that was not retrieved, a `direct` claim without excerpt containment in the supplied chunk, or a component kind with no renderer. `reviewProvenance` still downgrades such claims at review time as defence in depth.
5. **Deterministic local SVG.** `buildInfographicFigure` is a pure function of the diagram component; the React view and the SVG download are projections of that one figure. No canvas read, no image service, no random layout.
6. **One review transaction.** Acceptance is one additive `acceptance` column on `studio_artifacts` with a single `/api/studio/accept` transaction. No per-format history or revision branch.

## Alternatives considered

| Option | Verdict |
| --- | --- |
| New `infographic` component kind with its own schema and renderer | Rejected: the `diagram` component already carries title, forces and angles; a new kind would duplicate provenance and validation. |
| A second table for breadth artifacts | Rejected: the spec requires one store and one accept/decline transaction. |
| Cloud image or voice renderer for infographics | Rejected: no provider decision, no cost approval, and the figure is deterministic locally. |
| Web Speech / TTS for Phase B narration | Deferred to the canvas-narration and podcast ADRs; Phase B is visual and text only. |

## Exact versions and licenses

- No new dependency. Existing pinned versions apply: Zod 4.6.6 (MIT), React 19.2.0 (MIT), TypeScript 5.9.3 (Apache-2.0), better-sqlite3 12.4.1 (MIT), Playwright 1.56.1 (Apache-2.0).

## Limits and non-goals

- No `@ts-ignore`/`as any`, no SQLite destructive migration (`acceptance` is additive with a default), no benchmark run: the Tutor prompt/model/provider path is unchanged.
- No learning-outcome claim; pedagogy is not scored by model-on-model ratings.
- Interactive materials, audio, video and voice tutoring are not implemented here.

## Verification

- Phase A: `tests/artifact-contract-stretch.test.ts` gates refs, containment and renderer ownership.
- Phase B: `tests/artifact-breadth.test.ts` gates compile/store/render determinism; `tests/e2e/artifact-breadth.spec.ts` asserts the real DOM for list, filter, open, citation, accept and download.
- `npm run verify` output is quoted in the handoff; screenshots are uploaded there.
