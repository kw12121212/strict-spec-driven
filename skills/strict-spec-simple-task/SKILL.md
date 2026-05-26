---
name: strict-spec-simple-task
description: Execute a lightweight ad-hoc task in strict workflow mode and then assess strict spec impact.
metadata:
  skill_id: strict_spec_simple_task
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are executing a lightweight ad-hoc task using the strict workflow's
simple-task mode.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
list-changes: node {{SKILL_DIR}}/scripts/strict-spec-driven.js list
inspect-change: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]
verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
```

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Steps

Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Entry gate** — evaluate the user's request before executing:
   - If the task clearly spans multiple modules, requires tracked spec or schema
     changes, or affects cross-cutting strict workflow behavior, stop and
     recommend `/strict-spec-propose` or `/strict-spec-brainstorm`
   - If the task is framed as urgent or risky enough that it should leave behind
     a tracked strict change, stop and recommend the normal strict change
     workflow
   - If the task remains small, local, and well-bounded, proceed

2. **Load strict spec context** — read `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/specs/INDEX.yaml`, and any relevant strict YAML main
   specs before doing the task.

3. **Execute the task directly** — perform the work without creating or
   modifying strict change artifacts under `.strict-spec-driven/changes/`.

4. **Assess strict spec impact** — after the task is done, classify the result:
   - **No strict spec impact** — the task is complete
   - **Strict spec drift detected** — suggest `/strict-spec-sync-specs` or
     `/strict-spec-spec-edit`
   - **Mapping drift detected** — run `verify-spec-mappings` when helpful and
     suggest `/strict-spec-resync-code-mapping`
   - **A tracked strict change is needed** — suggest `/strict-spec-propose` or
     `/strict-spec-brainstorm`

   Use `list-changes` or `inspect-change` only when the user needs to inspect an
   existing strict change before deciding the next workflow.

5. **Summarize the outcome** — report what was done, whether strict specs or
   mappings drifted, and which strict workflow should handle any follow-up.

## Rules

- This skill never creates, modifies, archives, or cancels anything under
  `.strict-spec-driven/changes/`
- Strict spec context is read-only during simple-task execution
- If the task grows beyond simple scope mid-execution, stop and suggest
  switching to `/strict-spec-propose` or `/strict-spec-brainstorm`
