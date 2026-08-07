---
name: strict-spec-fixture-shell-heredoc
description: Non-compliant fixture package that instructs a shell heredoc write into a strict YAML artifact.
metadata:
  skill_id: strict_spec_fixture_shell_heredoc
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-spec-fixture-shell-heredoc

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

1. Confirm the workflow state exists before authoring anything.
2. Assemble the requirement text with the operator.
3. Write it with cat <<EOF > .strict-spec-driven/specs/x.yaml
