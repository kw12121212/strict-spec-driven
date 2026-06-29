---
name: strict-roadmap-archive
description: Archive completed strict roadmap milestones and their completed planned changes, defaulting to every unarchived completed milestone.
metadata:
  skill_id: strict_roadmap_archive
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user archive completed strict roadmap milestones.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-driven check-workflow-state
roadmap-status: strict-spec-driven roadmap-status
roadmap-archive: strict-spec-driven roadmap-archive [milestone-id]
```

## Prerequisites

Run `strict-spec-driven check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Archive Semantics

- `roadmap-archive` with no `milestone-id` must default to all unarchived
  milestones in `.strict-spec-driven/roadmap/`.
- The command archives only milestones whose derived status is complete.
- The command moves each archived milestone and its completed standalone
  planned-change YAML files into `.strict-spec-driven/roadmap/archive/`.
- Incomplete milestones and incomplete planned changes remain in the active
  roadmap and are reported as skipped.
- The command rewrites the active roadmap index after successful archive moves.

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

1. **Inspect roadmap state** — run:
   ```bash
   strict-spec-driven roadmap-status
   ```
   Confirm the roadmap is valid, read milestone `declaredStatus` and
   `derivedStatus`, and identify any planned changes that are still missing,
   active, or ambiguous.

2. **Archive completed milestones** — if the user named a milestone, run:
   ```bash
   strict-spec-driven roadmap-archive <milestone-id>
   ```
   Otherwise run:
   ```bash
   strict-spec-driven roadmap-archive
   ```
   With no milestone id, the command must default to all unarchived milestones
   and archive only milestones whose derived status is complete.

3. **Review the result** — read the JSON output. Confirm
   `archivedMilestones` contains only completed milestones, each archived
   milestone lists its completed standalone planned-change files, and
   `skippedMilestones` explains any incomplete work that remained active.

4. **Confirm active roadmap state** — rerun:
   ```bash
   strict-spec-driven roadmap-status
   ```
   Confirm the active roadmap no longer lists archived milestones and that
   remaining milestones still report valid state.

## Rules

- Keep all archive mechanics inside `.strict-spec-driven/roadmap/`.
- Never archive a milestone unless its derived status is complete.
- Never move pending, active, missing, or ambiguous planned changes.
- Treat completed standalone planned-change files as history attached to the
  archived milestone.
- Do not hand-edit completion status to make a milestone archivable; use
  strict change archive and `roadmap-sync` first.
