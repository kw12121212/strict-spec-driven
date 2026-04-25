# Tasks: extract-cli-command-registry-and-dispatch

## Implementation

- [x] Extract command inventory and subcommand registration from
      `src/strict-spec-cli.ts` into focused CLI router or registry modules while
      preserving the current subcommand-to-handler bindings and registration
      order.
- [x] Update `src/strict-spec-cli.ts` and the CLI entry wiring to consume the
      extracted command table without changing usage behavior, dispatch results,
      or exit codes.
- [x] Add or update CLI regression coverage for no-arg invocation, unknown
      subcommands, command listing order, and representative dispatched
      subcommands after registry extraction.

## Testing

- [x] Run `bun run build` — build validation for the extracted CLI registry and
      dispatch wiring.
- [x] Run `bun test/run.ts` — unit tests covering preserved usage text,
      registration order, and subcommand dispatch behavior.

## Verification

- [x] Verify implementation matches proposal scope and does not absorb later
      helper extraction, handler-by-domain refactors, or milestone 08 domain
      decomposition work.
