# Dependency and archive inventory

All 28 supplied ZIPs were enumerated without extracting or executing archive scripts. Original ZIP files are retained. The repositories represent source snapshots; app dependencies use published packages where selected. Versions below are exact intent pins and must be confirmed in `package-lock.json` after `npm install` succeeds.

| Archive | License/package evidence | Decision |
|---|---|---|
| `bioicons-main.zip` | Root license attribution file; Nuxt app | Defer; use only as a future icon source. |
| `body-muscles-main.zip` | Apache-2.0; `body-muscles@1.0.0` | Defer; anatomy module not loaded in core. |
| `CopilotKit-main.zip` | MIT; monorepo source | Use documented v2 entrypoints from published `@copilotkit/react-core` and `@copilotkit/runtime` 1.85.0. |
| `docling-main.zip` | MIT; Python project | Defer; Python 3.10 is installed, but no Docling component is wired. |
| `embed-pdf-viewer-main.zip` | Repository licensing notice; CloudPDF packages | Defer; hosted service SDKs do not fit local-first requirements. |
| `jsxgraph-main.zip` | `jsxgraph@1.14.3`; no root license file found | Defer pending license review. |
| `ketcher-master.zip` | Apache-2.0; source monorepo | Defer; larger editor integration remains separate work. |
| `lancedb-main.zip` | Apache-2.0; `@lancedb/lancedb@0.42.0-beta.8` | Reject beta/native vector DB overlap; SQLite FTS5 is used first. |
| `langchainjs-main.zip` | MIT; monorepo | Use selected published LangChain packages only. |
| `langgraphjs-main.zip` | MIT; monorepo | Use published `@langchain/langgraph` and CLI for the tutor graph. |
| `mathjs-develop.zip` | Apache-2.0; `mathjs@15.2.0` | Defer until symbolic/numeric editor needs it. |
| `mathlive-master.zip` | `mathlive@0.111.4`; package license metadata | Defer until equation editor slice. |
| `mediapipe-master.zip` | Apache-2.0; development monorepo | Defer; unnecessary CPU/RAM cost for current foundation. |
| `molstar-master.zip` | MIT; v6 development packages | Defer; molecular viewer not part of first slice. |
| `OATutor-main.zip` | MIT; multi-service app | Reference only; do not merge the application. |
| `openchemlib-js-main.zip` | BSD-3-Clause; `openchemlib@9.25.2` | Pin for future chemistry object editing; current formal-charge utility is standalone. |
| `plotly.js-main.zip` | MIT; bundled/source repo | Defer; load only with graphing module. |
| `pyBKT-master.zip` | MIT; Python project | Defer until enough attempt data exists. |
| `quickdraw-main.zip` | MIT; React package in monorepo | Use published `@quickdrawjs/react` 0.1.0 and matching core CSS. |
| `react-pdf-highlighter-extended-main.zip` | MIT; `react-pdf-highlighter-extended@8.1.0` | Defer until PDF extraction/page citations are implemented. |
| `sqlite-vec-main.zip` | Repo examples present; no root license file found in archive inventory | Defer pending license and Windows native-loading review. |
| `tiptap-main.zip` | MIT; monorepo | Defer; current notes API stores plain text. |
| `transformers.js-main.zip` | Apache-2.0; source monorepo | Defer model download until local embedding setup is implemented. |
| `ts-fsrs-main.zip` | MIT; monorepo | Pin `ts-fsrs@5.2.3`; review scheduler UI not yet wired. |
| `typescript-sdk-main.zip` | MCP SDK licensing transition to Apache-2.0 noted in archive | Defer external MCP gateway; all external connections remain disabled. |
| `Vanatome-main.zip` | MIT; `vanatome@0.1.0` | Defer; anatomy module lazy loading is not implemented. |
| `xyflow-main.zip` | MIT; monorepo | Pin `@xyflow/react@12.10.0` for future concept-map/editor slice. |
| `zod-main.zip` | MIT; source monorepo | Pin Zod 4.1.12; runtime compatibility remains subject to install/build verification. |

Core pins currently include React 19.2.0, Vite 7.1.12, CopilotKit's documented v2 entrypoints (`react-core`/`runtime` 1.85.0), LangGraph 1.7.2, LangGraph CLI 1.7.0, LangChain Core 1.3.5, Quickdraw 0.1.0, and better-sqlite3 12.4.1. The runtime's unrelated peer integrations are omitted during setup because an upstream Zep/LangChain peer range conflicts with current LangChain 1.x; the required LangGraph dependencies remain explicit. Optional platform binaries remain installed.
