# Next steps

The previous list referred to a pre-merge coordinator branch. The integrated source is now on `main`; those approval and merge steps are no longer current.

1. Run `npm ci` against the current lockfile before relying on the local dependency tree.
2. Run `npm run build` and `npm test`, recording the exact commit and environment.
3. Run targeted Playwright flows if browser verification is needed; keep mocked-provider results separate from live external requests.
4. Update [STATUS.md](STATUS.md) and [INTEGRATION_VERIFICATION.md](INTEGRATION_VERIFICATION.md) with any new verification results.
