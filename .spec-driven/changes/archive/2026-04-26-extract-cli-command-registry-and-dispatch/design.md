# Design: extract-cli-command-registry-and-dispatch

## Approach

- Introduce focused CLI registry modules that own subcommand registration and
  expose the command table consumed by the existing entrypoint helpers.
- Keep the current command implementations behaviorally intact, moving only the
  registration and command-table assembly responsibilities needed to make
  `src/strict-spec-cli.ts` thinner.
- Extend current CLI regression coverage around usage rendering and successful
  subcommand dispatch so the extracted registry layer is proven against the
  existing command contract.

## Key Decisions

- Limit this change to command registration and command-table ownership instead
  of mixing it with handler-by-domain extraction. That preserves milestone 07's
  intended decomposition order.
- Preserve current registration order as an explicit requirement because usage
  rendering is based on the command table's key order today.
- Treat this proposal as behavior-preserving internal modularization, so the
  delta spec directory can stay empty unless implementation uncovers a real
  observable CLI contract change.

## Alternatives Considered

- Start with `extract-cli-change-discovery-and-status`. Rejected because helper
  extraction still leaves the monolithic script owning the core command table
  and dispatch wiring.
- Jump directly to `extract-cli-command-handlers-by-domain`. Rejected because
  registry extraction is the cleaner intermediate seam before moving handler
  implementations into domain modules.
- Finish `prove-todo-project-suite-repeatability` first. Rejected for this
  recommendation because the chosen optimization goal is dependency order and
  architectural sequencing within milestone 07.
