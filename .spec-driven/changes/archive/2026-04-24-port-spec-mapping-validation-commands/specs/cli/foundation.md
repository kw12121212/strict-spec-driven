---
mapping:
  implementation:
    - src/strict-spec-cli.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-verify-spec-mappings-subcommand
The system MUST provide a `verify-spec-mappings` subcommand for strict
spec-mapping audits.

#### Scenario: verify-spec-mappings runs from repository state
- GIVEN `.spec-driven/specs/` contains one or more main spec files
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN the command runs mapping audits against available spec mapping fields
- AND command output is emitted as parseable JSON

#### Scenario: verify-spec-mappings reports missing specs directory
- GIVEN `.spec-driven/specs/` does not exist
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN the command exits non-zero
- AND a diagnostic explains that spec mapping inputs are unavailable

### Requirement: cli-verify-spec-mappings-audits-mapping-coverage
The system MUST audit mapping coverage across main spec mapping fields and
report diagnostics when mapping coverage is incomplete.

#### Scenario: mapped implementation and tests produce no coverage diagnostics
- GIVEN each main spec has mapping frontmatter with non-empty implementation and
  test path collections
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN mapping-coverage diagnostics are not emitted

#### Scenario: missing mapping coverage produces diagnostics
- GIVEN a main spec omits mapping frontmatter or has an empty implementation or
  test mapping collection
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN a diagnostic is emitted identifying the spec path and missing coverage

### Requirement: cli-verify-spec-mappings-audits-unmapped-evidence
The system MUST audit unmapped repository evidence by reporting implementation
or test files that are not referenced by any spec mapping entry.

#### Scenario: fully mapped repository evidence produces no unmapped diagnostics
- GIVEN relevant implementation and test files are each referenced by at least
  one spec mapping entry
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN unmapped-evidence diagnostics are not emitted

#### Scenario: unmapped evidence produces diagnostics
- GIVEN at least one relevant implementation or test file is not referenced by
  any spec mapping entry
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN a diagnostic is emitted identifying each unmapped file path

### Requirement: cli-verify-spec-mappings-emits-deterministic-json-output
The system MUST emit deterministic JSON output for mapping audit results,
including validity, diagnostics, and mapping summary counts.

#### Scenario: output is parseable JSON
- GIVEN `strict-spec-driven verify-spec-mappings` completes
- WHEN command stdout is parsed as JSON
- THEN the JSON includes `valid` as a boolean
- AND the JSON includes `diagnostics` as an array
- AND the JSON includes summary counts for mapped and unmapped evidence

#### Scenario: exit status reflects diagnostic validity
- GIVEN mapping diagnostics are present
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN the command exits non-zero

#### Scenario: successful audit exits zero
- GIVEN no mapping diagnostics are present
- WHEN `strict-spec-driven verify-spec-mappings` is executed
- THEN the command exits with exit code zero
