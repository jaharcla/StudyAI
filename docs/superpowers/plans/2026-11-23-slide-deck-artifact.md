# Slide Deck Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `slide_deck` artifact that the Tutor generates from course-grounded semantic components via an integrated self-hosted Presenton renderer, plus a shared Artifacts page to save and organize it.

**Architecture:** The Artifact Intelligence composition authority (`src/artifacts/`) emits a semantic `slide_deck` component with claims, visual intents and speaker notes — never shape IDs or coordinates. A new `server/presentations/` layer compiles it to Presenton's `slides_markdown` request, calls a self-hosted Presenton over loopback, validates the returned deck (citations, titles, images, placeholder text), and stores it as a row in the generalized `studio_artifacts` table with the `.pptx` under `data/artifacts/`. The website Artifacts page lists, opens, downloads and organizes those rows.

**Tech Stack:** TypeScript 5.9, Zod 4.6 (`src/artifacts/package.ts`), Node `fetch`, better-sqlite3, React 19, Vitest 3, Playwright 1.56, self-hosted Presenton (Apache-2.0) via REST.

**Spec:** `docs/superpowers/specs/2026-11-23-slide-deck-artifact-design.md`

## Global Constraints

- One composition authority: `src/artifacts/` only. Intelligence never reads or writes a board (`ADR-2026-11-23-artifact-intelligence-system.md:9-10`).
- Claim provenance: `direct` excerpts must be substring-contained in the retrieved chunk; invented refs are downgraded (ADR:11).
- Bounded repair: one generation call, at most one repair call; `TUTOR_MAX_PROVIDER_CALLS ?? 3` unchanged (ADR:12).
- Additive SQLite schema only; no `CanvasDocument.version` change; no new `ScientificObject` kind.
- Every UI-visible behaviour needs a Playwright DOM assertion; no `@ts-ignore`/`as any`/`as never` (`AGENTS.md:14`).
- `npm run verify` output must be quoted before claiming done (`AGENTS.md:18`).
- `gitnexus impact` before editing an existing function; `detect_changes({scope:"all"})` before every commit, re-run until `partial:false, truncated:false` (root `CLAUDE.md`).
- No subagents (user constraint); no paid tools; no cloud keys sent to external tools; Presenton community gallery disabled.
- Templates: English only, at most 12, CC0/CC BY only. No non-English corpora. No new npm dependency.
- Presenton is a service behind `SlideDeckRenderer`; no import of Presenton internals into the app process.

## Review Focus

1. **Invented citations in generated slides** — a deck must never show a claim whose `sourceRef` was not retrieved with a containing excerpt. Test: `validateDeck` drops/downgrades invented refs in Task 5.
2. **Geometry leaking into the model-facing contract** — no `left/top/width/height`, shape ID, font or colour field may enter `slide_deck`. Test: strict-schema rejection in Task 1.
3. **Non-editable or corrupt PPTX** — a full-slide-image export or malformed package must not be stored. Test: renderer response contract + validation in Tasks 4 and 5.
4. **Unbounded regeneration / retry storms** — at most one repair call, and a failed repair must not overwrite a good artifact. Test: bounded-repair orchestration in Task 5 and service test in Task 6.
5. **Path traversal / cross-course reads through artifact routes** — downloading or renaming must stay inside `data/artifacts/` and the requested course. Test: HTTP route tests in Task 6, URL-encoded `..` and wrong-course cases.

---

### Task 1: ADR and `slide_deck` contract

**Files:**
- Create: `docs/decisions/2026-11-23-slide-deck-reuse.md`
- Modify: `src/artifacts/package.ts:11-42,62-64`
- Test: `tests/artifact-package.test.ts`

**Interfaces:**
- Consumes: `claimProvenanceSchema` (`src/artifacts/contracts.ts:6-13`), `artifactPackageSchema` (`src/artifacts/package.ts:50`).
- Produces: `SlideDeckComponent` / `SlideDeckSlide` exported types, added as the 11th arm of `artifactComponentSchema`; `parseArtifactPackage` unchanged in signature.

- [ ] **Step 1: Write the ADR first** (repo rule: decision before code)
  File `docs/decisions/2026-11-23-slide-deck-reuse.md` records: scope reversal (decks were out of scope), rejected alternatives (scratch PPTX agent, PPTAgent as website engine, Codex Slides export, SlideLab), Presenton version/licence/limits (Apache-2.0, REST/MCP, Pexels 200/h + 20k/month, Pixabay ~100/60s, local/Ollama provider preferred), port quad, the "keep `studio_artifacts` with additive columns" call, and verification plan. No code before this file exists.

- [ ] **Step 2: Write the failing test**
  In `tests/artifact-package.test.ts`, add a `describe("slide_deck component", ...)` with:
  - `expect(parseArtifactPackage(makePackage({ components: [validSlideDeck()] }), [REF]).components[0].kind).toBe("slide_deck")`
  - `expect(() => parseArtifactPackage(makePackage({ components: [{...validSlideDeck(), left: 10} ]}), [REF])).toThrow()` (strict schema rejects coordinates)
  - `expect(() => parseArtifactPackage(makePackage({ components: [{...validSlideDeck(), slides: [{...slide, shapeId: 4}]}] }), [REF])).toThrow()`
  - `expect(() => parseArtifactPackage(makePackage({ components: [{...validSlideDeck(), sourceRefs: ["invented#p9"]}] }), [REF])).toThrow(/not retrieved/i)`
  `validSlideDeck()` = `{ id:"sd1", kind:"slide_deck", sourceRefs:[REF], objective:"Understand friction", templateId:"general-en", language:"en", slides:[{ role:"mechanism", title:"Friction opposes motion", claims:[{claim:"Friction opposes motion.", sourceRef:REF, excerpt:"Friction opposes motion.", relationship:"direct"}], visual:{kind:"diagram", altText:"Force arrows on an inclined plane"}, notes:"Explain the direction." }] }`.

- [ ] **Step 3: Run it to verify it fails**
  Run: `npx vitest run tests/artifact-package.test.ts -t "slide_deck component"`
  Expected: FAIL — unknown discriminated union value `slide_deck`.

- [ ] **Step 4: Add the `slide_deck` arm**
  In `src/artifacts/package.ts`, add to `artifactComponentSchema` a `.strict()` object with `kind: z.literal("slide_deck")`, `...componentBase`, `objective` (1–280), `templateId` (1–80), `language: z.literal("en")`, `slides`: array (min 2, max 20) of strict objects `{ role: enum(title|overview|mechanism|example|check|summary), title: 1–120, claims: array of claimProvenanceSchema max 6 default [], visual: optional strict `{ kind: enum(none|diagram|photo|illustration), query?: ≤200, prompt?: ≤500, altText: 1–300, credit?: ≤300 }`, notes?: ≤2000 }`. Export `SlideDeckComponent` and `SlideDeckSlide` via `z.infer`. Do not add any geometry/ID/font/colour field.

- [ ] **Step 5: Run it to verify it passes**
  Run: `npx vitest run tests/artifact-package.test.ts`
  Expected: PASS, including the pre-existing "round-trips one component of every advertised kind" test (extend its `allKinds` with `validSlideDeck()`).

- [ ] **Step 6: Commit**
  `git add docs/decisions/2026-11-23-slide-deck-reuse.md src/artifacts/package.ts tests/artifact-package.test.ts && git commit -m "feat: add slide_deck artifact contract and reuse ADR"`

---

### Task 2: English template manifest and validator

**Files:**
- Create: `server/presentations/templates.ts`
- Test: `tests/slide-deck-templates.test.ts`

**Interfaces:**
- Consumes: Zod 4.6.
- Produces: `export type DeckTemplate`, `export const deckTemplates: readonly DeckTemplate[]`, `export function findDeckTemplate(id: string): DeckTemplate` (throws `Unknown slide deck template: ${id}`).

- [ ] **Step 1: Write the failing test**
  `tests/slide-deck-templates.test.ts`: assert every `deckTemplates` entry has `language === "en"`, `licence` is `"CC0"` or `"CC BY"`, `id` matches `/^[a-z0-9-]+$/`, and `findDeckTemplate("general-en")` returns that entry; assert `findDeckTemplate("ru-seminar")` throws `/Unknown slide deck template/`.

- [ ] **Step 2: Run it to verify it fails**
  Run: `npx vitest run tests/slide-deck-templates.test.ts`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement the manifest**
  `server/presentations/templates.ts`: Zod strict schema `{ id, name, licence: enum(CC0, "CC BY"), attribution, language: literal("en"), builtin: boolean }`; export a constant array with `general-en` (Presenton built-in `general`), `training-en` (Presenton built-in general re-labelled for coursework), and no more than 12 entries. `findDeckTemplate` uses `.find` and throws on miss. No network calls, no file reads.

- [ ] **Step 4: Run it to verify it passes**
  Run: `npx vitest run tests/slide-deck-templates.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git add server/presentations/templates.ts tests/slide-deck-templates.test.ts && git commit -m "feat: add English slide deck template manifest"`

---

### Task 3: Semantic slide spec → Presenton request compiler

**Files:**
- Create: `server/presentations/compile.ts`
- Test: `tests/slide-deck-compile.test.ts`

**Interfaces:**
- Consumes: `SlideDeckComponent` from Task 1, `DeckTemplate` from Task 2.
- Produces: `export type PresentonGenerateRequest = { content: string; slides_markdown: string[]; n_slides: number; template: string; language: "English"; export_as: "pptx"; include_title_slide: boolean }`, `export function compileSlideDeck(component: SlideDeckComponent, template: DeckTemplate): PresentonGenerateRequest`, `export function imagePlan(component: SlideDeckComponent): Array<{ kind: "diagram"|"photo"|"illustration"; query?: string; prompt?: string; altText: string; credit?: string }>`.

- [ ] **Step 1: Write the failing test**
  `tests/slide-deck-compile.test.ts` asserts:
  - `request.content === ""`, `request.language === "English"`, `request.export_as === "pptx"`, `request.n_slides === component.slides.length`, `request.template === "general"`.
  - `request.slides_markdown[0]` starts with `# Friction opposes motion`, contains the claim text, and contains `> Source: studyai://...` from the claim's `sourceRef` for a `direct` claim.
  - `JSON.stringify(request)` contains no `left`, `top`, `width`, `height`, `shapeId`, `fontFace` or hex colour.
  - `imagePlan(...)` returns `kind:"diagram"` with the slide's `altText` and no `query`.

- [ ] **Step 2: Run it to verify it fails**
  Run: `npx vitest run tests/slide-deck-compile.test.ts`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement the compiler**
  `compileSlideDeck` maps each slide to one Markdown string: `# ${title}`, then claim lines, then `> Source: ${sourceRef}` lines for `direct` claims only, then `> Notes: ${notes}` when present. `template` uses Presenton's built-in name from `template.id` (`general-en` → `general`, `training-en` → `general`), `include_title_slide: false` because slide role `title` is in the spec. `imagePlan` extracts visual intents (never queries for `diagram`).

- [ ] **Step 4: Run it to verify it passes**
  Run: `npx vitest run tests/slide-deck-compile.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git add server/presentations/compile.ts tests/slide-deck-compile.test.ts && git commit -m "feat: compile slide_deck spec to Presenton request"`

---

### Task 4: Presenton renderer behind an injectable interface

**Files:**
- Create: `server/presentations/renderer.ts`
- Test: `tests/slide-deck-renderer.test.ts`

**Interfaces:**
- Consumes: `PresentonGenerateRequest` from Task 3.
- Produces: `export type RenderedDeck = { presentationId: string; pptxPath: string; editPath: string }`, `export type RendererDeps = { fetch: typeof fetch; baseUrl: string; apiKey: string }`, `export async function renderPresentonDeck(request: PresentonGenerateRequest, deps: RendererDeps): Promise<RenderedDeck>`.

- [ ] **Step 1: Write the failing test**
  `tests/slide-deck-renderer.test.ts` uses an injected fake `fetch` returning `{ presentation_id:"p1", path:"/app_data/p1/final.pptx", edit_path:"/presentation?id=p1" }`. Assert:
  - POST to `${baseUrl}/api/v1/ppt/presentation/generate`, `Authorization: Bearer ${apiKey}`, JSON body equals the request.
  - returns `{ presentationId:"p1", pptxPath:"p1/final.pptx", editPath:"/presentation?id=p1" }`.
  - non-2xx rejects with `/Presenton generation failed/`.
  - a `path` containing `".."` or an absolute Windows path rejects with `/unsafe Presenton path/`.
  - no API key appears in the rejection message.

- [ ] **Step 2: Run it to verify it fails**
  Run: `npx vitest run tests/slide-deck-renderer.test.ts`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement the renderer**
  `renderPresentonDeck` POSTs with `content-type: application/json` and bearer auth, validates the response with a strict Zod schema, strips `/app_data/` prefix with a `..` and drive-letter guard, and throws bounded errors. No default key; caller supplies it from env. Never log the key or response headers.

- [ ] **Step 4: Run it to verify it passes**
  Run: `npx vitest run tests/slide-deck-renderer.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git add server/presentations/renderer.ts tests/slide-deck-renderer.test.ts && git commit -m "feat: add injectable Presenton renderer"`

---

### Task 5: Deck validation and bounded repair

**Files:**
- Create: `server/presentations/validate.ts`, `server/presentations/repair.ts`
- Test: `tests/slide-deck-validate.test.ts`

**Interfaces:**
- Consumes: `SlideDeckComponent` (Task 1), `PresentonGenerateRequest` (Task 3), `ValidationProblem` / `ValidationReport` (`src/artifacts/contracts.ts:23-31`).
- Produces: `export function validateDeckText(text: string, component: SlideDeckComponent, retrieved: ReadonlyMap<string,string>): ValidationReport`; `export type RepairDecision = { needsRepair: boolean; report: ValidationReport; preserve: string[] }`; `export function decideRepair(report: ValidationReport, generationsUsed: number): RepairDecision`.

- [ ] **Step 1: Write the failing tests**
  `tests/slide-deck-validate.test.ts`:
  - `validateDeckText` returns `ok:false` and a problem with `validator:"citation-containment"` when the deck text contains a claim whose `sourceRef` is absent from `retrieved`, and when a `direct` excerpt is not a substring of `retrieved.get(ref)`.
  - returns `ok:false`, `validator:"slide-titles"` when two slides share a title; `validator:"placeholder-text"` for `TODO`, `lorem ipsum`, `Click to add title`; `validator:"alt-text"` for a visual intent with empty `altText`.
  - `decideRepair(report, 1)` = `{ needsRepair:true, preserve:[...unaffected slide titles] }`; `decideRepair(report, 2)` = `{ needsRepair:false, ... }` (hard cap: one generation + one repair).

- [ ] **Step 2: Run it to verify it fails**
  Run: `npx vitest run tests/slide-deck-validate.test.ts`
  Expected: FAIL — modules not found.

- [ ] **Step 3: Implement validation and repair decision**
  Reuse `ValidationProblem`/`ValidationReport` shapes. `validateDeckText` checks the rendered text extracted from the deck (caller supplies it), not the model's JSON. `decideRepair` returns `needsRepair:false` when `generationsUsed >= 2`; `preserve` lists slide titles whose claims passed all checks. No new provider calls inside these functions.

- [ ] **Step 4: Run it to verify it passes**
  Run: `npx vitest run tests/slide-deck-validate.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  `git add server/presentations/validate.ts server/presentations/repair.ts tests/slide-deck-validate.test.ts && git commit -m "feat: validate generated decks and bound repair"`

---

### Task 6: Artifact service, additive schema and HTTP routes

**Files:**
- Modify: `server/studio/schema.ts:3-16` (additive columns), `server/api.ts:16,46,54` (wire handler)
- Create: `server/presentations/service.ts`, `server/presentations/http.ts`
- Test: `tests/slide-deck-service.test.ts`, `tests/slide-deck-http.test.ts`

**Interfaces:**
- Consumes: `buildGrounding` (`server/studio/grounding.ts:19`) returning `Grounding` (`server/studio/contracts.ts:39-45`); `initializeStudioSchema` (`server/studio/schema.ts:3`); Tasks 1–5.
- Produces: `export const SlideDeckGenerateSchema` (strict `{courseId, lessonId, focus, templateId?}`), `export async function generateSlideDeck(db, rawInput, deps: { renderer: typeof renderPresentonDeck; readDeckText: (path:string)=>Promise<string> }): Promise<SlideDeckArtifact>`, `export function listSlideDecks(db, courseId): SlideDeckArtifact[]`, `export function createSlideDeckHandler(db, deps, origin?)` returning a `(req,res)=>Promise<boolean>` handler like `createStudioHandler`.

- [ ] **Step 1: Write the failing service test**
  `tests/slide-deck-service.test.ts` with an in-memory SQLite DB (`better-sqlite3` `:memory:`) and an injected renderer returning a fake path plus a fake `readDeckText`. Assert: one renderer call on success; exactly two calls when the first deck fails citation containment and the repair succeeds; one call when `generationsUsed >= 2`; stored row has `kind:"slide_deck"`, `course_id`, non-empty `content`, and `source_refs` from the component only; no invented ref persists.

- [ ] **Step 2: Run it to verify it fails**
  Run: `npx vitest run tests/slide-deck-service.test.ts`
  Expected: FAIL — module not found.

- [ ] **Step 3: Additive schema and service**
  In `server/studio/schema.ts`, add `collection TEXT NOT NULL DEFAULT ''` and `file_path TEXT NOT NULL DEFAULT ''` to `CREATE TABLE IF NOT EXISTS studio_artifacts` plus an index on `(course_id, collection, created_at DESC)`. Existing rows keep defaults; no migration/version bump. Implement `generateSlideDeck` to: parse input, call `buildGrounding`, build a `ArtifactPackage` with one `slide_deck` component (claims only from groundings, one `direct` excerpt per claim), `findDeckTemplate`, `compileSlideDeck`, `renderPresentonDeck`, `validateDeckText`, optional one repair, then insert one row via `initializeStudioSchema(db)`-backed statements. Store the `.pptx` path in `file_path` and the component JSON in `content`.

- [ ] **Step 4: Run the service test**
  Run: `npx vitest run tests/slide-deck-service.test.ts`
  Expected: PASS.

- [ ] **Step 5: Write and run the HTTP tests**
  `tests/slide-deck-http.test.ts` asserts:
  - `POST /api/slide-decks/generate` returns 201 with the artifact.
  - `GET /api/slide-decks?course=chem-120` lists only that course's slide decks.
  - `GET /api/slide-decks/artifact?id=…&course=other` returns 404 for a course mismatch.
  - `GET /api/slide-decks/download?id=…&course=…` serves the file from `data/artifacts/`; `id=..%2F..%2Fsecret` returns 400 with `/unsafe/`.
  - `PATCH /api/slide-decks/artifact` changes `title`/`collection` only; `DELETE` removes the row and file.
  Run: `npx vitest run tests/slide-deck-http.test.ts`
  Expected: PASS.

- [ ] **Step 6: Wire into `server/api.ts`**
  Import `createSlideDeckHandler`, construct with `(db, deps, config.webOrigin)`, and add to the handler chain after `studioHandler` using the same `if (await handler(req,res)) return` pattern already used there.

- [ ] **Step 7: Commit**
  `git add server/studio/schema.ts server/api.ts server/presentations/service.ts server/presentations/http.ts tests/slide-deck-service.test.ts tests/slide-deck-http.test.ts && git commit -m "feat: persist and serve slide deck artifacts"`

---

### Task 7: Artifacts page in the website

**Files:**
- Create: `src/artifacts/api.ts`, `src/artifacts/ArtifactsPage.tsx`, `src/artifacts/artifacts.css`
- Modify: `src/App.tsx:14,58,371-372,403-404`
- Test: `tests/e2e/artifacts-page.spec.ts`

**Interfaces:**
- Consumes: routes from Task 6; `StudioArtifact` shape idea from `src/studio/api.ts:17-21`; `sourceLabel` from `src/studio/api.ts:54`.
- Produces: `export type SlideDeckArtifact`, `export function listSlideDecks(courseId: string)`, `export function generateSlideDeck(input)`, `export function downloadSlideDeckUrl(id, courseId)`, `export function updateSlideDeck(id, patch)`, `export function deleteSlideDeck(id, courseId)`; default-exported `ArtifactsPage` with props `{ courseId, lessonId, courseTitle, close: () => void, onOpenSource: (ref: string) => void }`.

- [ ] **Step 1: Write the failing Playwright spec**
  `tests/e2e/artifacts-page.spec.ts` mocks `/api/slide-decks/**` with one `slide_deck` fixture and asserts: the page lists `slide_deck` rows, the course filter changes visible rows, "Open slides" renders slide images with a citation link, clicking the citation calls `onOpenSource` (assert via the mock's source-navigation state or a testid), "Download .pptx" href points at the route, Rename updates the visible title, Delete removes the row. Each assertion uses `data-testid` attributes.

- [ ] **Step 2: Run it to verify it fails**
  Run: `npx playwright test tests/e2e/artifacts-page.spec.ts`
  Expected: FAIL — route/page missing.

- [ ] **Step 3: Implement client API and page**
  `src/artifacts/api.ts` uses `requestJson` pattern from `src/studio/api.ts:28-33`. `ArtifactsPage.tsx` renders a list with filters (course, kind, collection), a slide viewer showing rendered PNG thumbnails plus claims with openable citations and speaker notes, and a toolbar with Generate / Download / Rename / Delete. Scoped CSS in `artifacts.css`; no global style changes.

- [ ] **Step 4: Wire the shell**
  In `src/App.tsx`, extend `mode` union with `"artifacts"`, add an "Artifacts" button beside Studio, and mount `<ArtifactsPage … />` with the same `onOpenSource` callback Studio uses (`setOpenDocumentId(undefined); setOpenSourceRef(ref); setMode("canvas"); setView("Lecture")`).

- [ ] **Step 5: Run the spec**
  Run: `npx playwright test tests/e2e/artifacts-page.spec.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**
  `git add src/artifacts/api.ts src/artifacts/ArtifactsPage.tsx src/artifacts/artifacts.css src/App.tsx tests/e2e/artifacts-page.spec.ts && git commit -m "feat: add website artifacts page for slide decks"`

---

### Task 8: Verification and handoff record

**Files:**
- Create: `docs/verification/2026-11-23-slide-deck-verification.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: a verification record quoting `npm run verify` output and the four `benchmark:canvas` gate numbers if the Tutor prompt/model path changed.

- [ ] **Step 1: Run the full gate**
  Run: `npm run verify`
  Expected: exit 0; record the exact output (tsc, vitest count, Playwright count) in the verification doc.

- [ ] **Step 2: Run canvas benchmark if the model path changed**
  Run: `npm run benchmark:canvas`
  Expected: quote the four gate numbers against `docs/verification/canvas-benchmark-baseline.json`: 0 hard failures, 4/6 math exact, 0.91 F1, 0.75 PhysAlign coverage. Do not pass `--update-baseline`.

- [ ] **Step 3: Graph check**
  Run `gitnexus detect_changes({scope:"all"})` (or CLI equivalent) and re-run until `{partial:false, truncated:false}`; record the result in the doc.

- [ ] **Step 4: Commit the verification record**
  `git add docs/verification/2026-11-23-slide-deck-verification.md && git commit -m "docs: record slide deck verification"`

---

## Self-review notes

- Spec coverage: ADR/scope (T1), `slide_deck` contract (T1), templates (T2), semantic compiler (T3), integrated renderer (T4), images (T3 visual intents + T2 provider limits in ADR; course-native figure extraction explicitly deferred in spec), validation/repair (T5), artifact store/page (T6–T7), verification (T8). No spec section lacks a task.
- Review Focus items are pinned by tests in T1, T5 and T6 respectively.
- Type consistency: `SlideDeckComponent` → `compileSlideDeck` → `PresentonGenerateRequest` → `renderPresentonDeck` → `validateDeckText` → `generateSlideDeck` → `SlideDeckArtifact` → page props.
- Proportion: signatures and assertions only; no implementation bodies copied into the plan.
