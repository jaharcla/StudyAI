# ADR-2026-11-22: Relicense core to plain MIT (open-core)

## Context

On 2026-11-21 the project was licensed under MIT + Commons Clause v1.0, at the author's request, to prevent anyone from selling the software. That made the project *source-available*, not OSI open source, and it blocked participation in open-source communities: r/opensource's New Project Showcase requires an OSI-compatible licence, and GitHub reported the licence as "Other".

On 2026-11-22, after discussing it with Claude, the author decided the restriction is not needed right now. The intended commercial model is open-core: keep the core fully open source, and if a premium offering is built later, ship it as a **separate paid edition** rather than by restricting the core licence. This follows the pattern used by open-core products such as GitLab CE/EE.

## Decision

Remove the Commons Clause from `LICENSE`, leaving the standard MIT licence text. Update the README badge and licence section, all outreach drafts, the design spec, the working brief, and the public landing page to say MIT / fully open source.

No product code changes. Copyright holder remains `jaharcla`, year 2026.

## Alternatives considered

1. **Keep MIT + Commons Clause** — rejected. It blocks open-source communities and contributor discovery, and the author no longer wants the no-sell restriction at this stage.
2. **Dual-licence (MIT + separate commercial licence now)** — deferred. There is no paid edition to license yet; adding one now would create obligations without a product.
3. **AGPL or another copyleft licence** — rejected. It would impose obligations on contributors and on users that the project does not need.
4. **Plain MIT now, separate paid edition later (chosen)** — simplest, removes the discovery blocker now, and preserves the option to build a premium edition later as its own repository/product with its own licence.

## Limits and consequences

- Anyone may now use, modify, distribute, sublicense and sell the core software, subject only to MIT attribution.
- The author keeps ownership of contributions made so far because all of them were made under the same holder; relicensing is possible because the author owns the copyright.
- Future external contributions are accepted under MIT; a later proprietary edition must be built as a separate work, not by re-licensing contributed MIT code.
- The open-core option is a future decision, not a commitment: no premium edition exists, and no timeline is set.
- Outreach messages sent on 2026-11-21 described the old licence. They were accurate when sent and are not being edited; all future drafts use MIT.

## Verification

- `LICENSE` contains only the standard MIT text (Commons Clause section removed).
- `README.md` badge and licence section say MIT.
- `docs/OUTREACH.md`, `docs/superpowers/specs/2026-11-21-collaborator-onboarding-design.md`, and `docs/outreach/**` no longer describe the Commons Clause as current.
- The `gh-pages` landing page no longer describes the project as source-available.
- GitHub licence detection after pushing `LICENSE` to `main` is expected to report MIT instead of "Other"; confirm with `gh api /repos/jaharcla/StudyAI`.
- `npm run verify` (2026-11-22): `tsc -b` pass; 64 unit-test files / 441 tests pass; Playwright 27 passed, 3 skipped, 2 failed (one server-down `ECONNREFUSED` on port 5183, one tutor canvas-proposal timeout). No product code changed in this ADR's scope.
