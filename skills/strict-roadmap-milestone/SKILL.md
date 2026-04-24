---
name: strict-roadmap-milestone
description: Refine one strict roadmap milestone's goal, scope, planned changes, and status.
metadata:
  skill_id: strict_roadmap_milestone
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user refine one strict roadmap milestone.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
roadmap-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
roadmap-sync: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. Before
proceeding, verify that strict workflow state already exists.

## Steps

1. **Load milestone context** — read `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/roadmap/INDEX.yaml`, the target milestone YAML file
   under `.strict-spec-driven/roadmap/milestones/`, and the strict specs the
   milestone is likely to affect.

2. **Check current roadmap state** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
   ```
   Use the milestone's declared status, derived status, planned change state,
   and any diagnostics to understand what needs refinement.

3. **Edit only the target milestone** — refine its `goal`, `scope`,
   `done_criteria`, `planned_changes`, `dependencies`, `risks`, `status`, and
   `notes` fields without moving unrelated work across milestones unless the
   user explicitly asks for that boundary change.

4. **Resync the roadmap** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
   ```
   Confirm the milestone still participates in a canonical
   `.strict-spec-driven/roadmap/` index and that its planned change state is
   consistent with active and archived strict changes.

5. **Report the milestone result** — summarize the milestone goal, planned
   changes, status, and any follow-up work or conflicts.

## Rules

- Keep the milestone rooted in `.strict-spec-driven/roadmap/`
- Do not invent planned change state that conflicts with the strict workflow
- Keep milestone scope focused; split oversized milestones instead of dumping in
  unrelated work
