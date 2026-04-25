# port-maintenance-workflow-to-yaml

## What

Add a `maintenance` subcommand to the strict CLI that reads a maintenance config YAML, runs configured repository checks, generates a strict YAML maintenance change under `.strict-spec-driven/changes/`, and archives the resulting change when all tasks complete. Implement a `roadmap-sync-check` check type as the first supported check. Add automated tests covering the full maintenance lifecycle. Wire the `strict-spec-maintenance` skill to the new `maintenance` subcommand.

## Why

The last unimplemented operational surface in milestone 06 is maintenance. Ship and installation are already done. Until `maintenance` exists, the strict workflow has no automated path for seeding periodic housekeeping changes from configured checks. Writing accurate user documentation also depends on this command being finalized first.

## Scope

In scope:
- `strict-spec-driven maintenance` CLI subcommand that reads `.strict-spec-driven/config.yaml` for a `maintenance` section listing configured checks.
- Maintenance config YAML schema and scaffold template entry (maintenance section in config.yaml or a separate `maintenance.yaml`).
- `roadmap-sync-check` as the first supported check type: runs `roadmap-sync` and reports any mismatch diagnostics.
- Generation of a strict maintenance change under `.strict-spec-driven/changes/` with proposal, design, tasks, and questions artifacts seeded from check results.
- Archive flow: `maintenance` archives the generated change after verifying it is complete.
- Structured JSON output from `maintenance` describing check outcomes and generated change name.
- Automated tests covering: config parsing, check execution, change generation, archive flow, and failure diagnostics.
- Update `strict-spec-maintenance/SKILL.md` to reference `node {{SKILL_DIR}}/scripts/strict-spec-driven.js maintenance` as its primary command.

Out of scope:
- Additional check types beyond `roadmap-sync-check`.
- CI integration or scheduled invocation.
- User-facing documentation (covered by `write-strict-user-documentation`).
- Changes to existing lifecycle commands (propose, apply, verify, archive, ship).

## Unchanged Behavior

- All existing CLI subcommands (`propose`, `apply`, `verify`, `archive`, `review`, `list`, `modify`, `cancel`, `ship`, `roadmap-status`, `roadmap-sync`, `validate-skills`, `verify-spec-mappings`, `migrate`) must continue to behave as before.
- Existing strict skill packages other than `strict-spec-maintenance` must not be modified.
- The `.strict-spec-driven/` workflow state of any existing change must not be altered by a `maintenance` run unless the maintenance change itself is the named active change.
