---
name: strict-roadmap-review
description: Review one incomplete strict roadmap milestone and directly apply fixes that make its definition concrete and executable.
metadata:
  skill_id: strict_roadmap_review
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are reviewing one incomplete strict roadmap milestone and directly
applying fixes to its definition.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
roadmap-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
roadmap-overview: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-overview
roadmap-sync: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
```

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Review Scope

- This skill reviews only milestones whose status is not complete. When the
  requested milestone is already complete, stop and report that the milestone
  is historical record and out of review scope; do not edit it.
- Milestone ownership for standalone work items is defined by
  `planned_change.milestone`. Use `roadmap-status` output to locate
  planned-change source files; each `plannedChanges[]` entry reports its
  `path`. Treat filenames as helpful conventions only.

## Steps

Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Load milestone context** — read `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/roadmap/INDEX.yaml`, the target milestone YAML file
   under `.strict-spec-driven/roadmap/milestones/`, and the strict specs the
   milestone is likely to affect.

2. **Check current roadmap state** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
   ```
   and, when wider context helps, `roadmap-overview`. Use the milestone's
   declared status, derived status, planned change state, planned-change
   paths, and any diagnostics as the deterministic facts for the review. If
   the target milestone's status is complete, stop here and report it as out
   of review scope.

3. **Assess definition quality** — review the milestone for goal clarity,
   verifiable `done_criteria`, coherent `scope`, `dependencies`, and `risks`,
   and planned-change coverage of the milestone goal. Review each owned
   planned change for missing or vague `details` that would block turning it
   into an executable strict change proposal.

4. **Assess delivery state** — compare the milestone's declared status with
   the derived status and per-planned-change state reported by
   `roadmap-status`, including archived strict change evidence, and identify
   gaps between definition and delivery.

5. **Apply fixes directly** — directly edit the milestone and its
   planned-change YAML files under `.strict-spec-driven/roadmap/` so goals,
   `done_criteria`, scope, dependencies, risks, and planned-change `details`
   become concrete and executable. Tighten vague wording into verifiable
   statements; elaborate planned-change details until each one carries enough
   executable planning context to propose without re-deriving intent. Never
   hand-edit completion status: milestone and planned-change completion flows
   only from roadmap sync reconciliation against active and archived strict
   changes.

6. **Resync the roadmap** — after edits, run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
   ```
   Confirm the milestone still participates in a canonical
   `.strict-spec-driven/roadmap/` index and that its planned change state is
   consistent with active and archived strict changes.

7. **Report findings and applied fixes** — summarize in conversation the
   definition-quality and delivery-state findings, the fixes applied to each
   edited file, the planned-change paths involved, and any follow-up work
   that needs a human decision. Do not persist a separate review-report
   artifact.

## Rules

- Keep all roadmap state under `.strict-spec-driven/roadmap/`
- Review only milestones whose status is not complete; refuse completed
  milestones as out of review scope
- Apply definition fixes by direct YAML edits, then resync the roadmap; never
  leave the roadmap unsynced after edits
- Never mark planned changes or milestones complete by hand; completion state
  is owned by roadmap sync reconciliation
- Do not invent planned change state that conflicts with the strict workflow
- Keep milestone scope focused; surface boundary changes to the user instead
  of silently moving work across milestones
