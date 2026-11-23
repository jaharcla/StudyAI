# ADR: one `author_board` verb compiles a brief into one reviewable transaction

Date: 2026-11-22
Status: accepted — implements the settled decisions in
`docs/superpowers/plans/2026-11-22-adaptive-canvas-authoring.md` (rev 3) and absorbs the
`draftPractice` constraints from `docs/next.md`.

## Decision

The tutor gets one semantic authoring verb, `author_board`. Its argument is an `ArtifactBrief`:
topic, artifact (kind, prompt, optional answer, semantic figure, concepts, count), intent-only
placement, and `sourceRefs`. **No coordinate field exists in the brief.** Creating content always
routes through `planLayout`; adjusting already-created content stays on the demoted coordinate tools.

The compiler lives in `src/canvas/ai/teaching-scene.ts`, beside `compileTeachingScene`, so there is
one authoring-compilation authority. It produces an `ArtifactBriefProposal` (defined in
`src/canvas/tutor.ts`) carrying the scientific objects to add. The client applies the whole bundle
through one `postDocument`: one revision bump, one undo step, one review dialog. Decline leaves the
saved document byte-identical.

## Reuse versus build

| Need | Reused, not built | Evidence |
|---|---|---|
| Collision-free positions | `planLayout` / `objectOccupancy` (`src/canvas/ai/layout.ts`) | Already deterministic, tested, conflict-returning |
| Real board bounds | `boardOccupancy` (`src/canvas/ai/canvas-context.ts`, uses `shapeBounds`) / `objectBounds` | Same bounds authorities the renderer uses |
| Objects | `createObject`, `parseCanvasDocument`, existing `question`/`force`/`mindmap` kinds | No new kind → the six-part rule is satisfied by reuse, not a new half-kind |
| Approval gate | Existing review panel + `readAuthoritativeBoard` + `postDocument` | One authority for persistence |
| Answer hiding | Existing `data-testid="reveal-answer"` toggle in `SceneGlyph` | Shipped in main; kept, not renamed |

Alternatives rejected: (a) a second `draftPractice`/`propose_interactive_exercise` route — duplicate
authority; (b) model-supplied coordinates — the plan's core thesis; (c) a new scientific-object kind
for "generated artifact" — would trigger the six-part rule and is unnecessary; an optional
`provenance` field on the existing base is enough.

## Containment (code, not model judgement)

- `sourceRefs` are filtered server-side in `server/agent.ts` against the exact chunks returned by
  retrieval or `search_course_documents`; invented refs are dropped before the tool call reaches the
  client and counted as rejected. The model still decides *whether* to cite.
- Count is validated 1–8 by the schema (rejected, never clamped).
- Every authored object carries `provenance.status = "generated-unverified"` and the rendered review
  dialog says "generated, not verified" explicitly.
- Aliases (`#...`) are intent-only. The compiler resolves them against current board bounds before
  building objects; it throws on an unresolved alias. No alias string is ever copied into an object
  or the saved document (leak test).
- The existing 3-call cap is unchanged; the normal path is 1–2 calls, the repair path fits inside 3.
  Raising the cap would need its own ADR.

## Verification

TDD: Vitest for schema/compiler/proposal/agent binding; Playwright for the friction-incline
acceptance (one dialog, one revision bump, citations, generated label, unchanged on decline);
`benchmark:canvas` with four gate numbers quoted because the bound-tool surface changes.
