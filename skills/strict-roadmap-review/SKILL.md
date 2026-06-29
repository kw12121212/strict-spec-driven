---
name: strict-roadmap-review
description: Review all incomplete strict roadmap milestones and directly apply fixes that make their definitions concrete and executable.
metadata:
  skill_id: strict_roadmap_review
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are reviewing all incomplete strict roadmap milestones and directly
applying fixes to their definitions.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-driven check-workflow-state
roadmap-generate: strict-spec-driven roadmap-generate milestone --<named-args>
roadmap-status: strict-spec-driven roadmap-status
roadmap-overview: strict-spec-driven roadmap-overview
roadmap-sync: strict-spec-driven roadmap-sync
```

## Prerequisites

Run `strict-spec-driven check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Review Scope

- This skill reviews all milestones whose status is not complete. Completed
  milestones are historical record and out of review scope; do not edit them.
- Milestone ownership for standalone work items is defined by
  `planned_change.milestone`. Use `roadmap-status` output to locate
  planned-change source files; each `plannedChanges[]` entry reports its
  `path`. Treat filenames as helpful conventions only.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

Before any other step, run `strict-spec-driven check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Load roadmap context** — read `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/roadmap/INDEX.yaml`, every milestone YAML file under
   `.strict-spec-driven/roadmap/milestones/`, and the strict specs the
   incomplete milestones are likely to affect.

2. **Check current roadmap state** — run:
   ```bash
   strict-spec-driven roadmap-status
   ```
   and, when wider context helps, `roadmap-overview`. Use each milestone's
   declared status, derived status, planned change state, planned-change
   paths, and any diagnostics as the deterministic facts for the review.
   Identify every milestone whose status is not complete and process them in
   roadmap order. If every milestone is complete, stop here and report that
   there are no incomplete milestones in review scope.

3. **Assess definition quality** — for each incomplete milestone, review the
   milestone for goal clarity, verifiable `done_criteria`, coherent `scope`,
   `dependencies`, and `risks`, and planned-change coverage of the milestone
   goal. Review each owned planned change for missing or vague `details` that
   would block turning it into an executable strict change proposal.

4. **Assess delivery state** — for each incomplete milestone, compare its
   declared status with the derived status and per-planned-change state
   reported by `roadmap-status`, including archived strict change evidence,
   and identify gaps between definition and delivery.

5. **Apply fixes directly** — use roadmap-generate milestone for milestone YAML
   shape and milestone-field fixes under `.strict-spec-driven/roadmap/`:
   ```bash
   strict-spec-driven roadmap-generate milestone --id <milestone-id> --title "..." --goal "..." --scope-in "..." --scope-out "..." --done "..." --dependency "..." --risk "..." --note "..." --details "..."
   ```
   Use `--reset` only when you intentionally replace existing milestone
   planning fields. Standalone planned-change files remain edited directly by
   this skill, so planned-change `details` can be tightened without introducing
   planned-change CLI generation. Tighten vague wording into verifiable
   statements; elaborate planned-change details until each one carries enough
   executable planning context to propose without re-deriving intent. Never
   hand-edit completion status: milestone and planned-change completion flows
   only from roadmap sync reconciliation against active and archived strict
   changes.

6. **Resync the roadmap** — after edits, run:
   ```bash
   strict-spec-driven roadmap-sync
   ```
   Confirm every reviewed milestone still participates in a canonical
   `.strict-spec-driven/roadmap/` index and that planned change state is
   consistent with active and archived strict changes.

7. **Report findings and applied fixes** — summarize in conversation the
   definition-quality and delivery-state findings for each incomplete
   milestone, the fixes applied to each edited file, the planned-change paths
   involved, and any follow-up work that needs a human decision. Do not persist
   a separate review-report artifact.

## Rules

- Keep all roadmap state under `.strict-spec-driven/roadmap/`
- Review all milestones whose status is not complete; refuse completed
  milestones as out of review scope
- Apply milestone definition fixes through `roadmap-generate milestone`, edit
  standalone planned-change detail directly, then resync the roadmap; never
  leave the roadmap unsynced after edits
- Use `roadmap-generate milestone` for milestone YAML shape; standalone
  planned-change files remain edited directly
- Never mark planned changes or milestones complete by hand; completion state
  is owned by roadmap sync reconciliation
- Do not invent planned change state that conflicts with the strict workflow
- Keep milestone scope focused; surface boundary changes to the user instead
  of silently moving work across milestones
