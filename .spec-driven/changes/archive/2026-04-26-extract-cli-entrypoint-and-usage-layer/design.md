# Design: extract-cli-entrypoint-and-usage-layer

## Approach

- Introduce focused CLI entry modules responsible only for normalizing argv,
  rendering usage text, and converting top-level command results into final
  process exit behavior.
- Keep the existing command table and command implementations behaviorally
  intact in this change, moving only the entry-facing code needed to make the
  `run()` path and executable bootstrap in `src/strict-spec-cli.ts` thin.
- Extend current CLI regression coverage around no-arg invocation, unknown
  subcommands, and successful dispatch so the refactor is proven against the
  existing command contract.

## Key Decisions

- Limit this change to entrypoint concerns instead of mixing it with command
  registry or dispatch extraction. That keeps the first milestone-07 slice small
  and preserves the intended decomposition order.
- Treat this proposal as behavior-preserving internal modularization, so the
  delta spec directory can stay empty unless implementation uncovers a real
  observable CLI contract change.
- Preserve the current command inventory and usage-text behavior as the source
  of truth during extraction to avoid accidental surface drift in the first CLI
  split.

## Alternatives Considered

- Start with `extract-cli-command-registry-and-dispatch`. Rejected because
  registry extraction is cleaner after the entrypoint layer stops owning top-
  level usage and exit handling.
- Finish `prove-todo-project-suite-repeatability` first. Rejected for this
  recommendation because the optimization goal is dependency order, and
  milestone 08 is directly downstream of milestone 07.
- Skip straight to `split-roadmap-load-validate-derive-sync`. Rejected because
  milestone 08 explicitly depends on milestone 07.
