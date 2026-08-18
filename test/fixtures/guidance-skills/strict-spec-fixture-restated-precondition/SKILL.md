---
name: strict-spec-fixture-restated-precondition
description: Non-compliant fixture package that states the workflow-state precondition in two sections without carrying a Prerequisites section.
metadata:
  skill_id: strict_spec_fixture_restated_precondition
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-spec-fixture-restated-precondition

Deliberately non-compliant. See `test/fixtures/guidance-skills/README.md`.

## This Skill's Commands

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-status: strict-spec-cli roadmap-status
```

## Preferred Human Language

Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` — the user's common human language, not a programming language — for all user-facing and generated operator-facing text, unless that file is absent or the active user message asks otherwise.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.

1. **Read the roadmap** — run `strict-spec-cli roadmap-status` and read the reported milestones.

## Rules

- Restated here on purpose: If `.strict-spec-driven/` is missing, stop immediately and tell the user to run `/strict-spec-init`. Do not run `init` from this skill.
- Read strict workflow artifacts under `.strict-spec-driven/` and report what they say.
