# Tasks: extract-cli-entrypoint-and-usage-layer

## Implementation

- [x] Extract argv normalization, usage rendering, and top-level exit handling
      from `src/strict-spec-cli.ts` into focused CLI entry modules while keeping
      the current command table intact.
- [x] Reduce the `run()` path and executable bootstrap in
      `src/strict-spec-cli.ts` to a thin delegation layer without changing
      command names, usage text, or exit-code behavior.
- [x] Add or update CLI regression coverage for no-arg invocation, unknown
      subcommands, and successful command dispatch through the extracted entry
      layer.

## Testing

- [x] Run `bun run build` — build validation for the extracted CLI entry modules
      and thin entrypoint wiring.
- [x] Run `bun test/run.ts` — unit tests covering no-arg usage, unknown
      subcommands, and preserved command dispatch behavior.

## Verification

- [x] Verify implementation matches proposal scope and does not absorb later
      registry, handler, or workflow-domain refactors.
