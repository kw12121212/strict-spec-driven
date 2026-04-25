# extract-cli-command-registry-and-dispatch

## What

- Extract command inventory and subcommand-to-handler registration out of
  `src/strict-spec-cli.ts` into focused CLI router or registry modules.
- Keep the existing command implementations and workflow behavior intact while
  reducing `src/strict-spec-cli.ts` to a thinner orchestration layer.
- Preserve current command names, argv flow, usage behavior, exit codes, human-
  readable output, and JSON output contracts during the extraction.

## Why

The repository has already completed
`extract-cli-entrypoint-and-usage-layer`, which created `src/cli/argv.ts`,
`src/cli/usage.ts`, and `src/cli/entrypoint.ts`. The next dependency-ordered
step inside milestone 07 is to stop `src/strict-spec-cli.ts` from owning the
full command table directly.

Today `src/strict-spec-cli.ts` still mixes command registration with command
implementations, active-change helpers, archive lookup, and spec-mapping audit
logic. Extracting registry and dispatch ownership next creates a cleaner seam
for later milestone-07 work such as handler decomposition, change-discovery
helper extraction, and output-contract stabilization without jumping ahead into
milestone 08 domain splits.

## Scope

In scope:
- Introduce dedicated CLI registry or router modules that define the command
  table currently assembled inline in `src/strict-spec-cli.ts`.
- Update the executable path so `run()` and the CLI entrypoint consume the
  extracted command table instead of building it inside the monolithic script.
- Add or update regression coverage needed to prove command inventory,
  registration order, usage text, dispatch behavior, and exit-code behavior stay
  unchanged after the extraction.

Out of scope:
- Splitting command handlers into domain-oriented files; that belongs to
  `extract-cli-command-handlers-by-domain`.
- Extracting change discovery, archive matching, or active-status helpers; that
  belongs to `extract-cli-change-discovery-and-status`.
- Reworking CLI output shaping or JSON contracts; that belongs to
  `stabilize-cli-output-contracts`.
- Starting milestone 08 work in `src/roadmap.ts`, `src/skills.ts`, or
  `src/migrate.ts`.

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- `strict-spec-driven` with no args or an unknown subcommand still exits
  non-zero and writes the same usage guidance to stderr.
- Existing subcommands continue to receive the same argv payloads and preserve
  their current stdout, stderr, JSON, and exit-code behavior.
- Command listing order remains stable so usage text and any command-table-based
  assertions do not drift during internal modularization.
- The repository build and test commands remain `bun run build` and
  `bun test/run.ts`.
