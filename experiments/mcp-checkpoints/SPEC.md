# MCP Checkpoint Experiments — Campaign Spec

Scope: compare StudyAI's Quickdraw AI Bridge against five upstream reference implementations, producing reproducible evidence rather than analysis only.

## Priorities and experiments

### Priority 1 — Visual correctness and self-correction
Checkpoint: `yctimlin/mcp_excalidraw`.

Give both systems the same artifact tasks. Two conditions for our bridge:
- A: generate the artifact, then stop.
- B: generate it, inspect a screenshot, identify defects, correct them, inspect again.

Artifact kinds: force diagrams, vector diagrams, labelled anatomy, flowcharts, molecular structures, and diagrams containing overlapping or incorrectly positioned elements.

Measures: structural correctness (objects/relationships), visual correctness (labels/arrows/spacing/position), defects per artifact (overlaps, clipping, incorrect connections, missing labels), successful correction rate, corrective iterations, tokens/tool calls/time per successful artifact. Initial rubric: the Excalidraw project's seven-point screenshot checklist; extend it for scientific diagrams — do not assume it is complete.

Question: does screenshot-based feedback improve output enough to justify its extra cost?

### Priority 2 — Canvas integrity and mutation authority
Checkpoint: `vcmf/dim0`.

Simulate: user edits while agent works; agent edits an element changed since read; two agent operations on the same object; duplicated operation replay; operation targeting another board; crash between persistence and broadcast; client reconnect after missing changes.

Measures: lost mutations, duplicate mutations, incorrectly accepted stale edits, cross-board violations, revision/sequence consistency, recovery after reconnect/restart, displayed vs persisted state agreement.

Pass criteria: zero unauthorized cross-board mutations, zero lost acknowledged writes, zero successful stale writes that should have been rejected. Architectural checkpoint: every agent mutation goes through the same authority as normal canvas edits — no second way to change the document.

### Priority 3 — Recognition accuracy and uncertainty
Checkpoints: PaddleOCR `mcp_server` (model/provider), Handwriting OCR MCP (async job lifecycle only).

Build a small labelled corpus: handwritten notes, typed lecture slides, mathematical equations, chemistry structures/notation, diagrams with labels and arrows, mixed handwriting/text/drawings. Treat OCR text accuracy and label-to-element association as separate problems.

Measures: CER, WER, mathematical/scientific symbol accuracy, bounding-box accuracy, label-to-element association accuracy, confidence calibration, correct abstention, latency/resources, propagation of recognition errors into final artifacts.

Question: does changing the recognition provider improve what the tutor actually understands and creates?

### Priority 4 — Approval, tool safety, side-effect correctness
Checkpoints: `excalidraw/excalidraw-mcp` plus MCP Elicitation/HITL patterns.

Classify operations as read-only, reversible edits, consequential edits. Test: read-only incorrectly prompting; consequential executing without approval; approval reused for a different operation; approval surviving a revision change; bypass via another tool path; metadata accuracy vs actual side effects. Reproduce the Excalidraw MCP issue-tracker metadata problems as negative tests; do not copy its implementation blindly.

Measures: unauthorized mutations, approval bypasses, incorrect prompts, stale approval acceptance, correct cancellation/rejection. Pass criteria: no consequential operation bypasses approval; approval for one operation cannot authorize another.

### Priority 5 — Tool efficiency and context consumption
Checkpoints: `yctimlin/mcp_excalidraw` (large surface), `excalidraw/excalidraw-mcp` (minimal surface).

Complete identical tasks using: current StudyAI surface, a more granular arrangement, a batched/composite arrangement. Compare successful completion, not tool count alone.

Measures: tool calls per successful task, input/output tokens, context needed for current canvas, invalid calls, retries/recovery, end-to-end latency, final artifact quality.

Question: which tool design lets the model produce correct artifacts with the least unnecessary interaction?

### Priority 6 — Render determinism and persistence
Checkpoint: `yctimlin/mcp_excalidraw`.

For fixed canvas states, repeatedly render unchanged, export, reload application, restore snapshots, reconnect client, render again.

Measures: identical-state render consistency, geometry/text-position drift, missing/duplicated objects, export/render differences, persistence/restore correctness, failed-load recovery. Upstream reports byte-identical PNGs for unchanged scenes; investigate as a target but do not require byte-identical PNGs across different canvas engines — define a reproducibility test appropriate to StudyAI's renderer.

## Scorecard — keep dimensions separate

| Dimension | Primary metric |
|---|---|
| Task completion | Successful artifact tasks (%) |
| Semantic accuracy | Correct objects, values, relationships (%) |
| Visual quality | Defects per artifact |
| Editability | Native editable elements (%) |
| Context efficiency | Tokens per successful task |
| Tool efficiency | Calls per successful task |
| Reliability | Failed or corrupted operations (%) |
| Recognition | CER/WER and STEM symbol accuracy |
| Provenance | Correct source associations (%) |
| Cost and speed | Cost and latency per successful task |

A system that creates beautiful diagrams but occasionally corrupts a student's document must not compensate with a high visual score. Do not combine dimensions into one score.

## Campaign phases and expected outputs

| Phase | Experiment | Expected output |
|---|---|---|
| 0 | Establish baseline | Baseline report and reproducible test environment |
| 1 | Visual correctness | Artifact benchmark and screenshot feedback comparison |
| 2 | Mutation integrity | Concurrency and recovery test suite |
| 3 | Recognition | OCR comparison report and labelled corpus |
| 4 | Approval safety | Approval and side-effect conformance suite |
| 5 | Tool efficiency | Tool-surface comparison |
| 6 | Render determinism | Render and persistence fidelity report |

## Evidence rule

Every experiment must produce reproducible evidence: saved inputs, outputs, configurations, logs, test results and screenshots. Reports must distinguish tests actually run from metrics merely claimed by an upstream project.
