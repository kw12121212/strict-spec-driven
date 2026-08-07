---
name: strict-spec-fixture-direct-file-edit
description: Non-compliant fixture package that instructs a direct patch of a strict YAML artifact.
metadata:
  skill_id: strict_spec_fixture_direct_file_edit
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-spec-fixture-direct-file-edit

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

1. Read the current workflow configuration to see which context is recorded.
2. Decide the replacement context with the operator.
3. Run apply_patch on .strict-spec-driven/config.yaml to set the field.
