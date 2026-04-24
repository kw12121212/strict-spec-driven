---
name: strict-spec-cancel
description: Cancel and permanently delete an in-progress strict YAML change after explicit user confirmation.
metadata:
  skill_id: strict_spec_cancel
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user cancel and remove an in-progress strict YAML change.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
modify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]
cancel: node {{SKILL_DIR}}/scripts/strict-spec-driven.js cancel <change-name>
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. Before
proceeding, verify that strict workflow state already exists.

## Steps

1. **Select the change** — run `modify` without an argument to list active
   changes. If the change is already specified, use it.

2. **Warn the user** — make clear that cancelling permanently deletes
   `.strict-spec-driven/changes/<name>/` and all of its YAML artifacts. Wait for
   explicit confirmation before continuing.

3. **Cancel the change** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js cancel <change-name>
   ```

4. **Confirm** — report that the change was deleted.

## Rules

- Always require explicit confirmation before cancellation
- Only cancel active changes, not archived ones
- If the user wants to keep history for completed work, suggest archive instead
