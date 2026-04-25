---
mapping:
  implementation:
    - src/maintenance.ts
    - src/strict-spec-cli.ts
    - templates/strict-spec-driven/scaffold/config.yaml
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-maintenance-reads-config-and-runs-checks
The system MUST provide a `maintenance` subcommand that reads the `maintenance` section from `.strict-spec-driven/config.yaml`, runs each configured check, and emits a deterministic JSON object to stdout containing `valid`, `checksRun`, `findingsCount`, and `generatedChange`.

#### Scenario: maintenance runs configured checks from config
- GIVEN `.strict-spec-driven/config.yaml` contains a `maintenance` section with at least one check entry
- WHEN `strict-spec-driven maintenance` is executed
- THEN the command runs each configured check
- AND emits a JSON object with `valid`, `checksRun`, `findingsCount`, and `generatedChange` fields

#### Scenario: maintenance exits cleanly when no maintenance section exists
- GIVEN `.strict-spec-driven/config.yaml` has no `maintenance` section
- WHEN `strict-spec-driven maintenance` is executed
- THEN the command exits zero
- AND `checksRun` is zero and `findingsCount` is zero in the JSON output

### Requirement: cli-maintenance-roadmap-sync-check
The system MUST support a `roadmap-sync-check` configured check type that runs roadmap-sync behavior and produces findings for each mismatch between declared and derived roadmap state.

#### Scenario: roadmap-sync-check produces findings for mismatches
- GIVEN a maintenance config includes a `roadmap-sync-check` entry
- AND the current roadmap has at least one declared-vs-derived mismatch
- WHEN `strict-spec-driven maintenance` is executed
- THEN the check produces one finding per mismatch
- AND `findingsCount` in the output reflects the total finding count

#### Scenario: roadmap-sync-check produces no findings for aligned roadmap
- GIVEN a maintenance config includes a `roadmap-sync-check` entry
- AND the current roadmap has no declared-vs-derived mismatches
- WHEN `strict-spec-driven maintenance` is executed
- THEN the check produces zero findings
- AND `findingsCount` is zero in the output

### Requirement: cli-maintenance-generates-change-when-findings-exist
The system MUST generate a named maintenance change under `.strict-spec-driven/changes/` with seeded proposal, design, tasks, and questions artifacts when one or more checks produce findings.

#### Scenario: maintenance change is created for non-zero findings
- GIVEN at least one configured check produces findings
- WHEN `strict-spec-driven maintenance` is executed
- THEN a maintenance change directory is created under `.strict-spec-driven/changes/`
- AND `generatedChange` in the JSON output names the created change

#### Scenario: no maintenance change is created when no findings exist
- GIVEN all configured checks produce zero findings
- WHEN `strict-spec-driven maintenance` is executed
- THEN no maintenance change directory is created
- AND `generatedChange` in the JSON output is null
