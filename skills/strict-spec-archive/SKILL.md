---
name: strict-spec-archive
description: Archive a completed strict YAML change. Uses the strict archive command to merge delta specs into main specs, regenerate the spec index, and move the change into archive.
metadata:
  skill_id: strict_spec_archive
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user archive a completed strict YAML change.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
modify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
archive: node {{SKILL_DIR}}/scripts/strict-spec-driven.js archive <change-name>
```

## Responsibility Split

**Handled by CLI scripts**
- merge strict YAML delta specs into main specs during archive
- regenerate `.strict-spec-driven/specs/INDEX.yaml`
- move the change directory into `.strict-spec-driven/changes/archive/`

**Handled by the AI**
- choose the change to archive
- confirm verification and review readiness
- interpret archive output and summarize the final result

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. Before
proceeding, verify that strict workflow state already exists.

## Steps

1. **Select the change** — run `modify` without an argument to list active
   changes. If the change is already specified, use it.

2. **Confirm readiness** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
   ```
   Stop if either command reports blockers.

3. **Check for observable spec impact** — inspect
   `.strict-spec-driven/changes/<name>/specs/`.
   - if it is empty, treat the change as having no delta specs to merge and
     continue directly to archive
   - otherwise proceed

4. **Archive the change** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js archive <change-name>
   ```

5. **Confirm the result** — summarize:
   - the archive destination
   - the strict main specs that were updated

## Rules

- Never archive a change with verification blockers
- Use the strict archive command rather than manually moving change directories
- Treat the current YAML artifacts and repository state as authoritative
