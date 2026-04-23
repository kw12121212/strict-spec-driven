# Specs

Specs describe the current state of the system — what it does, not how it was built.

## Format

```markdown
---
mapping:
  implementation:
    - src/example.ts
  tests:
    - test/example.test.ts
---

### Requirement: <name>
The system MUST/SHOULD/MAY <observable behavior>.

#### Scenario: <name>
- GIVEN <precondition>
- WHEN <action>
- THEN <expected outcome>
```

**Keywords**: MUST = required, SHOULD = recommended, MAY = optional (RFC 2119).

## Organization

Group specs by domain area. Use kebab-case directory names (e.g. `core/`, `api/`, `auth/`).

## Conventions

- Write in present tense ("the system does X")
- Describe observable behavior, not implementation details
- Keep each spec focused on one area
- Put related implementation and test file paths in frontmatter mappings, not in requirement prose
- Use repo-relative paths under `mapping.implementation` and `mapping.tests`
- Keep mappings at file granularity; do not use line numbers or symbol ranges
