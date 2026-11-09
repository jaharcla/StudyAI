# ADR: Mathematical workspace prototype

Status: bounded prototype verified in `work/math-workspace-prototype`; mainline integration pending conflict review.

## Current implementation

At base `4e9b12b`, StudyAI already has a persistent `ScientificObject` model and revisioned `CanvasDocument`; equation objects store an expression, variable values and result, while graph objects store an expression, range and sampled points. `src/canvas/expressions.ts` lazily loads Math.js 15.2.0 with an AST allowlist and samples 120 graph points. `SceneGlyph.tsx` renders/traces graphs in SVG. Quickdraw remains a separate drawing layer. This branch adds the linked workspace state, bounded step verifier and compact Tutor context projection described below.

The independent research snapshot predates this implementation. Its claims that StudyAI has no Math.js integration, graphing, structured math objects or deterministic Tutor tools are stale. The gap it correctly identified is the missing shared, editable expression state connecting notation, parameters, graph and checked steps. Handwriting marks remain uninterpreted unless a separately validated analysis result supplies evidence.

## Decisions

1. Extend the existing canvas persistence and object identity/revision path. Do not create a second board store or replace Quickdraw. Keep legacy equation/graph objects readable.
2. Use MathLive **0.111.4** (MIT) for local editable notation. Load it only when the workspace opens. Its React guide documents the `<math-field>` custom element; its current releases include fixes for untrusted text rendering. Use no CDN at runtime. [React integration](https://mathlive.io/mathlive/guides/react/) · [license and release history](https://github.com/arnog/mathlive)
3. Reuse Math.js **15.2.0** for the workspace's bounded numeric parser, graph samples and machine-readable AST (`Node.toJSON()`), as well as existing objects and Tutor calculations. MathLive `ascii-math` output must pass the existing AST allowlist. Do not expand accepted syntax or treat arbitrary model text as executable input. Persist a versioned StudyAI math state plus validated Math.js AST JSON; defer MathJSON.
4. Do not add `@cortex-js/compute-engine` in this prototype. Version 0.184.0 requires Node >=26.13 and is incompatible with the project's Node 24.13 runtime. npm metadata confirms 0.152.0 supports Node >=22.3, but its 53.8 MB unpacked package duplicates parsing/numeric capabilities and no required operation has demonstrated a gap versus Math.js plus an explicit transformation whitelist. Reconsider only if a concrete symbolic capability gap justifies its dependency and bundle cost. It remains a maintained, pre-1.0 MIT option. [Compute Engine](https://github.com/cortex-js/compute-engine) · [license](https://github.com/cortex-js/compute-engine/blob/main/LICENSE)
5. Reuse the existing SVG graph and canvas scene for 2D function plots. Do not add Mafs or JSXGraph for this slice: StudyAI already renders and traces sampled function graphs, and replacing/integrating a second visual layer would add ownership and bundle cost without enabling the required linked parameter demo. JSXGraph remains a candidate if constrained geometric constructions become a demonstrated need; it is dual licensed MIT/LGPL. [JSXGraph scope and license](https://jsxgraph.org/docs/)
6. Use only an explicit, small transformation set implemented over structured operations, not generic expression equivalence. Preserve assumptions and exclusions (especially nonzero denominators). Mark `valid` only when the operation and preconditions are checked deterministically; return `unknown` or `unsupported` otherwise. Do not use Math.js simplification as proof.
7. Bound input length, AST depth/node count, simplification steps, wall time, graph samples and tutor context. Keep parsing and graph computation local; do not add Python, SymPy, Pyodide, a model call, or a general-purpose solver.

## Prototype acceptance and review

- Persist and reload linked equation/graph state with bounded Math.js AST JSON through the existing canvas document path; parameter edits update the same graph deterministically.
- Keep object IDs, board revision, assumptions and domain restrictions with the mathematical state. Expose state to the Tutor and route proposed edits through validation and the existing user approval flow.
- Test valid, invalid, unknown and unsupported steps, including division by zero/domain-loss cases; never certify a sampled equivalence as proof.
- Test coexistence with Quickdraw selection, movement, zoom and save/load. Measure initial and lazy-loaded bundle size, update latency and bounded computation cost before accepting MathLive.
- MathLive 0.111.4 is the only package trial; keep it only if local input, compatibility, security and bundle gates pass. Compute Engine is deferred. The npm audit endpoint was unreachable and the whole-tree warning could not be attributed to MathLive, so no automatic audit fix was run.

## Verification record

- `npm ci` restored the two missing ESM entrypoints. `npm pack --dry-run` confirmed `ai@6.0.325` and `@copilotkit/react-core@1.85.0` both publish the referenced `.mjs` files. The prior failure was an incomplete local `node_modules` install, not a required build step or application-source regression.
- Default sandbox TCP connect to `127.0.0.1:5183` returns `EACCES`; an ephemeral loopback port works, and the same browser gate passed with local-network access. This is a test-environment restriction; no application workaround was added.
- MathLive Chromium tests passed: full canvas equation/graph save-reload and Quickdraw coexistence (1/1), plus fraction/root/exponent/malformed-input and keyboard entry through Math.js (1/1). Synthetic course/canvas data only; no model or Groq calls.
- Focused workspace/proposal/canvas/expression tests passed (31/31). The full deterministic suite passed (159/159). `npm run build` passed TypeScript and Vite.
- The full production build emitted MathLive as a separate lazy chunk (826.77 kB raw / 229.60 kB gzip); the main index chunk was 3,092.70 kB raw / 883.43 kB gzip. A warmed 121-point graph update benchmark over 50 edits measured p50 0.073 ms, p95 0.096 ms, max 0.129 ms; this excludes UI rendering and persistence latency.
- `npm audit` reported 45 advisories across the lockfile (6 low, 10 moderate, 25 high, 4 critical); it reported no MathLive advisory. No automatic audit fixes were applied; non-MathLive advisories remain outside this prototype's scope.
- Integration remains separate: `server/agent.ts` overlaps Tutor Reliability and other dirty integration branches; `CanvasStudio.tsx` overlaps canvas fusion branches; `src/canvas/tutor.ts` and `src/canvas/ai/canvas-context.ts` also overlap dependency-validation work. Commit this prototype only to its isolated branch; do not merge it into those worktrees.
