---
mapping:
  implementation:
    - README.md
    - RTK.md
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: self-hosted-repository-guidance-prefers-strict-surfaces
The system MUST require a self-hosted repository's guidance to describe
`.strict-spec-driven/`, `strict-spec-*`, and `strict-roadmap-*` as the default
workflow surfaces while limiting `.spec-driven/` and legacy names to bootstrap
or migration context.

#### Scenario: repository guidance prefers strict workflow state after self-hosting
- GIVEN a repository has adopted `.strict-spec-driven/` workflow state
- WHEN its workflow guidance is reviewed
- THEN `.strict-spec-driven/` is identified as the preferred active workflow
  directory
- AND `.spec-driven/` is identified only as preserved bootstrap or migration
  input
- AND the two directories are not presented as equivalent active targets

#### Scenario: repository guidance prefers strict command families after self-hosting
- GIVEN a repository has adopted self-hosted strict workflow state
- WHEN its workflow names are reviewed
- THEN `strict-spec-*` and `strict-roadmap-*` are presented as the default skill
  and slash-command families
- AND legacy names appear only in bootstrap, migration, or historical context
