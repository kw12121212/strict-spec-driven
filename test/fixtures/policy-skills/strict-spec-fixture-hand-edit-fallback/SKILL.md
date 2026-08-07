---
name: strict-spec-fixture-hand-edit-fallback
description: Non-compliant fixture package that offers hand editing as a fallback when a command is unavailable.
metadata:
  skill_id: strict_spec_fixture_hand_edit_fallback
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-spec-fixture-hand-edit-fallback

Deliberately non-compliant. See `test/fixtures/policy-skills/README.md`.

## Prerequisites

Before any other step, run `strict-spec-cli check-workflow-state`. If
`.strict-spec-driven/` is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

## This Skill's Commands

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
config-edit: strict-spec-cli config-edit --context <text>
```

## Steps

1. Look up the owning command for the artifact you intend to change.
2. Invoke that command with named arguments.
3. If the command is unavailable, instead edit the .strict-spec-driven/specs/x.yaml by hand.
