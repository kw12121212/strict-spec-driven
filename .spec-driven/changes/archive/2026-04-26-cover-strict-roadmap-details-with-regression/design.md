# Design: cover-strict-roadmap-details-with-regression

## Approach

Concentrate the work in the existing roadmap regression surfaces instead of
introducing a new suite. `test/suites/roadmap-and-migration.ts` already covers
roadmap status, sync, migration, and details preservation behavior, so the
change should extend that suite with the remaining details-focused assertions.

The proposal should keep using the current details fixture and temporary
workspace helpers where possible. New fixture content should only be added if an
existing artifact cannot express the missing regression case cleanly.

The spec delta stays focused on `cli/foundation.md`, where automated roadmap
coverage expectations already live. The product behavior around `details`
already exists in the main specs; this proposal makes the regression obligation
explicit rather than redefining the feature.

## Key Decisions

- **Extend the existing roadmap suite.** The details behavior already spans
  roadmap sync, migration, and skill validation in `test/suites/roadmap-and-migration.ts`,
  so keeping new assertions there avoids duplicating harness setup.
- **Treat this as coverage, not a feature expansion.** The change should prove
  the current `details` behavior instead of widening the roadmap contract or
  moving logic into generic CLI scaffolding.
- **Keep the spec delta narrow.** Only the roadmap coverage requirement in
  `cli/foundation.md` needs to change because the core `details` behavior is
  already specified elsewhere.

## Alternatives Considered

- **Create a new standalone details regression suite.** Rejected because it
  would duplicate existing roadmap test harness and make roadmap regressions
  harder to follow.
- **Modify the roadmap contract specs again.** Rejected because the contract and
  proposal-handoff behavior for `details` are already described in the main
  specs.
- **Add runtime CLI behavior as part of the coverage change.** Rejected because
  this milestone item is about proving existing behavior, not broadening the
  command surface.
