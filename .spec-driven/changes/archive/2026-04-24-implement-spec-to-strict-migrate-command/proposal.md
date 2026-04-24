# implement-spec-to-strict-migrate-command

## What

Implement the first strict migration command so the repository can convert
supported legacy `.spec-driven/` workflow artifacts into guarded
`.strict-spec-driven/` YAML output through a real CLI surface instead of roadmap
notes alone.

This change will:

- add `strict-spec-driven migrate` command routing and execution entrypoints
- perform preflight checks for readable legacy source state, target-directory
  safety, and overwrite-protection failures before writing strict output
- produce a structured migration report that records converted files, skipped
  files, warnings, errors, and manual follow-up items with source references
- keep legacy `.spec-driven/` artifacts untouched by default while writing the
  strict result under `.strict-spec-driven/`
- add automated coverage for happy-path migration, preflight failures, unsafe
  target conflicts, and deterministic report output
- establish the orchestration boundary that later artifact-conversion changes
  plug into without absorbing their field-mapping logic

## Why

Milestone 05 starts with migration and self-hosting, and dependency order favors
the migration command first because it creates the command surface, preflight
policy, and report envelope the later converter-specific changes depend on.

Without this change, the roadmap has conversion items but no canonical command
that can safely run them, reject unsafe reruns, or report partial and ambiguous
results in a deterministic way. Landing this proposal next gives the migration
phase a stable entrypoint before the repo attempts artifact-by-artifact
conversion or self-hosting.

## Scope

In scope:

- add strict CLI behavior for a `migrate` subcommand
- define the observable preflight and overwrite-protection behavior for
  bootstrap-to-strict migration runs
- define the structured migration report output expected from the command
- wire migration execution around supported converter hooks and report
  aggregation
- add regression tests for success, conflict, and failure reporting paths

Out of scope:

- implementing every artifact-specific Markdown-to-YAML field mapping owned by
  `convert-core-workflow-artifacts-to-yaml` and
  `convert-roadmap-and-project-state-to-yaml`
- writing the migration skill package owned by `add-strict-spec-migrate-skill`
- running the repository self-hosting cutover or deciding bootstrap retirement
  policy owned by `self-host-repo-on-strict-workflow`
- porting maintenance, ship, packaging, or public documentation work from
  milestone 06

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):

- Bootstrap `.spec-driven/` Markdown artifacts remain the active workflow state
  for this repository until migration and self-hosting are completed.
- Existing strict commands outside the new `migrate` surface keep their current
  behavior and ownership boundaries.
- Migration continues to treat unsupported or ambiguous legacy structures as
  reportable follow-up items rather than guessed strict YAML data.
