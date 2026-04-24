# Design: port-strict-roadmap-workflow

## Approach

Implement the roadmap workflow in four passes:

1. Add strict roadmap command support
- extend the strict CLI with roadmap-specific command routing
- load and validate `.strict-spec-driven/roadmap/` artifacts through the shared
  YAML and validation layers
- derive milestone and planned change state from declared roadmap fields plus
  active and archived strict change evidence

2. Reconcile roadmap state deterministically
- implement roadmap sync behavior that regenerates or repairs canonical roadmap
  index state from milestone files
- reconcile planned change completion and milestone derived status without
  inventing new planned changes or rewriting unrelated roadmap prose
- keep archive reconciliation explicit so roadmap state follows actual strict
  workflow results

3. Rewrite the strict roadmap skill surface
- replace placeholder `strict-roadmap-*` skill prompts with concrete strict
  roadmap instructions
- point those skills at the roadmap command set plus shared strict change
  commands they depend on
- keep deterministic validation, status derivation, sync, and scaffolding in
  scripts while the prompts own recommendation, editing, and user checkpoints

4. Add regression coverage
- extend automated checks so placeholder roadmap skill content is rejected
- add tests for roadmap status, roadmap sync, and proposal handoff behavior
- ensure the roadmap workflow is exercised through compiled strict CLI behavior,
  not prompt prose alone

## Key Decisions

- Keep roadmap command behavior and roadmap skill rewrites in the same change.
  The roadmap item already groups them around the same artifact contract, and
  splitting them would risk drift between implemented commands and skill
  instructions.
- Reuse the existing strict `propose` flow for roadmap handoff instead of
  inventing a second proposal artifact format. The roadmap should stay the
  canonical home of milestone planning metadata while the change scaffold stays
  focused on one planned change.
- Derive roadmap completion from active and archived strict workflow state
  rather than trusting milestone prose alone so status, sync, and archive
  reconciliation stay deterministic.
- Keep the finalized roadmap schema contract stable and build workflow behavior
  on top of it rather than reopening roadmap schema design inside this change.

## Alternatives Considered

- Start with `update-planning-and-spec-content-skills-for-yaml`.
  Rejected because it improves a parallel skill branch but does not unblock the
  missing roadmap CLI and proposal-handoff path that milestone 05 depends on.
- Split roadmap CLI commands and roadmap skill rewrites into separate changes.
  Rejected because milestone 04 intentionally groups them, and the repo is
  already at a point where placeholder roadmap skills and missing roadmap
  commands need to land together.
- Defer roadmap recommendation and proposal handoff until migration work.
  Rejected because migration and self-hosting should build on an already-usable
  strict roadmap workflow rather than inventing it mid-migration.
