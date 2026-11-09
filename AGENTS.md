# Engineering reuse policy

- Before substantial work, inspect the current code, types, interfaces, and assigned file owners for reusable functionality.
- Research maintained upstream projects and official documentation before choosing to build or add a dependency.
- Compare correctness, maintenance, license obligations, security, performance, and compatibility with StudyAI's local-first architecture.
- Prefer adapting existing code and pinned dependencies. Do not create overlapping authorities or add a dependency without a demonstrated capability gap.
- Record significant reuse-versus-build decisions in a concise ADR before implementation, including alternatives, exact versions/licenses, limits, and verification.
- Bound untrusted expressions, model output, memory, and runtime. Keep calculations deterministic where possible and preserve user data and worktree ownership.

These rules apply to all StudyAI agents, research, implementations, and future phases.
