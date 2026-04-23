# Self Host Strict Workflow

## Goal
Move this repository's own workflow state from bootstrap `.spec-driven/` Markdown artifacts to `.strict-spec-driven/` YAML artifacts after the strict workflow and migration tooling are ready.

## In Scope
- Run the strict migration tooling against this repository's bootstrap `.spec-driven/` directory.
- Review generated `.strict-spec-driven/` YAML artifacts for schema validity and semantic parity.
- Switch repository guidance to use `strict-spec-*` and `strict-roadmap-*` workflows for future work.
- Retire bootstrap `.spec-driven/` usage once the strict workflow can maintain itself.

## Out of Scope
- Reworking the already accepted roadmap shape solely because it began under `.spec-driven/`.
- Converting `SKILL.md` packaging files to YAML.
- Converting general repository docs unless a separate documentation decision requires it.

## Done Criteria
- This repository has a valid `.strict-spec-driven/` workflow state generated from the bootstrap `.spec-driven/` artifacts.
- The strict validation commands pass against the self-hosted YAML workflow state.
- Agent instructions and README references prefer strict workflow names and `.strict-spec-driven/`.
- Legacy `.spec-driven/` is preserved, archived, or removed according to an explicit documented decision.

## Planned Changes
- `migrate-repo-workflow-to-strict` - Declared: planned - use the migration command to convert this repository's bootstrap `.spec-driven/` roadmap, specs, config, and changes into `.strict-spec-driven/` YAML artifacts.
- `verify-self-hosted-strict-state` - Declared: planned - run strict validation on the generated `.strict-spec-driven/` state and fix schema or semantic issues.
- `update-repo-guidance-for-strict-workflow` - Declared: planned - update README and agent instructions to prefer `strict-spec-*`, `strict-roadmap-*`, and `.strict-spec-driven/`.
- `decide-bootstrap-directory-retirement` - Declared: planned - document whether the old `.spec-driven/` bootstrap state is preserved, archived, or removed after strict self-hosting works.

## Dependencies
- `migration-tooling` must provide a safe migration command and migration skill.
- `strict-spec-skills` and `strict-roadmap-workflow` should provide usable strict workflows before self-hosting.

## Risks
- Self-hosting too early could strand the repository in a workflow state that strict tools cannot yet maintain.
- Removing `.spec-driven/` without a documented decision could lose useful bootstrap history.

## Status
- Declared: proposed

## Notes
- This is intentionally late in the roadmap; the current bootstrap `.spec-driven/` roadmap remains acceptable until strict migration is available.
