---
name: strict-roadmap-resume
description: Resume a paused strict roadmap milestone by clearing its sticky paused field so the milestone re-derives status from planned-change state and re-enters the recommendation pipeline.
metadata:
  skill_id: strict_roadmap_resume
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user resume a strict roadmap milestone that was previously
paused with `roadmap-pause` and now needs to re-enter the recommendation
pipeline.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-status: strict-spec-cli roadmap-status
roadmap-resume: strict-spec-cli roadmap-resume <milestone-id> [--reason "..."]
roadmap-recommend: strict-spec-cli roadmap-recommend [--details] [--milestone <milestone-id>]
roadmap-sync: strict-spec-cli roadmap-sync [--fix-names]
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
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

## Resume Semantics

- A resume deletes the structured top-level `paused` field from the milestone
  artifact, optionally appends a dated `Resumed on ...` note, and lets
  `roadmap-sync` re-derive the milestone status from planned-change state
  (proposed, active, or complete). After resume, `roadmap-recommend` again
  considers the milestone's standalone planned changes as eligible candidates.
- Resume is the inverse of `roadmap-pause`. Calling resume on a milestone
  without a `paused` field exits non-zero with a deterministic diagnostic and
  does not change the milestone status.
- Resume never modifies any standalone planned-change file or any archived
  artifact. It only rewrites the milestone artifact and re-syncs the roadmap
  index.
- Resume is rejected for unknown milestone ids with a deterministic diagnostic,
  and is rejected when the roadmap already has unresolved diagnostics.

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

1. **Load milestone context** — read `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/roadmap/INDEX.yaml`, the target milestone YAML file
   under `.strict-spec-driven/roadmap/milestones/`, and the standalone
   planned-change files that the milestone owns.

2. **Confirm the milestone is paused** — run:
   ```bash
   strict-spec-cli roadmap-status
   ```
   Inspect the milestone artifact file directly to confirm it carries a
   structured top-level `paused` mapping with `status: true` (the
   `roadmap-status` summary does not surface the field). If the milestone is
   not paused, stop and tell the user — there is no pause to clear.

3. **Capture the reason and resume** — collect a short, concrete reason for the
   resume from the user if not already provided (the reason is recorded in the
   dated resume note), then run:
   ```bash
   strict-spec-cli roadmap-resume <milestone-id> --reason "<concrete unblock description>"
   ```
   Confirm the returned `resumed.previousPaused` reflects the prior pause, the
   returned `resumed.newStatus` is the derived status (proposed, active, or
   complete), and the milestone file no longer carries the `paused` field.

4. **Confirm recommendation reconsiders the milestone** — run:
   ```bash
   strict-spec-cli roadmap-recommend --details
   ```
   Verify the milestone's standalone planned changes reappear as candidates
   without a `milestone-paused` skip reason.

5. **Report the resume result** — summarize the milestone id, previous and new
   status, the previous pause field that was cleared, and the recommended next
   step (`/strict-roadmap-recommend` or `/strict-spec-propose-from-roadmap` for
   the next eligible planned change).

## Rules

- Keep the milestone rooted in `.strict-spec-driven/roadmap/`
- Resume only milestones that currently carry a `paused` field
- Never modify any standalone planned-change file during a resume
- Never edit the milestone file by hand to remove a `paused` field — use
  `roadmap-resume` so the canonical write and index sync stay deterministic
- Surface ambiguous scope to the user instead of resuming on speculation
- Treat resume as the inverse of pause; pair every resume with the unblock
  reason in the resume note
