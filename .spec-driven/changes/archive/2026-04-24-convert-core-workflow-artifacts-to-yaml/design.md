# Design: convert-core-workflow-artifacts-to-yaml

## Approach

Implement the change in four passes:

1. Convert legacy spec artifacts
- parse legacy Markdown main specs and delta specs into the existing strict YAML
  spec and delta models
- preserve stable requirement and scenario identifiers, scenario ordering,
  delta-operation intent, and file-level mapping data where the legacy artifact
  provides them
- write migrated spec artifacts into the strict workflow layout without
  rewriting legacy `.spec-driven/` inputs

2. Convert legacy change artifacts
- walk active and archived legacy change directories under `.spec-driven/changes/`
- convert proposal, design, tasks, and questions artifacts into the
  corresponding strict YAML change artifact families
- preserve task completion state, open versus resolved question state, and
  archived change date prefixes so migrated strict history remains reviewable

3. Integrate converters into the existing migrate orchestration
- register the core-workflow converters inside the current `migrate` command
  rather than building a parallel entrypoint
- emit converted spec and change artifacts through the existing migration report
  categories
- regenerate the strict spec index from migrated main specs while still leaving
  legacy specs-index Markdown content deferred to the project-state converter
- keep roadmap and project-state artifacts deferred so this change stays inside
  its roadmap guardrails

4. Extend fixtures and regression coverage
- add or expand legacy fixtures for spec, delta, active-change, and
  archived-change migration cases
- verify deterministic converted output and report content for newly supported
  core workflow artifacts
- keep unsupported roadmap and project-state shapes visible as deferred follow-up
  items until their dedicated converter change lands

## Key Decisions

- Keep core workflow conversion separate from roadmap and project-state
  conversion. The milestone explicitly splits those responsibilities, and
  combining them would blur the next dependency boundary.
- Preserve legacy identifiers, state markers, and archive-date prefixes instead
  of regenerating them. Self-hosting only becomes credible if migrated strict
  artifacts still represent the same workflow history and reviewable status.
- Reuse the existing `migrate` command and report envelope. The orchestration,
  preflight, and report model already exist, so this change should deepen
  converter coverage rather than invent a second migration surface.
- Convert active and archived change artifacts in the same proposal. They share
  the same artifact families, state-preservation rules, and archive-history
  expectations, so splitting them would add churn without clarifying ownership.

## Alternatives Considered

- Start with `convert-roadmap-and-project-state-to-yaml`.
  Rejected because the repository's larger remaining migration gap is core
  workflow history: legacy specs and 29 archived changes still cannot become
  strict YAML artifacts.
- Start with `add-strict-spec-migrate-skill`.
  Rejected because the skill should guide a migration flow with credible
  converter coverage, not wrap a mostly deferred core workflow migration.
- Start with `add-migration-tests-and-reporting`.
  Rejected because broader migration tests and snapshots are more valuable once
  more real converter behavior exists to exercise.
- Jump directly to `self-host-repo-on-strict-workflow`.
  Rejected because self-hosting depends on migrated strict specs and change
  history, not just the presence of a migration command.
