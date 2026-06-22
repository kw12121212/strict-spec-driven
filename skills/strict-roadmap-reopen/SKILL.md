---
name: strict-roadmap-reopen
description: Reopen a completed strict roadmap milestone when gaps are discovered, preserving completed planned changes and adding follow-up work as new planned changes.
metadata:
  skill_id: strict_roadmap_reopen
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user reopen a strict roadmap milestone that was marked
complete but has discovered gaps.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
roadmap-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
roadmap-reopen: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-reopen <milestone-id> [--reason "..."]
roadmap-sync: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
```

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Roadmap Linking Rules

- Milestone ownership for standalone work items is defined by
  `planned_change.milestone`.
- Do not expect milestone files to list standalone planned-change file paths.
- Use `roadmap-status` output to locate planned-change source files; each
  `plannedChanges[]` entry reports its `path`.
- Treat filenames as helpful conventions only. `planned_change.id` and
  `planned_change.milestone` are the source of truth.

## Reopen Semantics

- A reopen flips the milestone's declared `status` from `complete` to `active`
  and appends a dated reopen note recording the reason.
- Completed planned changes are immutable. The reopen never edits, rewrites, or
  reorders a planned change whose derived state is `archived`/`complete`. They
  stay frozen as the historical record of what shipped.
- Follow-up work for the discovered gaps is added as NEW standalone
  planned-change artifacts under `.strict-spec-driven/roadmap/planned-changes/`,
  each owned by the same milestone via `planned_change.milestone`. Never fold
  follow-up work back into an existing completed planned change.
- The milestone status `planned` is an accepted alias of `proposed`; the two are
  interchangeable for incomplete milestones. Reopen targets `active`, not
  `planned` or `proposed`.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Load milestone context** — read `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/roadmap/INDEX.yaml`, the target milestone YAML file
   under `.strict-spec-driven/roadmap/milestones/`, and the strict specs the
   milestone's planned changes affected.

2. **Confirm the milestone is complete** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
   ```
   Use the milestone's `declaredStatus` and `derivedStatus`, plus each owned
   planned change's `state`, to confirm the milestone is actually `complete`
   and that the gap is real (not a stale status). If the milestone is already
   `active`, `blocked`, `proposed`, or `planned`, stop and tell the user — there
   is no completed milestone to reopen; use `/strict-roadmap-milestone` or
   `/strict-roadmap-plan` to add the follow-up work directly.

3. **Capture the reason and reopen** — collect a short, concrete reason for the
   reopen from the user if not already provided, then run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-reopen <milestone-id> --reason "<concrete gap description>"
   ```
   Confirm the returned `reopened.newStatus` is `active`, the reopen note was
   appended, and `frozenPlannedChanges` lists every completed planned change
   that must remain untouched.

4. **Add follow-up planned changes as new work** — for each gap discovered, add a
   NEW standalone planned-change artifact under
   `.strict-spec-driven/roadmap/planned-changes/` named
   `<milestone-id>-<new-planned-change-id>.yaml`. Populate `summary`,
   `details`, `depends_on`, and `status: planned` so the follow-up work is
   executable without re-deriving intent. Prefer `/strict-roadmap-plan` or
   direct structured YAML edits for this step. Never edit an existing completed
   planned-change file; create new ones only.

5. **Resync the roadmap** — after adding the new planned changes, run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
   ```
   Confirm the milestone participates in the canonical
   `.strict-spec-driven/roadmap/` index, the new planned changes are owned by
   the reopened milestone, and the frozen completed planned changes are still
   marked `complete`.

6. **Report the reopen result** — summarize the milestone id, the previous and
   new status, the reopen note, the frozen completed planned changes (unchanged),
   the newly added follow-up planned changes with their file paths, and the
   recommended next step (`/strict-roadmap-recommend` or
   `/strict-spec-propose-from-roadmap` for the first new planned change).

## Rules

- Keep the milestone rooted in `.strict-spec-driven/roadmap/`
- Reopen only milestones whose status is `complete`
- Completed planned changes are immutable; never edit, rewrite, or restate them
- Add follow-up work only as new standalone planned-change artifacts
- Never hand-edit milestone or planned-change completion status; rely on
  `roadmap-reopen` and `roadmap-sync` for status transitions
- Do not invent planned change state that conflicts with the strict workflow
- Keep milestone scope focused; surface boundary changes to the user instead
  of silently moving work across milestones
