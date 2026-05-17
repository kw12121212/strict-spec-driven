---
name: strict-roadmap-plan
description: Create or restructure a strict YAML roadmap under .strict-spec-driven/roadmap/.
metadata:
  skill_id: strict_roadmap_plan
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user create or restructure the strict roadmap.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
roadmap-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
roadmap-sync: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. If it is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Roadmap Linking Rules

- Milestone ownership is defined by `planned_change.milestone`.
- Do not expect milestone files to list standalone planned-change file paths.
- Use `roadmap-status` output to locate planned-change source files; each
  `plannedChanges[]` entry reports its `path`.
- Treat filenames as helpful conventions only. `planned_change.id` and
  `planned_change.milestone` are the source of truth.

## Steps

Before any other step, confirm `.strict-spec-driven/` exists at the project
root. If it is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

1. **Read strict project context** — inspect `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/specs/INDEX.yaml`, and the main strict YAML specs that
   define the current system.

2. **Inspect the current roadmap state** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
   ```
   Use the returned milestone order, diagnostics, and derived status summaries
   as the basis for any roadmap edits under `.strict-spec-driven/roadmap/`. Use
   the returned `plannedChanges[].path` values when you need to inspect or move
   existing standalone roadmap items.

3. **Create or revise roadmap YAML artifacts** — update:
    - `.strict-spec-driven/roadmap/INDEX.yaml`
    - `.strict-spec-driven/roadmap/milestones/*.yaml`
    - `.strict-spec-driven/roadmap/planned-changes/*.yaml`
    Keep milestone planning in structured YAML fields such as `goal`, `scope`,
    `done_criteria`, `dependencies`, `risks`, `status`, and `notes`. Keep
    standalone work items in `planned-changes/*.yaml`, and keep milestone
    `planned_changes` empty unless you are explicitly materializing legacy data.

4. **Normalize roadmap state** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
   ```
   Use this to regenerate canonical index state and reconcile roadmap status
   with active and archived strict changes.

5. **Summarize the result** — report the milestone set, the next planned change
   candidates, and any roadmap diagnostics that still need human attention.

## Rules

- Keep all roadmap state under `.strict-spec-driven/roadmap/`
- Keep planned changes owned by exactly one milestone
- Keep milestone files numbered and stable once the roadmap exists
- Keep each milestone to ten planned changes or fewer
