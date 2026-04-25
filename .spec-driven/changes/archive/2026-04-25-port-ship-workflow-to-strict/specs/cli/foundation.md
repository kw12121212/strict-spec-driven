---
mapping:
  implementation:
    - src/strict-spec-cli.ts
    - src/skills.ts
    - skills/strict-spec-ship/SKILL.md
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-ship-reads-archived-change
The system MUST provide a `ship` subcommand that resolves a named archived change under `.strict-spec-driven/changes/archive/` and reads its proposal summary, supporting both exact archive directory names and bare change names expanded via date-prefix matching.

#### Scenario: ship resolves exact archive directory name
- GIVEN `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/` exists
- WHEN `strict-spec-driven ship <YYYY-MM-DD>-<name>` is executed
- THEN the command reads the archived change artifacts from that directory

#### Scenario: ship expands bare name to date-prefixed archive directory
- GIVEN `.strict-spec-driven/changes/archive/<YYYY-MM-DD>-<name>/` exists
- WHEN `strict-spec-driven ship <name>` is executed with the bare change name
- THEN the command resolves the archived directory by date-prefix expansion and reads its artifacts

#### Scenario: ship reports ambiguity when multiple date-prefixed matches exist
- GIVEN multiple archive directories matching `*-<name>` exist under `.strict-spec-driven/changes/archive/`
- WHEN `strict-spec-driven ship <name>` is executed with the bare name
- THEN the command exits non-zero
- AND the error message lists the matching archive directories and asks the operator to specify the full archive directory name

#### Scenario: ship rejects missing archived change
- GIVEN no matching archived directory exists for the given name
- WHEN `strict-spec-driven ship <name>` is executed
- THEN the command exits non-zero
- AND an error message is written to stderr indicating the archived change was not found

### Requirement: cli-ship-emits-deterministic-json-output
The system MUST emit a deterministic JSON object to stdout from the `ship` subcommand containing `changeName`, `archivePath`, `proposalSummary`, and `roadmapSnapshot`.

#### Scenario: ship output is parseable JSON
- GIVEN `strict-spec-driven ship <name>` resolves a valid archived change
- WHEN command stdout is parsed as JSON
- THEN the JSON includes `changeName` as a string
- AND the JSON includes `archivePath` as the resolved archive directory path
- AND the JSON includes `proposalSummary` derived from the archived `proposal.yaml`
- AND the JSON includes `roadmapSnapshot` reflecting current roadmap milestone and planned change state

#### Scenario: ship exits zero for a valid archived change
- GIVEN a named archived change exists and its artifacts are readable
- WHEN `strict-spec-driven ship <name>` is executed
- THEN the command exits with exit code zero

### Requirement: cli-ship-skill-content-validation-smoke-coverage
The system MUST include automated checks that exercise strict ship skill content for both passing and failing states, not only package-shape validation.

#### Scenario: automated checks accept aligned ship skill content
- GIVEN `strict-spec-ship/SKILL.md` contains an explicit `ship` command reference and `.strict-spec-driven/` workflow guidance
- WHEN repository automated checks are executed
- THEN the ship skill content checks pass

#### Scenario: automated checks reject placeholder ship skill content
- GIVEN `strict-spec-ship/SKILL.md` retains a generic placeholder command block or omits `.strict-spec-driven/` workflow guidance
- WHEN repository automated checks are executed
- THEN the ship skill content checks fail
- AND diagnostics identify the failing skill package deterministically
