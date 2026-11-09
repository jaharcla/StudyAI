# ADR: Mathematical workspace prototype

Status: accepted for a bounded prototype; reassess after verification.

## Current implementation

At `4e9b12b`, StudyAI already has a persistent `ScientificObject` model and revisioned `CanvasDocument`; equation objects store an expression, variable values and result, while graph objects store an expression, range and sampled points. `src/canvas/expressions.ts` lazily loads Math.js 15.2.0 with an AST allowlist and samples 120 graph points. `SceneGlyph.tsx` renders/traces graphs in SVG. Quickdraw remains a separate drawing layer. `server/agent.ts` gives the Tutor structured objects, validated canvas proposals and deterministic science tools; it does not yet have a linked editable math workspace or step verifier.

The independent research snapshot predates this implementation. Its claims that StudyAI has no Math.js integration, graphing, structured math objects or deterministic Tutor tools are stale. The gap it correctly identified is the missing shared, editable expression state connecting notation, parameters, graph and checked steps. Handwriting marks remain uninterpreted unless a separately validated analysis result supplies evidence.

## Decisions

1. Extend the existing canvas persistence and object identity/revision path. Do not create a second board store or replace Quickdraw. Keep legacy equation/graph objects readable.
2. Trial MathLive **0.111.4** (MIT) for local editable notation. Load it only when the workspace opens. Its React guide documents the `<math-field>` custom element; its current releases include fixes for untrusted text rendering. Use no CDN at runtime. [React integration](https://mathlive.io/mathlive/guides/react/) · [license and release history](https://github.com/arnog/mathlive)
3. Trial `@cortex-js/compute-engine` **0.184.0** (MIT) as the parser/MathJSON and bounded symbolic layer for the new math object. MathLive no longer supplies Compute Engine as a dependency, so declare it directly. It is actively maintained but pre-1.0 and releases frequently; pin it and isolate it behind a small adapter. [MathJSON](https://mathlive.io/math-json/) · [Compute Engine](https://github.com/cortex-js/compute-engine) · [license](https://github.com/cortex-js/compute-engine/blob/main/LICENSE)
4. Retain Math.js 15.2.0 for existing numeric equations, graphs and Tutor calculations. Do not expand its accepted AST or treat arbitrary model text as executable input. The two engines have distinct temporary roles: MathJSON is authoritative for new workspace expressions; Math.js remains the compatibility engine for current objects.
5. Reuse the existing SVG graph and canvas scene for 2D function plots. Do not add Mafs or JSXGraph for this slice: StudyAI already renders and traces sampled function graphs, and replacing/integrating a second visual layer would add ownership and bundle cost without enabling the required linked parameter demo. JSXGraph remains a candidate if constrained geometric constructions become a demonstrated need; it is dual licensed MIT/LGPL. [JSXGraph scope and license](https://jsxgraph.org/docs/)
6. Use only an explicit, small transformation set. Preserve assumptions and exclusions (especially nonzero denominators). A transformation may be labelled `valid` only when its operation and preconditions are checked deterministically. Compute Engine's `isIdenticallyEqual()` can use pseudo-random samples; a `true` result alone is not proof. Return `unknown` or `unsupported` when exact verification is unavailable. [comparison semantics](https://mathlive.io/compute-engine/reference/core/) · [assumptions](https://mathlive.io/compute-engine/guides/assumptions/)
7. Bound input length, AST depth/node count, simplification steps, wall time, graph samples and tutor context. Keep parsing and graph computation local; do not add Python, SymPy, Pyodide, a model call, or a general-purpose solver.

## Prototype acceptance and review

- Persist and reload a linked equation/graph state through the existing canvas document path; parameter edits update the same graph deterministically.
- Keep object IDs, board revision, assumptions and domain restrictions with the mathematical state. Expose state to the Tutor and route proposed edits through validation and the existing user approval flow.
- Test valid, invalid, unknown and unsupported steps, including division by zero/domain-loss cases; never certify a sampled equivalence as proof.
- Test coexistence with Quickdraw selection, movement, zoom and save/load. Measure initial and lazy-loaded bundle size, update latency and bounded computation cost before accepting either dependency.
- No package has been added yet. If either library fails compatibility, security or resource gates, keep the dependency out and report the blocker.
