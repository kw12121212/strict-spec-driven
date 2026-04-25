# port-ship-workflow-to-strict

## What

Add a `ship` CLI subcommand to `strict-spec-driven` that validates a named archived change exists, reads its proposal summary, snapshots current roadmap state, and emits structured JSON. Replace the `strict-spec-ship/SKILL.md` stub with full workflow instructions that use this command output to guide the operator through constructing a focused git commit and documenting the push handoff. Add automated skill content validation checks for the ship skill.

## Why

The strict workflow lifecycle ends at `archive`. There is no validated surface for converting an archived change into a focused git commit. The `strict-spec-ship/SKILL.md` is currently a stub with no workflow instructions, so operators have no consistent ship path. This change closes the lifecycle loop: CLI provides deterministic verification and structured output; the skill prompt constructs the commit message and hands off push to the operator.

## Scope

In scope:
- `ship` CLI subcommand: resolves the named archived change, reads proposal summary, runs roadmap-status, emits structured JSON (`changeName`, `archivePath`, `proposalSummary`, `roadmapSnapshot`)
- `strict-spec-ship/SKILL.md`: full workflow instructions replacing the current stub — run `ship <name>`, use JSON output to construct a focused commit message, run `git add` and `git commit`, display `git push` for operator review
- Automated skill content validation check for `strict-spec-ship` in existing skills validation infrastructure
- Delta spec requirements added to `cli/foundation.md` and `contracts/yaml-artifacts.md`

Out of scope:
- Automated `git push` — operator handles push with documented commands after reviewing the commit
- Maintenance workflow (`port-maintenance-workflow-to-yaml`)
- User documentation (`write-strict-user-documentation`)
- Changes to any other CLI subcommand or SKILL.md file

## Unchanged Behavior

- All existing CLI subcommands: init, propose, apply, verify, archive, list, modify, cancel, review, migrate, roadmap-status, roadmap-sync, verify-spec-mappings, validate-skills
- Installation scripts (`install.sh`)
- All other SKILL.md files
