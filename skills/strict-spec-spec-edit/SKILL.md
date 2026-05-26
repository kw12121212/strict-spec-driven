---
name: strict-spec-spec-edit
description: Create or modify individual strict YAML main spec files directly for lightweight spec corrections.
metadata:
  skill_id: strict_spec_spec_edit
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user create or modify strict YAML main spec files under
`.strict-spec-driven/specs/` directly, without going through the strict change
workflow.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
```

## Prerequisites

Run `check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Steps

Before any other step, run `check-workflow-state`. If `.strict-spec-driven/` is
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

6. **Apply the confirmed edits** — after confirmation:
   - edit the target files under `.strict-spec-driven/specs/`
   - preserve existing `mapping.implementation` and `mapping.tests` fields
   - if the edit changes implementation or test evidence, update only those
     mapping fields with repo-relative file paths
   - if a new file or category was created, update
     `.strict-spec-driven/specs/INDEX.yaml`
   - for removals, delete the exact structured requirement entries cleanly

7. **Validate the result** — after editing, verify:
   - each edited file remains valid strict YAML
   - requirement and scenario structures still match the strict schema contract
   - `INDEX.yaml` reflects the current strict spec files
   - mapping fields still use normalized repo-relative paths

   Run `verify-spec-mappings` when mapping fields changed.

8. **Summarize** — tell the user which strict YAML spec files changed, what was
   added, modified, or removed, and whether `INDEX.yaml` was updated.

## Rules

- Always read existing strict specs before editing
- Present the exact changes and wait for confirmation before writing
- Prefer existing categories and files unless the content clearly requires a new
  path
- Describe observable behavior only, not implementation details
- Do not implement product code
- Do not create or interact with `.strict-spec-driven/changes/`
- Keep mappings in `mapping.implementation` and `mapping.tests`, not in
  requirement prose
