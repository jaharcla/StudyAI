# ADR: StudyAI Studio reuse and retrieval decisions

Date: 2026-11-22
Status: accepted
Context: adding generated mind maps, study guides and practice to the real new UI.

## Decision

1. **Reuse `@xyflow/react` 12.10.0** (already pinned, zero imports) for the interactive mind map.
   Verified in the installed package: `node_modules/@xyflow/react/dist/esm/index.d.ts:1` exports
   `ReactFlow`, `:20` exports `useNodesState`/`useEdgesState`, `:11` exports `Panel`,
   `:35` re-exports additional components (`Background`, `Controls`, `MiniMap`). MIT. No new graph
   dependency, no new renderer, no separate app.
2. **Reuse the pinned Groq-first tutor model factory** (`createTutorChatModel` in
   `server/tutor-chat-model.ts:16`, settings from `getTutorProviderSettings` in
   `server/tutor-provider.ts:15`). Studio does not add a provider, key, endpoint or fallback chain;
   it reads the same configuration and sends one bounded JSON completion.
3. **Reuse `LearningService`** for generated practice: `registerCard`
   (`server/learning/service.ts:144`) and `addReviewedQuestion` (`:22`) with its citation check at
   `:31`. Generated items are candidate artifacts until the student imports them; no second card
   table, no second mastery calculation.
4. **Reuse FTS5/BM25 document search and the canvas scene graph** as the grounding sources
   (`server/document-intelligence/service.ts:90`, `server/canvas-intelligence/scene/service.ts:94`).
   Additive `studio_artifacts` table only.
5. **Do not add embeddings or a vector index in this change.** FTS5 remains the retrieval authority.

## Why not embeddings / lancedb / sqlite-vec now

- `docs/DEPENDENCIES.md:14` rejects `@lancedb/lancedb@0.42.0-beta.8` as a beta native vector DB
  that overlaps the existing SQLite store. `:27` defers `sqlite-vec` pending licence and Windows
  native-loading review; the archive has no root licence file.
- `@huggingface/transformers@4.3.2` is installed and already runs CLIP in Node, so embeddings are
  technically feasible. But adding them changes three things at once: a new embedding model
  download/CPU cost, a reindex path for every document, and a ranking/relevance evaluation to
  prove better recall than BM25. There is no labelled relevance set in the repo (the canvas
  calibration script found zero decision rows), so a quality claim would be unfounded.
- StudyAI is local-first and single-user; FTS5 has no native extension, no network dependency, and
  already powers course search and tutor retrieval. Reversing that without measured evidence would
  break the architectural coherence the project is built on.

## Conditions that would reopen this decision

- A labelled course-relevance set exists and BM25 recall@8 is measured below the target; or
- students consistently report that Studio artifacts miss known source material.
Then run an A/B evaluation with a pinned embedding model, record recall/latency/memory numbers,
and write a new ADR before changing the retrieval authority. A hybrid FTS5 + vector path would be
the first option to test, not a replacement.

## Alternatives recorded (from `docs/DEPENDENCIES.md`)

| Project | Version / licence | Disposition |
|---|---|---|
| `@xyflow/react` | 12.10.0 / MIT | **reused** for mind maps |
| `mathjs`, `mathlive`, `openchemlib`, `ts-fsrs`, `zod` | pinned / Apache-2.0, MIT, BSD-3-Clause, MIT, MIT | already reused; Studio relies on them indirectly |
| `lancedb` | 0.42.0-beta.8 / Apache-2.0 | rejected: beta, native, overlaps SQLite |
| `sqlite-vec` | no root licence in archive | deferred: licence + Windows native loading |
| `transformers.js` | 4.3.2 / Apache-2.0 | available, embeddings deferred pending evaluation |
| `tiptap` | MIT | deferred: notes are plain text; guide output is read-only Markdown |
| `pyBKT`, `OATutor` | MIT | deferred/reference only: BKT already ported to TypeScript |

## Limits and verification

Studio grounding is bounded (12 excerpts / 20 concepts / 12 canvas relations per request) and each
completion is capped by the existing tutor token setting. Every generated citation must be a ref
supplied by the grounding packet; the server discards invented ones. Verification is recorded in
`docs/plans/2026-11-22-studio-implementation.md`.
