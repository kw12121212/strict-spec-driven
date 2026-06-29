---
name: strict-spec-archive
description: Archive a completed strict YAML change. Uses the strict archive command to merge delta specs into main specs, regenerate the spec index, reconcile roadmap status when present, and move the change into archive.
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
check-workflow-state: strict-spec-cli check-workflow-state
modify: strict-spec-cli modify [change-name|archive-dir]
verify: strict-spec-cli verify <change-name>
verify-spec-mappings: strict-spec-cli verify-spec-mappings
archive: strict-spec-cli archive <change-name>
```

## Responsibility Split

**Handled by CLI scripts**
- merge strict YAML delta specs into main specs during archive
- regenerate `.strict-spec-driven/specs/INDEX.yaml`
- reconcile `.strict-spec-driven/roadmap/` milestone and index status when archive changes roadmap-derived completion state
- move the change directory into `.strict-spec-driven/changes/archive/`

**Handled by the AI**
- choose the change to archive
- confirm verification and review readiness
- interpret archive output and summarize the final result

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Select the change** — run `modify` without an argument to list active
   changes. If the change is already specified, use it.

2. **Confirm readiness** — run:
   ```bash
   strict-spec-cli verify <change-name>
   strict-spec-cli verify-spec-mappings
   ```
   Stop if either command reports blockers.

3. **Check for observable spec impact** — inspect
   `.strict-spec-driven/changes/<name>/specs/`.
   - if it is empty, treat the change as having no delta specs to merge and
     continue directly to archive
   - otherwise proceed

4. **Archive the change** — run:
   ```bash
   strict-spec-cli archive <change-name>
   ```

5. **Confirm the result** — summarize:
    - the archive destination
    - the strict main specs that were updated
    - any roadmap files the archive command reconciled

## Rules

- Never archive a change with verification blockers
- Use the strict archive command rather than manually moving change directories
- Treat the current YAML artifacts and repository state as authoritative
