# Design: `slide_deck` artifacts from the Tutor (integrated engine)

Date: 2026-11-23
Status: design draft — awaiting human approval. Nothing is implemented.
Source conversation: user decisions 2026-11-23 (website artifact + artifacts page, `slide_deck` kind, hybrid images, reuse working AI-to-PPTX projects, English-only small template set).
Related: `docs/superpowers/specs/2026-11-23-artifact-intelligence-system-design.md`, `docs/decisions/ADR-2026-11-23-artifact-intelligence-system.md`, `docs/research/2026-11-23-agentic-pptx-educational-research.md`.

## Intent and the why

A student asks the Tutor for a presentation. The result must be a first-class artifact in the website: listed, opened, saved, and organized next to study guides and mind maps, and downloadable as an editable `.pptx`. The distinguishing bet is unchanged from the Artifact Intelligence System: the deck is built from the student's own course evidence, every claim carries a validated `sourceRef`, and the student accepts or corrects it — it is not a generic slide generator.

## Goals

1. Add a `slide_deck` artifact kind that renders in the website and exports an editable PPTX.
2. Add one shared Artifacts page to save, filter, open, rename, and delete artifacts across courses/lessons/kinds.
3. Reuse an existing working AI-to-PPTX engine instead of rebuilding the agent/PPTX integration.
4. Use a **small, English-only, licence-clean template set** for the first test (dozens at most, not the 100k+ corpora).
5. Hybrid image sourcing: real photos by default, AI illustration only where a photo/diagram cannot carry the idea; every image has provenance, alt text, and a quality gate.
6. Keep claim-level provenance and the existing bounded repair loop; do not create a second composition or retrieval authority.

## Non-goals

- No new `ScientificObject` kind. No change to `CanvasDocument.version`.
- No new board-interpretation path; intelligence still never reads or writes a board.
- No reimplementation of PPTX generation, image search, or visual review that an integrated project already provides.
- No non-English template corpus, no bulk import of hundreds of thousands of decks.
- No autonomous publishing of a deck without the existing accept/correct/decline review.
- No claim that generated slides improve learning outcomes without a learner study; pedagogy is scored by benchmark, not asserted.

## Anti-goals (what would make this a failure)

- An artifact page that is a second history list beside Studio's existing one.
- A `slide_deck` that silently compiles to something else (the `deck`→flashcards mistake).
- A deck with invented citations, decorative images that carry no explanation, or a non-editable full-slide-image PPTX.
- A second provider/egress authority that sends course text to an external service without the user knowing.

## Constraints (binding)

- One composition authority: `src/artifacts/` (`ArtifactPackage`) decides components and relations; renderers compile only what they own (`ADR-2026-11-23:9`).
- Intelligence never reads or writes a board (`ADR:10`).
- Claim-level provenance: `direct` excerpts must be substring-contained in the retrieved chunk; invented refs are downgraded (`ADR:11`).
- Bounded repair: one generation call, at most one repair; `TUTOR_MAX_PROVIDER_CALLS ?? 3` unchanged (`ADR:12`).
- Additive SQLite schema only; UI-visible behaviour needs Playwright DOM assertions; no `@ts-ignore`/`as any`; quote `npm run verify` output (`AGENTS.md:14,18`).
- Reuse-versus-build decisions require an ADR with alternatives, exact versions/licences, limits, and verification (`AGENTS.md:7`).
- Any prompt/model/provider change triggers `npm run benchmark:canvas` with four quoted gate numbers against the tracked baseline (`AGENTS.md`, canvas invariants); `--update-baseline` only on explicit request.
- One worktree per agent, unique port quad, isolated e2e data (`docs/next.md:36`).
- Out-of-scope MCP upstreams per root `CLAUDE.md` routing rules; no paid search/firecrawl/exa/treg calls without approval.

## Approaches considered

| Option | Verdict | Why |
|---|---|---|
| Build the PPTX agent from scratch (custom `pptx_to_json.py` → agent-edited JSON → serializer) | Rejected | Reinvents a solved integration; research shows typed edit APIs + render/feedback loops are needed, and template/format fidelity is a minefield |
| **Integrate Presenton** (`presenton/presenton`, Apache-2.0, 12k stars) as a self-hosted renderer behind a narrow interface | **Chosen** | Already ships REST + MCP generation (`slides_markdown`, `template`, `language`, `export_as: pptx`), built-in English templates, custom templates from PPTX, editable PPTX export, Pexels/Pixabay/image-model providers, Ollama/local providers, Docker on Windows |
| Use PPTAgent / DeepPresenter (`icip-cas/PPTAgent`, MIT) as the website engine | Deferred | Strongest research-backed edit/review loop and editable HTML+PPTX output, but the current skill targets Claude Code/Codex/OpenCode and requires Linux/WSL or macOS + Python/uv/LibreOffice; not a website service today. Use its review discipline as a reference, and DeepPresenter (v1.1.38, MCP server, offline PPTX export) as a future local-model option |
| Use Codex Slides (`nexu-io/codex-slides`, MIT) for export | Rejected for export | 45 curated English templates and 38 MCP tools are attractive, but today it exports **full-slide images**, not editable shapes (on its roadmap). Template/style catalogue may be borrowed later with its upstream attributions |
| SlideLab | Rejected (unavailable) | Code promised "after review"; no public repo at research time |
| Hand-author dozens of templates | Rejected | User constraint: small English-only set from an existing corpus |

## The decided how

### 1. Engine boundary

`server/presentations/` owns a `SlideDeckRenderer` interface with one implementation backed by self-hosted Presenton on its own loopback port (unique quad). StudyAI never imports Presenton internals into the app process; it calls the documented API:

```
POST /api/v1/ppt/presentation/generate
{ content: "", slides_markdown: [...], template: "general", language: "English",
  n_slides, export_as: "pptx", files: [...] }
→ { presentation_id, path, edit_path }
```

Reply text is **not** trusted output: `slides_markdown` is produced from `ArtifactPackage` components by our code, and the returned deck is validated before it becomes an artifact. Presenton is permitted to choose layouts and phrase content; it is not permitted to invent source refs (we add none to its input and check all output claims afterwards). Presenton config is set to a local/Ollama-compatible LLM where possible; any cloud key or external image provider is recorded in the ADR and gated by user consent. Community gallery is disabled (`PRESENTON_COMMUNITY_ENABLED=false`) so the service makes no unrequested design-gallery calls.

### 2. Artifact kind and schema

Add `slide_deck` to `ArtifactComponent` in `src/artifacts/contracts.ts` (the existing `deck` kind stays Canvas flashcards). Additive, strict Zod schema:

```
SlideDeckComponent = {
  objective: string,
  templateId: string,              // from the curated English manifest
  language: "en",
  slides: Array<{
    role: "title"|"overview"|"mechanism"|"example"|"check"|"summary",
    title: string,                  // required: accessibility + navigation
    claims: ClaimProvenance[],      // existing schema, sourceRefs from grounding only
    visual?: { kind: "diagram"|"photo"|"illustration"|"none",
               query?: string, prompt?: string, altText: string,
               credit?: string, sourceRef?: string },
    notes?: string                  // speaker notes, explanation goes here
  }>
}
```

No shape indices, no `(left, top, width, height)`, no font or colour fields — geometry, theme, and placeholders come from the template. `compilePackage` emits a `slide_deck` component only to this renderer.

### 3. Artifacts page and storage

Use **one shared store**: the existing `studio_artifacts` table (`id, course_id, lesson_id, kind, title, content, source_refs, created_at`) generalized as the artifact store. Additive columns only if needed for organization (e.g. `collection`, `updated_at`); no second table and no second history UI. Studio's surface keeps working against the same rows.

`src/artifacts/ArtifactsPage.tsx` (opened from the immersive shell) lists artifacts with filters for course, kind, and date; each row offers Open, Download (.pptx for slide decks), Rename, Move to collection, Delete. Slide detail renders slide images from the generated PPTX (converted to PNG via Presenton/LibreOffice) with clickable citations that use the same source-navigation callback as Studio, plus speaker notes. Artifacts are course-scoped and served through a loopback API; generated `.pptx` files live under `data/artifacts/`, never in git. A Playwright spec asserts the DOM: list rows, filters, open slide viewer, citation opens source, download link, accept/correct/decline.

### 4. Templates (English, small, licence-clean)

v1 manifest: **Presenton built-in English templates** (`general` for education, plus a small number of built-ins) and at most ~12 curated English decks from a licence-filtered corpus (Zenodo10K has per-file CC BY / CC BY-SA / CC BY-NC licences; take only CC0/CC BY). Source licences and attribution are recorded in `docs/decisions/` manifest. Each candidate must pass a template validator: opens in Presenton, has a theme/master/layout structure, named placeholders for title/body/visual, no leftover placeholder text after fill, renders cleanly. `reip` (CC0) is a layout-rule reference only, not a template source. OpenStax decks are deferred (educator-account gating and CC BY-NC-SA). Non-English corpora (`ppt4web`, `lusana`) are explicitly excluded.

### 5. Images (hybrid, integrated)

Route by visual kind, using Presenton's existing providers instead of new client code:

1. `course-figure` — deferred: current Document Intelligence extracts text only, not images. A later project extends it with figure extraction and `sourceRef`.
2. `diagram` — deterministic SVG from the semantic spec (free-body, graph, process), generated in StudyAI; precise and local.
3. `photo` — Pexels/Pixabay via `IMAGE_PROVIDER`; short topic-derived query strings only, never course excerpts; cache by query; download and embed bytes, never hotlink.
4. `illustration` — configured image model (Gemini/OpenAI/local) for abstract or style-consistent visuals, labelled "AI illustration, not course evidence", prompt and seed retained.

Quality gate for every image: alt text present and meaningful; does the claim/caption actually reference the image? (reject decorative-only); contrast checked on rendered slide; attribution stored in speaker notes or a credits slide; visual review of every rendered slide before delivery. Rate limits: Pexels 200/h + 20k/month, Pixabay ~100/60s with 24h caching, Unsplash 50/h demo / 1000/h production if ever added (and its no-competing-service clause). Cloudflare Workers AI free tier is 10,000 Neurons/day, not "100,000 requests/day".

### 6. Pipeline (bounded, reviewable)

```
retrieved course evidence (FTS5) + learning concepts + canvas scene context
  → ArtifactPackage with slide_deck component (semantic spec; no geometry)
  → compilePackage → slides_markdown + templateId + image plan
  → Presenton generate (one call) → .pptx
  → validators: package/rels, slide count, unique titles, EMU bounds/overlap,
                 citation containment, image alt/credit, contrast, no placeholder text
  → render slides → inspect → at most ONE repair call (structured problems + preserve list)
  → student accept / correct / decline → one revision in the artifact store
```

Note: `slides_markdown` skips Presenton's outline step but still uses its LLM to map content into layouts and may rephrase text; therefore post-generation citation containment is mandatory, not optional.

### 7. Provider, egress, and cost rules

- Presenton runs on loopback; prefer `LLM=ollama` or `custom` OpenAI-compatible endpoint, matching local-first architecture. Cloud keys only with explicit user opt-in, recorded in the ADR.
- Image requests are short queries/prompts; never send `.env`, tokens, citations with raw student content, or database dumps.
- No paid tool calls in research or verification; no cloud benchmark runs without approval.
- Provider settings in Presenton are a documented service configuration, not a second Tutor provider authority; the ADR must state this boundary.

## Verification plan

- Unit tests: `slide_deck` schema strictness, template manifest validation, citation containment on generated text, image-plan routing, no-geometry invariants.
- Playwright: artifacts page list/filter/open/download/rename/delete, slide viewer renders images, citation opens source, accept/correct/decline writes one revision.
- Service smoke test: Presenton reachable, generate from a fixture `slides_markdown`, verify returned PPTX is editable (real shapes/text, not full-slide images), render to PNG, inspect.
- `npm run verify` (quoted output in handoff). `npm run benchmark:canvas` with four gate numbers if the Tutor prompt/model path changes; new artifact benchmark with human-reviewed blind comparisons for pedagogy and grounding, not model-on-model ratings.

## What is left to the builder

1. Write the ADR before implementation: scope reversal (decks were out of scope), Presenton version/licence/limits, template manifest licences, image-provider terms, port quad, verification results.
2. Spike first (throwaway, no tests): run Presenton via Docker on this Windows host, generate a 4-sl English deck from fixture markdown with a built-in template, confirm editable PPTX and acceptable visual QA. Keep or discard is a new decision.
3. Exact file list and routes: `server/presentations/*`, `server/api.ts` wiring, `src/artifacts/ArtifactsPage.tsx`, `src/studio/api.ts` reuse, additive schema change in `server/studio/schema.ts`.
4. Decide whether `studio_artifacts` is renamed or kept with additive columns (name is misleading; renaming needs a migration test).
5. Decide which Presenton LLM mode is acceptable for local-first (Ollama vs custom endpoint) and whether image providers need a consent UI before first use.
6. Confirm Playwright fixture strategy for a service-backed artifact (mock the Presenton route vs use a prepared PPTX fixture).

## Builder check

Subagents were disabled by the user, so this design was re-read critically by its author. Open items judged to be the human partner's calls are listed under "What is left to the builder" items 4 and 5; all other questions were settled above with the reasoning recorded. No implementation has begun.
