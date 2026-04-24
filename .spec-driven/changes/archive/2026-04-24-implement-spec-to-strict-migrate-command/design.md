# Design: implement-spec-to-strict-migrate-command

## Approach

Implement the migration command in four passes:

1. Add CLI routing and preflight behavior
- extend the strict CLI with a `migrate` subcommand entrypoint
- inspect legacy `.spec-driven/` source presence, strict target state, and
  overwrite policy before any write occurs
- fail deterministically when the migration cannot proceed safely

2. Define migration execution and report aggregation
- execute migration as a command-level orchestration flow rather than as ad hoc
  one-off scripts
- collect converted files, skipped files, warnings, errors, and manual
  follow-up items into one structured report
- preserve repo-relative source references so follow-up work stays actionable

3. Keep converter boundaries explicit
- let this change own orchestration, preflight checks, overwrite protection, and
  the report envelope
- keep artifact-specific Markdown parsing and field mapping in later conversion
  changes so this proposal does not absorb core-workflow or roadmap conversion
  scope

4. Add regression coverage
- exercise successful migration command execution against supported fixtures
- cover missing source, malformed input, and unsafe target conflicts
- verify the command leaves legacy source artifacts untouched by default and
  emits deterministic report structure

## Key Decisions

- Keep the migration command and report envelope together in one change. The
  roadmap item explicitly owns orchestration, preflight checks, overwrite
  policy, and reporting, and splitting those pieces would blur the dependency
  boundary for later converter work.
- Default to preserving legacy `.spec-driven/` inputs and rejecting unsafe
  target overwrites. Safe migration needs a non-destructive default before this
  repository can attempt self-hosting on generated strict state.
- Treat the structured migration report as a first-class output of the command.
  Migration success is not only about written files; the operator also needs a
  deterministic account of skips, warnings, errors, and manual follow-up items.
- Keep artifact-specific field mapping out of this change. Converter modules for
  specs, roadmap state, and archived changes remain separate roadmap items so
  the proposal stays aligned with milestone guardrails.

## Alternatives Considered

- Start with `convert-core-workflow-artifacts-to-yaml`.
  Rejected because it creates converter logic before the canonical migration
  command, preflight policy, and report envelope exist.
- Start with `convert-roadmap-and-project-state-to-yaml`.
  Rejected for the same reason: it is a narrower converter slice that fits
  better behind a real migration entrypoint.
- Combine the migration command with `add-strict-spec-migrate-skill`.
  Rejected because the skill should document and drive an implemented command,
  not invent command behavior while the CLI surface is still missing.
- Jump directly to `self-host-repo-on-strict-workflow`.
  Rejected because self-hosting depends on credible migration behavior, not just
  milestone intent.
