---
name: strict-spec-fixture-named-ai-product
description: >-
  Non-compliant fixture package whose routing text names one AI product as the actor the skill is for.
  Use when Codex should read the roadmap rather than addressing whichever agent is running the skill.
metadata:
  skill_id: strict_spec_fixture_named_ai_product
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-spec-fixture-named-ai-product

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
2. **Report** — summarize the reported milestones and stop.

## Rules

- Read strict workflow artifacts under `.strict-spec-driven/` and report what they say.
