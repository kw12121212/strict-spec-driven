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
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
roadmap-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
roadmap-sync: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
```

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
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

Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

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

3. **Create or revise executable roadmap YAML artifacts** — update:
    - `.strict-spec-driven/roadmap/INDEX.yaml`
    - `.strict-spec-driven/roadmap/milestones/*.yaml`
    - `.strict-spec-driven/roadmap/planned-changes/*.yaml`
    Keep milestone planning in structured YAML fields such as `goal`, `scope`,
    `done_criteria`, `dependencies`, `risks`, `status`, `notes`, and
    `details`. Refine each milestone until its goal, scope, done criteria,
    dependencies, risks, notes, and details describe executable planning
    context rather than placeholders or broad intentions. Keep standalone work
    items in `planned-changes/*.yaml`, and give each standalone planned-change
    artifact an actionable `summary`, `details`, `depends_on`, and `status` so
    later roadmap recommendation, proposal, and implementation workflows can
    understand the work without inventing missing detail. Keep milestone
    `planned_changes` empty unless you are explicitly materializing legacy data.
    If a milestone needs more than ten planned changes or mixes unrelated work,
    split it or stop for explicit user confirmation instead of hiding the scope
    problem in one large milestone.

4. **Normalize roadmap state** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
   ```
   Use this to regenerate canonical index state and reconcile roadmap status
   with active and archived strict changes.

5. **Review the roadmap plan before handoff** — run `roadmap-status` after
   sync, then review the edited roadmap files directly. Check for placeholders,
   overbroad milestones, unclear dependencies, unverifiable done criteria, weak
   planned-change detail, excessive planned change count, stale status values,
   and current roadmap diagnostics. Fix safe structural or wording issues
   immediately. If the review finds a product scope decision, dependency
   decision, milestone split, or prioritization decision that requires the user,
   stop and report the specific question instead of guessing.

6. **Summarize the result** — report the milestone set, the next planned change
   candidates, and any roadmap diagnostics that still need human attention.

## Rules

- Keep all roadmap state under `.strict-spec-driven/roadmap/`
- Keep planned changes owned by exactly one milestone
- Keep milestone files numbered and stable once the roadmap exists
- Keep each milestone to ten planned changes or fewer
