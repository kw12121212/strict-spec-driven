---
mapping:
  implementation:
    - src/review.ts
    - src/strict-spec-cli.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-review-reads-active-change-artifacts
The system MUST provide a `review` subcommand that reads all strict YAML change artifacts (proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and any delta spec files under `specs/`) from a named active change directory under `.strict-spec-driven/changes/<name>/`.

#### Scenario: review locates artifacts for an existing change
- GIVEN `.strict-spec-driven/changes/<name>/` exists with planning artifacts
- WHEN `strict-spec-driven review <name>` is executed
- THEN the command reads and parses each planning artifact from the change directory

#### Scenario: review rejects missing change
- GIVEN `.strict-spec-driven/changes/<name>/` does not exist
- WHEN `strict-spec-driven review <name>` is executed
- THEN the command exits non-zero
- AND an error message is written to stderr indicating the change was not found

### Requirement: cli-review-reports-code-quality-findings
The system MUST report advisory code-quality findings across `requirement-quality`, `mapping-coverage`, `delta-coherence`, and `proposal-clarity` categories without duplicating or replacing verify lifecycle gates.

#### Scenario: review findings are advisory only
- GIVEN a strict change has verify diagnostics
- WHEN `strict-spec-driven review <name>` is executed
- THEN review finding output is separate from verify diagnostic output
- AND verify lifecycle gates are not re-evaluated as review findings

#### Scenario: review reports findings in structured categories
- GIVEN a strict change has reviewable artifacts
- WHEN `strict-spec-driven review <name>` is executed
- THEN each finding includes a fixed category string, message, and optional path

### Requirement: cli-review-emits-deterministic-json-output
The system MUST emit a deterministic JSON object to stdout containing `valid`, `changeName`, `findings`, and `findingCount`.

#### Scenario: review output is parseable json
- GIVEN `strict-spec-driven review <name>` completes
- WHEN command stdout is parsed as JSON
- THEN the JSON includes `valid` as a boolean
- AND the JSON includes `changeName` as a string
- AND the JSON includes `findings` as an array
- AND the JSON includes `findingCount` as a number

#### Scenario: review exits zero when findings are advisory
- GIVEN a strict change has code-quality findings but no input errors
- WHEN `strict-spec-driven review <name>` is executed
- THEN the command exits with exit code zero

#### Scenario: review exits non-zero on input error
- GIVEN the named change directory does not exist or an artifact is unparseable
- WHEN `strict-spec-driven review <name>` is executed
- THEN the command exits with a non-zero exit code
