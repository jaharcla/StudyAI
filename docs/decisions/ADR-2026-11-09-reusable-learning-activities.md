# ADR: Reusable learning activities

Status: accepted for the isolated `work/reusable-learning-system-foundation-20261109` branch.

## Context

StudyAI already has course-scoped document retrieval, versioned scientific canvas objects, revision-checked canvas persistence, a source-grounded Tutor, and BKT/FSRS review. The missing piece is a common activity lifecycle that binds these systems together without making the Tutor or persistence layer know about a subject.

## Decision

1. Store immutable, versioned activity specifications, attempts, attempt events, and learning evidence in the existing SQLite database. Validate all stored and submitted data with the existing Zod dependency. `schemaVersion` versions the contract; `activityVersion` versions an authored activity.
2. Keep specifications data-only. Resolve artifact and checker capability IDs through a small server registry. Each adapter validates its own configuration, creates existing `ScientificObject` values, validates the learner-edited values, and performs deterministic checks. The runtime only resolves capabilities and runs the shared lifecycle.
3. Resolve every activity source reference against document chunks in the requested course. Validate course and lesson ownership again on every API operation. Start activities on a newly created canvas through the existing revision-safe persistence service; never replace the learner's current board.
4. Record checker outcomes as `correct`, `incorrect`, `unknown`, or `unsupported`. Only explicit deterministic assessment policies may emit mastery evidence. Reuse the existing BKT update function and let the existing review service consider that evidence when selecting questions. Leave FSRS scheduling and user ratings unchanged.
5. Provide the Tutor a generic, server-validated projection of the active objective, source, task, artifact objects, canvas revision, and latest checker evidence. Treat model explanations and edit proposals as assistance; the existing user-approved canvas edit path remains authoritative.
6. Provide an internal JSON authoring and preview panel. Saved JSON goes through the same contract, capability, scope, and source validation path used at runtime; a future AI compiler will produce the same format.

## Reuse and alternatives

- Reuse the current `better-sqlite3` store, course-scoped document chunks/FTS5 retrieval, `saveCanvasDocument`, `CanvasDocument`/`ScientificObject`, QuickDraw canvas, `compileExpression`, Zod, `LearningService`, BKT, and `ts-fsrs`. No dependency is added.
- Matter.js 0.20.0 is MIT licensed and provides 2D rigid-body simulation. It is not needed for the bounded 1D force/acceleration relationships in this milestone and would add a second numerical authority. [Upstream repository](https://github.com/liabru/matter-js).
- Rapier is an Apache-2.0 2D/3D physics engine. Its official JavaScript bindings moved into the main repository's `typescript` directory, and the old bindings repository was archived on July 12, 2026. A general solver is unnecessary for these analytical activities; reconsider only for a demonstrated collision/constraint simulation requirement. [Rapier](https://github.com/dimforge/rapier) · [JavaScript bindings and migration status](https://github.com/dimforge/rapier.js).
- H5P's PHP library is GPL-3.0 and targets reusable hosted content. It is not the activity or canvas authority here; adopting it would introduce a second content runtime and would not provide StudyAI's structured-object revision checks. [Upstream repository](https://github.com/h5p/h5p-php-library).

## Limits

The force activity is an educational equation-based model, not a general physics simulation. Graph checking is limited to operations the bounded expression engine can evaluate. Ambiguous, out-of-domain, or unsupported inputs remain `unknown`/`unsupported` and cannot update mastery. Activity version migration is explicit; unknown future schema versions are rejected rather than guessed.

## Verification baseline

Before implementation, the isolated worktree at `f1f7600` passed `npm run build` and the full deterministic unit suite (29 files, 159 tests). The local HTTP test required approval-reviewed execution because loopback connections are denied by the default sandbox.
