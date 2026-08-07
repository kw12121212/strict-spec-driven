---
name: strict-spec-fixture-raw-yaml-payload
description: Non-compliant fixture package that instructs construction of a temporary YAML payload file.
metadata:
  skill_id: strict_spec_fixture_raw_yaml_payload
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-spec-fixture-raw-yaml-payload

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

1. Gather the confirmed values with the operator.
2. Create a temporary YAML payload file and pass it to the command.
3. Inspect the structured result and validate the artifact.
