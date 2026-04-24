---
mapping:
  implementation:
    - src/migrate.ts
  tests:
    - test/run.ts
---

## MODIFIED Requirements

### Requirement: cli-migrate-converts-bootstrap-workflow-state
Previously: The system MUST provide a `migrate` subcommand that reads legacy
`.spec-driven/` workflow state, migrates the supported bootstrap config into
strict YAML output, initializes the remaining strict scaffold assets under
`.strict-spec-driven/`, and reports deferred legacy artifacts that still need
dedicated converters.
The system MUST provide a `migrate` subcommand that reads legacy
`.spec-driven/` workflow state, migrates supported bootstrap config, main
specs, delta specs, and active and archived change artifacts into strict YAML
output under `.strict-spec-driven/`, initializes any remaining required strict
scaffold assets, and reports only unsupported or still-unimplemented legacy
artifacts as deferred follow-up items.

#### Scenario: migrate converts legacy specs and change artifacts into strict workflow state
- GIVEN legacy main specs, delta specs, and active or archived changes exist
  under `.spec-driven/`
- AND no unsafe strict target conflict blocks execution
- WHEN `strict-spec-driven migrate` is executed
- THEN the command writes strict YAML spec and change artifacts under
  `.strict-spec-driven/`
- AND the command updates the strict spec index to reference the migrated main
  spec outputs
- AND the migrated artifacts preserve the stable identifiers, mappings, task
  state, question state, and archive-date behavior required by the strict
  workflow
- AND the source `.spec-driven/` artifacts remain unchanged

#### Scenario: migrate continues to defer roadmap and project-state artifacts outside this change
- GIVEN roadmap and project-state converters are not implemented yet
- WHEN `strict-spec-driven migrate` converts the supported core workflow
  artifacts
- THEN unsupported roadmap or project-state artifacts are still reported as
  deferred follow-up items
- AND the command does not invent strict YAML roadmap or project-state content
  for them

### Requirement: cli-migrate-emits-structured-report-output
Previously: The system MUST emit a structured migration report for each
migration run so the operator can review successes, failures, warnings, and
manual follow-up items.
The system MUST emit a structured migration report for each migration run so
the operator can review converted core workflow artifacts, remaining deferred
artifacts, failures, warnings, and manual follow-up items.

#### Scenario: migrate report distinguishes converted core workflow artifacts from deferred artifacts
- GIVEN `strict-spec-driven migrate` converts supported core workflow artifacts
  while roadmap or project-state converters are still pending
- WHEN the migration result is inspected
- THEN converted spec and change artifacts appear in converted entries with
  their strict target paths
- AND unsupported roadmap or project-state artifacts remain identifiable
  through skipped entries or manual follow-up items with source references
