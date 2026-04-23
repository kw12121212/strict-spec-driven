# port-propose-to-yaml

## What

- Implement a strict `propose` subcommand that scaffolds YAML change artifacts
  under `.strict-spec-driven/changes/<name>/`.
- Generate `proposal.yaml`, `design.yaml`, `tasks.yaml`, and `questions.yaml`
  from strict templates, plus a `specs/` directory for mirrored YAML deltas.
- Enforce change-name validation and existing-change protection so scaffolding
  is deterministic and non-destructive.
- Emit clear command output that lists generated artifact paths.
- Rename the CLI entry source filename from `src/index.ts` to
  `src/strict-spec-cli.ts` (compiled as `dist/strict-spec-cli.js`) and update
  local references to keep command
  wiring explicit.

## Why

Milestone 03 begins the core strict lifecycle. `port-propose-to-yaml` is the
first dependency for the rest of the workflow because `apply`, `verify`, and
`archive` all depend on predictable strict change artifact structure.

## Scope

In scope:
- add strict CLI command behavior for `propose`
- create strict YAML change artifact templates for proposal/design/tasks/questions
- scaffold strict change directories under `.strict-spec-driven/changes/`
- validate kebab-case change names and reject duplicates before writing files
- define observable CLI propose behavior in delta specs
- rename the CLI entry source filename to `src/strict-spec-cli.ts` and update
  affected imports/references

Out of scope:
- implementing `apply`, `verify`, `archive`, `review`, `list`, `modify`, or
  `cancel` for strict YAML changes
- strict roadmap command migration and roadmap YAML generation
- migration from legacy `.spec-driven/` Markdown artifacts

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- Existing strict `init` behavior and scaffold asset handling remain unchanged.
- Existing unknown-subcommand and no-argument CLI failure behavior remains
  unchanged.
- Existing `.spec-driven/` bootstrap workflow state remains untouched.
