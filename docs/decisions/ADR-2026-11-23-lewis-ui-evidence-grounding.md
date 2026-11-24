# ADR: Lewis canvas tools stay deterministic under the course-evidence rule

Date: 2026-11-23
Status: accepted, implemented within this redesign.
Scope: `src/canvas/LewisSidebar.tsx`, `src/canvas/RadialAtomActions.tsx`, `src/canvas/MoleculeInteraction.tsx`, `src/overrides.css`.

## Decision

The Lewis sidebar and radial atom actions contain no model-authored factual content. Every student-facing string in them is fixed UI copy (`Lone pair`, `Bond order`, `Place`, `Connect`, `Inspect`, element names) or a label derived from the molecule's own data. Nothing in these components invokes a tutor model, retrieves course text, or presents model knowledge as a claim.

Scientific values shown on the canvas remain deterministic and authoritative:

- element symbols and labels come from the atom records;
- bond order comes from `moleculeBonds` and the active resonance form;
- formal charge comes from `formalChargeForAtom(atom, bondOrderSum(...))`;
- structure validity stays with `validateWithOpenChemLib`, unchanged by this redesign.

No retrieval path, prompt, provider, or validation rule was changed. The redesign is presentation and interaction only.

## Relation to the standing 99.9% course-evidence rule

Any future student-facing explanation of a Lewis structure must trace to retrieved excerpts from the student's own course material. General chemistry knowledge introduced by a model must be explicitly labelled as general knowledge. When no course evidence supports a statement, the product must say so instead of inventing an answer. A model must never compute or override bond order, formal charge, or structure validity; those stay with the deterministic tools named above.

## Limits / handoff

This ADR does not implement tutor-side enforcement of the 99.9% rule. Retrieval policy, citation rendering, and missing-evidence wording belong to the tutor owner and are outside this UI change. No such enforcement is claimed here.

## Verification

`tsc -b`: no errors. Lewis e2e specs (`lewis-redesign`, `lewis-sidebar`, `radial-atom-actions`, `direct-molecule`, `notebook-editor`) pass; `direct-molecule` still asserts the deterministic OpenChemLib SMILES result `O=C=O` and saved bond IDs after reload.
