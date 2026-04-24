---
mapping:
  implementation:
    - src/converters/roadmap.ts
    - src/migrate.ts
    - src/strict-spec-cli.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-migrate-supports-repository-self-hosting
The system MUST allow a repository's actual bootstrap `.spec-driven/` workflow
state to be migrated into `.strict-spec-driven/` output that is usable as the
repository's active strict workflow state without rewriting the preserved
bootstrap source artifacts.

#### Scenario: self-host cutover migrates repository workflow state
- GIVEN a repository contains bootstrap specs, roadmap artifacts, and archived
  or active changes under `.spec-driven/`
- WHEN `strict-spec-driven migrate` is executed for the repository cutover
- THEN the command writes corresponding strict YAML workflow state under
  `.strict-spec-driven/`
- AND the migrated output preserves the identities and relationships needed by
  strict workflow commands
- AND the source `.spec-driven/` artifacts remain unchanged

#### Scenario: self-host cutover normalizes blank legacy mappings
- GIVEN a legacy archived delta leaves `mapping.implementation` or
  `mapping.tests` blank in Markdown frontmatter
- WHEN `strict-spec-driven migrate` is executed for the repository cutover
- THEN the migrated strict delta keeps those mapping fields as empty structured
  path collections
- AND the change is not deferred only because the legacy mapping fields were
  blank

#### Scenario: roadmap-status accepts migrated roadmap index paths
- GIVEN `strict-spec-driven migrate` has produced strict roadmap state for the
  repository cutover
- WHEN `strict-spec-driven roadmap-status` reads the migrated strict roadmap
- THEN migrated milestone paths resolve without reference diagnostics
- AND roadmap status validation succeeds against the migrated roadmap index
