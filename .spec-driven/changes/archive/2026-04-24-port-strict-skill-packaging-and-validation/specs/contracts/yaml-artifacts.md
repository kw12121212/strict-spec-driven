---
mapping:
  implementation:
    - install.sh
    - scripts/strict-spec-driven.js
    - skills/marketplace.json
    - skills/strict-spec-archive/SKILL.md
    - skills/strict-spec-apply/SKILL.md
    - skills/strict-spec-auto/SKILL.md
    - skills/strict-spec-brainstorm/SKILL.md
    - skills/strict-spec-cancel/SKILL.md
    - skills/strict-spec-init/SKILL.md
    - skills/strict-spec-maintenance/SKILL.md
    - skills/strict-spec-modify/SKILL.md
    - skills/strict-spec-propose/SKILL.md
    - skills/strict-spec-resync-code-mapping/SKILL.md
    - skills/strict-spec-review/SKILL.md
    - skills/strict-spec-ship/SKILL.md
    - skills/strict-spec-simple-task/SKILL.md
    - skills/strict-spec-spec-edit/SKILL.md
    - skills/strict-spec-sync-specs/SKILL.md
    - skills/strict-spec-verify/SKILL.md
    - skills/strict-roadmap-milestone/SKILL.md
    - skills/strict-roadmap-plan/SKILL.md
    - skills/strict-roadmap-propose/SKILL.md
    - skills/strict-roadmap-recommend/SKILL.md
    - skills/strict-roadmap-sync/SKILL.md
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: strict-skill-packaging-layout-contract
The system MUST provide strict skill packaging surfaces for both
`strict-spec-*` and `strict-roadmap-*` families with installer-facing metadata
that uses strict namespace names in non-migration contexts.

#### Scenario: strict skill families are packaged with strict naming
- GIVEN strict workflow skill packaging metadata is reviewed
- WHEN spec workflow and roadmap workflow skill entries are checked
- THEN skill package names use `strict-spec-*` and `strict-roadmap-*` families
- AND legacy `spec-driven-*` and `roadmap-*` names are not treated as default
  strict package names outside explicit migration compatibility behavior
- AND marketplace skill entries match strict skill directory names

### Requirement: strict-skill-packaging-validation-contract
The system MUST validate strict skill packages for required metadata fields,
declared command references, stale legacy-name references, and bundled symlink
assumptions.

#### Scenario: valid strict skill package passes validation
- GIVEN a strict skill package includes required frontmatter metadata and
  command references
- AND package symlinks resolve to expected bundled script and template targets
- WHEN skill packaging validation runs
- THEN no validation error is emitted

#### Scenario: stale naming or broken symlink fails validation
- GIVEN a strict skill package uses stale legacy naming references or a broken
  bundled symlink target
- WHEN skill packaging validation runs
- THEN validation fails deterministically
- AND diagnostics identify the package path and failing field or link target
