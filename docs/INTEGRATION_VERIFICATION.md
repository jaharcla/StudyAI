# Document intelligence and scientific canvas integration

## Inputs and isolation

- Document branch: `work/document-intelligence`, `7eb5449507946c988cae806a2c2c15d3cd5ad9f9`.
- Canvas branch: `work/canvas-scientific-workspace`, `0ecf5033049ab2eeaaf827ff8a9c0c14cd9b7ed0`.
- Integration branch/worktree: `work/integrated-document-canvas`, `.worktrees/integrated-document-canvas`.
- Both source worktrees remain at their original commits. No merge into `main`.
- Conflicts in `src/App.tsx` and `server/api.ts` resolved by preserving the document library, citation routing, scientific canvas, and legacy API routes.

## Contracts

- SQLite retains legacy tables; document intelligence uses its existing `di_*` tables and FTS5 triggers. Migrations add lessons and optional document/notes lesson associations without deleting existing records.
- Legacy TXT imports are indexed into the document subsystem with their original IDs and files. Existing source cards therefore continue to open. Deletion synchronizes both indexes and metadata so removed documents cannot reappear on restart. Missing legacy uploads are reported without deleting their metadata.
- Fresh databases contain user-created courses/lessons rather than sample data. Existing canvas lesson IDs are backfilled into navigation. These changes were coordinated with the separate configuration cleanup based on audit commit `b8225157bfb27754f51beccd5936e7ef947f45ba`.
- Documents belong to a course, with an optional import lesson. Retrieval remains course-wide, including documents from other lessons in that course.
- Canvas reads, saves, and deletes are scoped to both course and lesson. Cross-scope overwrites are rejected. Structured science and the Quickdraw snapshot persist in the same canvas document.
- CopilotKit supplies the active course/lesson and full scientific object state. Retrieval is bound server-side to the validated active course; the model cannot select another course in tool arguments.
- `propose_canvas_edit` uses CopilotKit's existing frontend tool mechanism. It validates a field patch, presents the proposed change, and applies it through the existing canvas history/save path. Changed objects or boards invalidate stale proposals. Freehand marks remain uninterpreted.
- Lewis proposals expose typed atom-electron and active-resonance bond-order edits. These merge by existing child IDs, preserving other atoms, bonds, resonance forms, and the Quickdraw snapshot.
- Imported source cards open the document intelligence viewer. Tutor references resolve to the original course document and page/slide/text unit.
- Relative `/api` URLs use Vite proxy routes. Default integration ports: web 5183, runtime 8210, data 8211, graph 8133. Environment variables override these; collisions fail instead of selecting another web port.
- Existing Quickdraw, React PDF/PDF.js, OpenChemLib, CopilotKit, LangGraph, and SQLite modules are retained. PDF.js is now a direct pinned dependency.

## Verification failures and corrections

| Failure | Correction/status |
| --- | --- |
| Merge left incompatible entrypoint fragments and old source-search calls | Combined library/canvas wiring; removed obsolete state references; TypeScript subsequently passed. |
| LangGraph CLI watch loader hung before serving health requests | Existing CLI `--no-reload` option starts the graph successfully. Source changes require a graph restart. |
| Development browser chat was lost during baseline builds | Baseline generated files triggered Vite reloads; ignore `data` and nested worktree paths, and verify the production build with preview. |
| Long PDF fixture text ran outside its page and was not extracted | Wrap fixture text into PDF lines within the media box. |
| Clean install used an incompatible parent esbuild binary | Original `omit=optional` skipped nested platform binaries. Enable optional dependencies and repeat clean installation. |
| Concurrent configuration cleanup changed shared API/schema files during verification | File ownership coordinated with the authorized “Audit dynamic configuration” chat; final verification must use the combined final files. |
| Clicking the already selected course cleared its lessons without reloading them | Same-course navigation preserves the current selection. |
| Dynamic lesson headings/status appeared in multiple UI locations | Scope browser selectors to exact headings and the topbar save status. |
| Tutor finished on the server but browser received `INCOMPLETE_STREAM` with missing tool-call metadata | Automatic prefetch now uses the existing retrieval service without a model-tool span; model-requested retrieval supplies complete tool-call IDs. |
| Freehand test initially clicked a canvas menu/palette | Close the board menu and tool palette before drawing on the Quickdraw surface. |
| Save/reload test reloaded while the save-status element still said “Saving…” | Wait for the exact “All changes saved” text before reloading. |
| The model targeted a child atom as a top-level object, then proposed only a rename | Add typed `atomEdits`/`bondEdits`, describe parent molecule identity, and group requested changes in one reviewable proposal. |
| Canvas note linking still used the former course-only notes API | Send the active lesson on note listing/creation, check HTTP failures, and verify linked-note saving plus lesson isolation in the browser flow. |

## Bundle measurements

Decimal bytes; gzip calculated independently per file. Baselines were built from archived exact commits using the same initially installed toolchain, without modifying source worktrees. Full distribution includes lazy syntax grammars, fonts, PDF worker, chemistry, and other library assets; it is not the initial network payload.

| Build | Entry raw | Entry gzip | Distribution raw | Distribution gzip |
| --- | ---: | ---: | ---: | ---: |
| Document `7eb5449` | 3,411,235 | 978,031 | 19,887,236 | 5,182,798 |
| Canvas `0ecf503` | 3,010,843 | 858,757 | 20,895,572 | 5,582,029 |
| Integration before configuration cleanup/clean install | 3,015,495 | 860,599 | 22,396,874 | 6,007,126 |
| Final combined integration | 3,022,042 | 862,131 | 22,403,421 | 6,008,598 |

The initial combined entry was approximately 3,453,550 bytes (~989,860 gzip). Lazy-loading the document library reduced the entry without replacing libraries. PDF worker: 1,046,214 bytes / 289,897 gzip. Lazy OpenChemLib adapter chunk: 1,097,002 bytes / 340,786 gzip. Vite still reports chunks over 500 kB.

Reproduce measurements with `npm exec -- tsx scripts/bundle-size.ts dist`.

## Final verification

Verified on November 7, 2026 (America/Toronto), after configuration cleanup and a clean local dependency installation:

| Check | Result |
| --- | --- |
| `npm ci --include=optional` | Passed; 1,493 packages installed in the integration worktree. |
| `npm ls --depth=0` | Passed; direct dependencies match the manifest. |
| `npm exec -- tsc --noEmit` | Passed. |
| `npm run build` | Passed; final Vite build 29.06 seconds, with large-chunk warnings. |
| `npm test -- --reporter=default --reporter=json --outputFile=data/unit-results.json` | 41 passed, 0 failed, 9 files. |
| Production Playwright suite | 6 passed, 0 failed, 42.0 seconds; Chromium and real local `qwen3:latest`, no mocked tutor. |
| Source worktrees | Clean and unchanged at the exact input commits. |
| Main | Not merged. |

Production browser command in PowerShell:

```powershell
$env:STUDYAI_E2E_PRODUCTION='1'
npm run test:e2e
```

The full flow imports a PDF through the UI, verifies the course index and lesson metadata, obtains a tutor answer/canonical page citation, renders the cited PDF using the bundled worker, edits Lewis data manually, draws a Quickdraw stroke, obtains and approves typed tutor corrections to atom electrons and bond order, saves, reloads, and checks the corrected chemistry and unchanged drawing records. It also switches lessons, opens a linked document, creates/opens/saves a lesson-scoped note, and checks note isolation. Separate cases cover OpenChemLib conversion, course-separated boards, cross-scope API rejection, legacy TXT compatibility/deletion, and workspace views.

Tests use separate SQLite/upload paths under `data/e2e-*`; original user databases and uploads were not moved. Machine-readable final results and bundle measurements are in [verification-results.json](verification-results.json) and [bundle-sizes.json](bundle-sizes.json).

## Remaining limitations

- Extraction is text-only; scanned PDFs need OCR, and document images/tables are not interpreted.
- Search remains lexical FTS5. Citation identity is checked, but scientific correctness still requires source review.
- Existing equation evaluation, graph-model, and anatomy-viewer limitations from `CANVAS_HANDOFF.md` remain.
- PNG export uses the existing Quickdraw drawing export; scientific overlay data is preserved in canvas JSON.
- npm audit on the integration lockfile reported 45 advisories: 6 low, 10 moderate, 25 high, 4 critical. Dependency security remediation was not automatically applied; several suggested fixes require incompatible upgrades/downgrades or have no available fix.

CopilotKit frontend-tool contract: [useFrontendTool](https://docs.copilotkit.ai/reference/v2/hooks/useFrontendTool).
