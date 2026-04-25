# extract-cli-entrypoint-and-usage-layer

## What

- Split top-level CLI entry responsibilities out of `src/strict-spec-cli.ts`
  into focused entry modules for argv normalization, usage rendering, and final
  exit or error handling.
- Leave command registration, command implementations, and output contracts
  behaviorally unchanged in this first slice of milestone 07.
- Reduce the `run()` and executable bootstrap path in `src/strict-spec-cli.ts`
  to a thin orchestration layer that wires the existing command surface into the
  extracted entry helpers.

## Why

Milestone 08 is downstream of milestone 07, so the dependency-ordered next move
is to create a clean entry boundary in the current CLI hotspot before attempting
deeper domain-module work. Today `src/strict-spec-cli.ts` is about 1093 lines
and mixes bootstrap, usage text, dispatch, command handlers, filesystem
helpers, and spec-mapping audit logic in one file.

Extracting the entrypoint and usage layer first creates a stable seam for later
command-registry, helper, and domain-handler changes while keeping this proposal
small enough to review as a behavior-preserving refactor.

## Scope

In scope:
- Extract argv normalization, unknown-command or no-arg usage handling, and
  top-level exit behavior into focused CLI entry modules.
- Keep `src/strict-spec-cli.ts` as the current command module while delegating
  its entrypoint-only responsibilities to the extracted helpers.
- Add or update regression coverage needed to prove usage hints, exit codes, and
  command invocation behavior stay unchanged after the extraction.

Out of scope:
- Reorganizing command handlers, roadmap helpers, change discovery, or
  spec-mapping audit logic; those belong to later milestone 07 changes.
- Changing command names, flags, JSON output, stderr text contracts, or
  workflow semantics.
- Starting milestone 08 decomposition work in `src/roadmap.ts`, `src/skills.ts`,
  or `src/migrate.ts`.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- `strict-spec-driven` with no args or an unknown subcommand still exits
  non-zero and writes usage guidance to stderr.
- Existing commands continue to receive the same subcommand argv and preserve
  their current stdout, stderr, JSON, and exit-code behavior.
- The repository build and test commands remain `bun run build` and
  `bun test/run.ts`.
