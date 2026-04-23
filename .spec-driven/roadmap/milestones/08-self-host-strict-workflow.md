# 08 Self Host Strict Workflow

## Goal
Move this repository's own workflow state from bootstrap `.spec-driven/` Markdown artifacts to `.strict-spec-driven/` YAML artifacts after the strict workflow and migration tooling are ready.

## In Scope
- Run the strict migration tooling against this repository's bootstrap `.spec-driven/` directory.
- Produce the actual self-hosted `.strict-spec-driven/` workflow state, validation logs, updated repository guidance, and an explicit bootstrap retirement decision.
- Review generated `.strict-spec-driven/` YAML artifacts for schema validity and semantic parity.
- Switch repository guidance to use `strict-spec-*` and `strict-roadmap-*` workflows for future work.
- Retire bootstrap `.spec-driven/` usage once the strict workflow can maintain itself.
- Validate that active changes, roadmap milestone numbering, specs index state, config rules, and archived history are preserved or explicitly documented after migration.
- Update bootstrap references in README, AGENTS, RTK, and workflow examples only after strict validation succeeds.

## Out of Scope
- Reworking the already accepted roadmap shape solely because it began under `.spec-driven/`.
- Converting `SKILL.md` packaging files to YAML.
- Converting general repository docs unless a separate documentation decision requires it.
- Shipping strict workflow changes to external projects before this repository can validate and maintain its own state.

## Done Criteria
- This repository has a valid `.strict-spec-driven/` workflow state generated from the bootstrap `.spec-driven/` artifacts.
- The strict validation commands pass against the self-hosted YAML workflow state.
- Agent instructions and README references prefer strict workflow names and `.strict-spec-driven/`.
- Legacy `.spec-driven/` is preserved, archived, or removed according to an explicit documented decision.
- The self-hosted roadmap retains the numbered milestone order and all planned change references.
- Future changes can be proposed, applied, verified, archived, and reconciled using only strict workflow commands.

## Planned Changes
- `migrate-repo-workflow-to-strict` - Declared: planned - run the migration command to convert this repository's bootstrap `.spec-driven/` roadmap, specs, config, active changes, and archived changes into actual `.strict-spec-driven/` YAML artifacts.
- `verify-self-hosted-strict-state` - Declared: planned - run strict validation commands on the generated `.strict-spec-driven/` state, save or summarize validation output, and fix schema, reference, roadmap, or semantic issues.
- `update-repo-guidance-for-strict-workflow` - Declared: planned - update README, AGENTS, RTK, and workflow examples to prefer `strict-spec-*`, `strict-roadmap-*`, and `.strict-spec-driven/` once strict commands can maintain the state.
- `decide-bootstrap-directory-retirement` - Declared: planned - document whether the old `.spec-driven/` bootstrap state is preserved, archived, or removed after strict self-hosting works, including exact follow-up commands or manual steps.

## Dependencies
- `06-migration-tooling` must provide a safe migration command and migration skill.
- `07-strict-operations-and-documentation` should provide installable skills, validation, and accurate strict workflow documentation before self-hosting.
- `04-strict-spec-skills` and `05-strict-roadmap-workflow` should provide usable strict workflows before self-hosting.
- `03-core-yaml-workflow` must support the full propose through archive lifecycle before repository guidance switches.

## Risks
- Self-hosting too early could strand the repository in a workflow state that strict tools cannot yet maintain.
- Removing `.spec-driven/` without a documented decision could lose useful bootstrap history.
- Documentation could advertise strict commands before installation and validation are reliable.
- Divergence between bootstrap `.spec-driven/` and migrated `.strict-spec-driven/` could hide incomplete active changes if migration reports are not reviewed.

## Status
- Declared: proposed

## Notes
- This is intentionally late in the roadmap; the current bootstrap `.spec-driven/` roadmap remains acceptable until strict migration is available.
- Self-hosting planned changes must produce actual migrated state, validation evidence, guidance edits, or a documented retirement decision; do not close them with roadmap/spec text alone.
- The current active `define-yaml-artifact-schemas` change should either be archived before self-hosting or migrated with an explicit active-change status.
- This milestone is the point where strict workflow dogfooding replaces bootstrap roadmap maintenance.
- Bootstrap period archived changes accumulated under `.spec-driven/` between M03 and M08 are first-class migration test fixtures; the migration command should treat them as a realistic test of archive date prefix handling and roadmap reconciliation rather than a problem to work around.
