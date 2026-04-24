---
mapping:
  implementation:
    - src/archive.ts
    - src/strict-spec-cli.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-archive-reads-active-change-artifacts
The system MUST provide an `archive` subcommand that reads planning artifacts and delta specs from a named active strict change directory under `.strict-spec-driven/changes/<name>/`.

#### Scenario: archive locates artifacts for an existing change
- GIVEN `.strict-spec-driven/changes/<name>/` exists with proposal, design, tasks, questions, and delta spec files
- WHEN `strict-spec-driven archive <name>` is executed
- THEN the command reads the change artifacts needed for archive processing

#### Scenario: archive rejects missing change
- GIVEN `.strict-spec-driven/changes/<name>/` does not exist
- WHEN `strict-spec-driven archive <name>` is executed
- THEN the command exits non-zero
- AND an error message is written to stderr indicating the change was not found

### Requirement: cli-archive-requires-verified-change-state
The system MUST block archive when the named active change has incomplete tasks, open questions, or validation diagnostics.

#### Scenario: archive rejects incomplete or unresolved change state
- GIVEN a strict change has at least one pending task or at least one open question
- WHEN `strict-spec-driven archive <name>` is executed
- THEN the command exits non-zero
- AND the change remains in the active changes directory

#### Scenario: archive rejects schema-invalid change artifacts
- GIVEN a strict change contains an artifact that fails strict schema validation
- WHEN `strict-spec-driven archive <name>` is executed
- THEN the command exits non-zero
- AND the archive move is not performed

### Requirement: cli-archive-merges-delta-specs-into-main-specs
The system MUST merge delta specs from the archived change into their corresponding main strict specs using stable requirement identifiers and explicit ADDED, MODIFIED, and REMOVED operations.

#### Scenario: archive applies added and modified operations
- GIVEN a strict change includes delta specs with ADDED and MODIFIED entries targeting existing strict main specs
- WHEN `strict-spec-driven archive <name>` is executed
- THEN ADDED requirements are appended to the target specs
- AND MODIFIED requirements replace the targeted requirements by stable requirement identifier

#### Scenario: archive applies removed operations
- GIVEN a strict change includes delta specs with REMOVED entries targeting existing requirements
- WHEN `strict-spec-driven archive <name>` is executed
- THEN targeted requirements are removed from the target main specs

### Requirement: cli-archive-applies-missing-target-merge-rules
The system MUST apply deterministic missing-target merge rules during archive processing.

#### Scenario: missing modified target is treated as added
- GIVEN a delta MODIFIED entry targets a requirement ID missing from the target main spec at archive time
- WHEN `strict-spec-driven archive <name>` is executed
- THEN the replacement requirement is merged as an added requirement
- AND the fallback outcome is recorded in the archive merge report

#### Scenario: missing removed target is skipped
- GIVEN a delta REMOVED entry targets a requirement ID missing from the target main spec at archive time
- WHEN `strict-spec-driven archive <name>` is executed
- THEN the removal is skipped
- AND the skipped removal is recorded in the archive merge report

### Requirement: cli-archive-moves-change-to-date-prefixed-archive
The system MUST move a successfully archived change from the active changes directory to `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/` using local date naming.

#### Scenario: successful archive move uses date-prefixed destination
- GIVEN `strict-spec-driven archive <name>` completes merge successfully
- WHEN archive move behavior is evaluated
- THEN the active change directory is removed from `.strict-spec-driven/changes/`
- AND the change is present at `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/`

#### Scenario: archive destination collisions use deterministic suffixes
- GIVEN `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/` already exists
- WHEN `strict-spec-driven archive <name>` completes merge successfully
- THEN the archived change uses the next available destination suffix
- AND the existing archive directory is preserved

### Requirement: cli-archive-regenerates-spec-index-after-merge
The system MUST regenerate strict specs index artifacts after archive merge writes updated main strict specs.

#### Scenario: specs index reflects merged spec state
- GIVEN archive merges one or more delta specs into main strict specs
- WHEN `strict-spec-driven archive <name>` completes
- THEN the strict specs index is regenerated from the resulting spec state
- AND index entries remain aligned with the available main strict spec files

### Requirement: cli-archive-emits-deterministic-json-output
The system MUST emit deterministic JSON to stdout describing archive validity, merge outcomes, and archive destination details.

#### Scenario: archive output is parseable json
- GIVEN `strict-spec-driven archive <name>` completes
- WHEN command stdout is parsed as JSON
- THEN the output includes archive validity state
- AND the output includes merged, skipped, and conflict/fallback outcome summaries when present
- AND the output includes the archive destination path
