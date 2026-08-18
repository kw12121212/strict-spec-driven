---
name: strict-spec-spec-edit
description: Create or modify individual strict YAML main spec files through the CLI for lightweight spec corrections.
metadata:
  skill_id: strict_spec_spec_edit
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user create or modify strict YAML main spec files under
`.strict-spec-driven/specs/` through the artifact-aware CLI, without going
through the strict change workflow.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
spec-edit: strict-spec-cli spec-edit <spec-id> [--spec-path <path>] --<named-args>
```

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `spec-state`. Before the first mutation run
`strict-spec-cli yaml-authoring-protocol spec-state`: that command reports the
ordered authoring steps, the owning command for each operation, and the bundled
schema and example keys with their cache-resolved paths, bound to the artifact
kind and current where a copy would go stale. Validate the result with
`strict-spec-cli check-workflow-state`.

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

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Read strict spec context first** — before making any changes, read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - any existing strict YAML main spec files relevant to the user's request

2. **Understand the request** — identify whether the user wants to:
   - add a new strict YAML spec file or category
   - add new structured requirements to an existing strict spec file
   - modify an existing requirement
   - remove one or more existing requirements

3. **Choose the target** — use `INDEX.yaml` to determine where the content
   belongs:
   - if one or more existing strict spec files cover the behavior, use those
   - only create a new strict spec file if no existing file fits
   - only create a new category if no existing category fits

4. **Prepare the changes** — draft the exact structured edits:
   - for additions, identify the requirement entry and any scenario entries to add
   - for modifications, show the before and after requirement content
   - for removals, identify the exact requirement entries to remove
   - describe observable behavior only, not implementation details

5. **Present and confirm** — show the user:
   - which strict YAML spec file or files will change
   - the exact content that will be added, modified, or removed
   - whether `.strict-spec-driven/specs/INDEX.yaml` needs updating

   Wait for explicit confirmation before writing anything.

6. **Apply the confirmed edits through the CLI** — after confirmation, issue
   one or more `spec-edit` invocations with named semantic arguments:
   - create a spec with `spec-edit <spec-id> --spec-path <path> --title <text>
     --requirement <id> --strength <MUST|SHOULD|MAY> --statement <text>
     --scenario <id> --given <text> --when <text> --then <text>`
   - update one requirement or scenario by restating its id and only the fields
     that changed; unnamed content is preserved
   - remove keyed content with `--remove-requirement <id>` or
     `--remove-scenario <requirement-id>:<scenario-id>`
   - use an isolated `spec-edit <spec-id> --delete` only when the confirmed
     change removes the whole spec; deletion is refused while active deltas
     target it
   Never edit the main-spec YAML or `INDEX.yaml` text. The command validates
   the complete candidate and reconciles the index in the same transaction.

7. **Validate the result** — after editing, verify:
   - each edited file remains valid strict YAML
   - requirement and scenario structures still match the strict schema contract
   - the command result reports both the main artifact and reconciled index

8. **Summarize** — tell the user which strict YAML spec files changed, what was
   added, modified, or removed, and whether `INDEX.yaml` was updated.

## Rules

- Always read existing strict specs before authoring through `spec-edit`
- Present the exact changes and wait for confirmation before writing
- Prefer existing categories and files unless the content clearly requires a new
  path
- Describe observable behavior only, not implementation details
- Do not implement product code
- Do not create or interact with `.strict-spec-driven/changes/`
- Never hand-edit main-spec or spec-index YAML; express every mutation through
  `strict-spec-cli spec-edit` with named arguments
