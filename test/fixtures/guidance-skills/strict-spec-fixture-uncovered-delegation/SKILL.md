---
name: strict-spec-fixture-uncovered-delegation
description: Non-compliant fixture package that delegates a procedure to a skill which does not state it, alongside one delegation that resolves correctly.
metadata:
  skill_id: strict_spec_fixture_uncovered_delegation
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-spec-fixture-uncovered-delegation

Deliberately non-compliant. See `test/fixtures/guidance-skills/README.md`.

The second delegation below names a packaged skill that carries no
review-independence section, so the delegation resolves to nothing. The first
one resolves correctly and stays behind when the offending line is removed, so
the control run exercises a package that still declares a delegation rather than
one whose section became empty.

## This Skill's Commands

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-status: strict-spec-cli roadmap-status
```

## Delegated Procedures

- spec-artifact-routing: owned by `strict-spec-propose`
- review-independence: owned by `strict-spec-apply`

## Preferred Human Language

Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` — the user's common human language, not a programming language — for all user-facing and generated operator-facing text, unless that file is absent or the active user message asks otherwise.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.

1. **Read the roadmap** — run `strict-spec-cli roadmap-status` and read the reported milestones.

## Rules

- Read strict workflow artifacts under `.strict-spec-driven/` and report what they say.
