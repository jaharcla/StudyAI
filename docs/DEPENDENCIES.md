# Dependency and archive inventory

This archive inventory records the reuse evaluation; it is not the current dependency manifest or a record of installed packages. `package.json` and `package-lock.json` are authoritative for app dependencies and versions. Use `npm ci` and `npm ls --depth=0` to verify a local installation. All 28 supplied ZIPs were enumerated without extracting or executing archive scripts, and the original ZIP files are retained.

| Archive | License/package evidence | Decision |
|---|---|---|
| `bioicons-main.zip` | Root license attribution file; Nuxt app | Defer; use only as a future icon source. |
| `body-muscles-main.zip` | Apache-2.0; `body-muscles@1.0.0` | Defer; anatomy module not loaded in core. |
| `CopilotKit-main.zip` | MIT; monorepo source | Use documented v2 entrypoints from published `@copilotkit/react-core` and `@copilotkit/runtime` 1.85.0. |
| `docling-main.zip` | MIT; Python project | Defer; current document extraction is implemented in TypeScript and does not require Python or Docling. |
| `embed-pdf-viewer-main.zip` | Repository licensing notice; CloudPDF packages | Defer; hosted service SDKs do not fit local-first requirements. |
| `jsxgraph-main.zip` | `jsxgraph@1.14.3`; dual licensed MIT/LGPL | Defer: current SVG `GraphPlot` already renders and traces 2D functions; reconsider if constrained geometry becomes a demonstrated need. |
| `ketcher-master.zip` | Apache-2.0; source monorepo | Defer; larger editor integration remains separate work. |
| `lancedb-main.zip` | Apache-2.0; `@lancedb/lancedb@0.42.0-beta.8` | Reject beta/native vector DB overlap; SQLite FTS5 is used first. |
| `langchainjs-main.zip` | MIT; monorepo | Use selected published LangChain packages only. |
| `langgraphjs-main.zip` | MIT; monorepo | Use published `@langchain/langgraph` and CLI for the tutor graph. |
| `mathjs-develop.zip` | Apache-2.0; `mathjs@15.2.0` | Use: pinned parser/evaluator for scientific equations and graphs. Evaluation uses a bounded AST allowlist and numeric-only entrypoint. MathLive input is converted to a validated Math.js representation. |
| `mathlive-master.zip` | MIT; `mathlive@0.111.4` | Use: integrated local `<math-field>` editor in the math workspace. It loads from the pinned package; no CDN is used. |
| `mediapipe-master.zip` | Apache-2.0; development monorepo | Defer; unnecessary CPU/RAM cost for current foundation. |
| `molstar-master.zip` | MIT; v6 development packages | Defer; molecular viewer not part of first slice. |
| `OATutor-main.zip` | MIT; multi-service app | Reference only; BKT equations and selection logic were adapted in TypeScript with attribution in `server/learning/NOTICE.md`. Do not merge the application. |
| `openchemlib-js-main.zip` | BSD-3-Clause; `openchemlib@9.25.2` | Use: current molecule conversion/validation tool; deterministic formal charge and vector calculations remain in StudyAI's existing utility module. |
| `plotly.js-main.zip` | MIT; bundled/source repo | Defer; load only with graphing module. |
| `pyBKT-master.zip` | MIT; Python project | Defer; the current BKT implementation is TypeScript and does not require a Python runtime. |
| `quickdraw-main.zip` | MIT; React package in monorepo | Use published `@quickdrawjs/react` 0.1.0 and matching core CSS. |
| `react-pdf-highlighter-extended-main.zip` | MIT; `react-pdf-highlighter-extended@8.1.0` | Defer; the app uses `react-pdf` for its PDF viewer and citation navigation. This highlighter package is not a runtime dependency. |
| `sqlite-vec-main.zip` | Repo examples present; no root license file found in archive inventory | Defer pending license and Windows native-loading review. |
| `tiptap-main.zip` | MIT; monorepo | Defer; current notes API stores plain text. |
| `transformers.js-main.zip` | Apache-2.0; source monorepo | Use published `@huggingface/transformers@4.3.2` for the Node-native canvas recognition adapter. First model is the MIT `onnx-community/CLIP-ViT-B-32-laion2B-s34B-b79K-ONNX` at int8; see [ADR-2026-11-18-node-canvas-recognition.md](decisions/ADR-2026-11-18-node-canvas-recognition.md). No Python runtime is required. |
| `ts-fsrs-main.zip` | MIT; monorepo | Use pinned `ts-fsrs@5.2.3` for the integrated adaptive review schedule; see [ADAPTIVE_LEARNING.md](ADAPTIVE_LEARNING.md). |
| `typescript-sdk-main.zip` | MCP SDK licensing transition to Apache-2.0 noted in archive | Defer the MCP gateway. Groq and Google Fact Check are separate, configured remote integrations. |
| `Vanatome-main.zip` | MIT; `vanatome@0.1.0` | Defer; anatomy module lazy loading is not implemented. |
| `xyflow-main.zip` | MIT; monorepo | Pin `@xyflow/react@12.10.0` for future concept-map/editor slice. |
| `zod-main.zip` | MIT; source monorepo | Use the pinned Zod version in `package.json` and `package-lock.json` for runtime input and contract validation. |

Current direct pins include React 19.2.0, Vite 7.1.12, CopilotKit `react-core`/`runtime` 1.85.0, LangGraph 1.7.2, LangGraph CLI 1.7.0, LangChain Core 1.3.5, Quickdraw React 0.1.0, Math.js 15.2.0, MathLive 0.111.4, `p-queue` 10.0.0, `ts-fsrs` 5.2.3, Zod 4.2.0, better-sqlite3 12.4.1, `@huggingface/transformers` 4.3.2, and `sharp` 0.35.4. Confirm exact versions in the manifest and lockfile; this inventory does not certify `node_modules` or a successful current install. The runtime's unrelated peer integrations are omitted because an upstream Zep/LangChain peer range conflicts with the current LangChain 1.x stack.
