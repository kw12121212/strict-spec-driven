# cover-strict-roadmap-details-with-regression

## What

Add regression coverage for strict roadmap milestones that use the optional
`details` field so the existing behavior is proven across roadmap validation,
sync, and proposal-handoff flows.

## Why

Milestone 10 already delivered the `details` field contract, CLI preservation,
proposal-handoff guidance, and migration behavior. The remaining planned change
is to prove those pieces hold together under the repository's regression
surfaces.

Without explicit details-focused regression coverage, the roadmap workflow could
silently drift: sync could stop preserving `details`, skill guidance could stop
referencing it, or the optional field could start requiring placeholder data.

## Scope

- Extend roadmap regression coverage in `test/suites/roadmap-and-migration.ts`
  for milestones with and without `details`
- Reuse or refine roadmap fixtures that exercise `details` preservation and
  omission behavior
- Assert the strict roadmap proposal-handoff guidance remains aligned with the
  details-aware behavior already defined in the roadmap skill prompts
- Update the `cli/foundation` delta spec so the automated roadmap coverage
  expectation explicitly includes details-bearing milestones
- Not change strict roadmap schema shape, milestone identity rules, or generic
  scaffold command behavior

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- `details` remains an optional milestone field
- `roadmap-status` and `roadmap-sync` keep their existing command semantics
- The generic `propose` command remains milestone-agnostic; details-aware
  behavior stays in roadmap skill guidance and regression expectations
- Planned change names remain the canonical proposal identities
