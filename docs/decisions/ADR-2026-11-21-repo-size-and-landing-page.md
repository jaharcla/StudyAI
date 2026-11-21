# ADR-2026-11-21: Repo size and landing page

## Context

The local checkout appeared to be ~1.6 GB and the GitHub landing page (`README.md`) read like an internal runbook.

Investigation:

- A fresh clone downloads only reachable objects: **~49 MB** (measured with `git bundle create --all`). Contributors were never downloading 1.6 GB.
- The local working tree holds **28 gitignored upstream source `.zip` archives totaling 1.68 GB** (`/*.zip` in `.gitignore`). These are local reference downloads, not project sources.
- The object store contains **639 unreachable blobs totaling 1.68 GB** — abandoned copies of those archives, reachable from no ref or reflog.
- Reachable history contains 14 of the archives (~49 MB compressed).
- The repo has **27 worktrees** on their own branches.

## Decision

1. **Do not rewrite git history.** Purging the 14 archived zips from reachable history would rewrite refs under every worktree branch for a ~49 MB gain. That fails the "do not screw anything up" constraint.
2. **Prune unreachable objects locally** with `git gc --prune=now`. They are unreachable from all refs and reflogs, so this frees ~1.68 GB without changing any commit.
3. **Leave the 28 local `.zip` files alone.** They are the owner's reference material and are already gitignored; deleting them is a separate, explicit request.
4. **Rebuild `README.md` as a real landing page** — feature-led, short quick start, explicit privacy note, docs links. Move provider/config detail into `docs/CONFIGURATION.md` rather than deleting it.
5. **Add a repository-size note to `CONTRIBUTING.md`** so contributors know a clone is small and archives must stay local.

## Alternatives considered

- **History rewrite with `git filter-repo`/`filter-branch`:** rejected — high blast radius across 28 worktrees, negligible clone-size benefit.
- **Shallow-clone guidance only:** rejected as the primary fix — unnecessary, since a full clone is already ~49 MB.

## Verification

- `git fsck --unreachable` count and size before/after pruning.
- `git bundle create --all` size as the clone-size proxy.
- Markdown links in `README.md` and `CONTRIBUTING.md` resolved against the tree.
