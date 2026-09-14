---
name: strict-spec-fixture-harness-specific-handoff
description: Non-compliant fixture package that reaches another skill through a named harness mechanism instead of a plain handoff.
metadata:
  skill_id: strict_spec_fixture_harness_specific_handoff
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-spec-fixture-harness-specific-handoff

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
2. **Hand off** — when the recommended work is ready to implement, invoke the `strict-spec-auto` skill via the Skill tool and stop.

## Rules

- Read strict workflow artifacts under `.strict-spec-driven/` and report what they say.
