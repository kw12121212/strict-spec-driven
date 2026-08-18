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

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `spec-state`. Before the first mutation run
`strict-spec-cli yaml-authoring-protocol spec-state`: that command reports the
ordered authoring steps, the owning command for each operation, and the bundled
schema and example keys with their cache-resolved paths, bound to the artifact
kind and current where a copy would go stale. Validate the result with
`strict-spec-cli verify <change-name>`.

**Stop rather than edit YAML directly.** When a required command, argument, or
artifact kind is unavailable, stop and report the missing capability. Editing
the YAML directly, writing a raw payload, or scripting around the CLI is never
an available fallback, and an unavailable command is a reason to stop rather
than a reason to improvise.

## Preferred Human Language

Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` —
the user's common human language, not a programming language — for all
user-facing and generated operator-facing text, unless that file is absent or
the active user message asks otherwise.

## Steps

1. Look up the owning command for the artifact you intend to change.
2. Invoke that command with named arguments.
3. If the command is unavailable, instead edit the .strict-spec-driven/specs/x.yaml by hand.
