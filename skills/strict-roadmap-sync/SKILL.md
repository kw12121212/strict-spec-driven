---
name: strict-roadmap-sync
description: Reconcile strict roadmap YAML state against active and archived strict changes.
metadata:
  skill_id: strict_roadmap_sync
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user reconcile strict roadmap state with the current strict
workflow.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
roadmap-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
roadmap-sync: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
roadmap-sync-materialize: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync --materialize-planned-changes
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

1. **Inspect current roadmap state** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
   ```
   Read diagnostics, milestone ordering, declared statuses, derived statuses,
   planned change state, and planned-change file `path` values under
   `.strict-spec-driven/roadmap/`.

2. **Fix or surface blocking roadmap shape issues** — if strict roadmap YAML is
   malformed, repair safe issues first. Stop and ask the user if the roadmap
   cannot be reconciled safely.

3. **Run sync** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
   ```
   Use this to regenerate canonical roadmap index state and reconcile milestone
   and planned change completion against active and archived strict changes.

   If diagnostics report legacy inline milestone `planned_changes`, switch to:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync --materialize-planned-changes
   ```
   This converts the inline entries into standalone planned-change files before
   reconciliation.

4. **Confirm the reconciled state** — rerun `roadmap-status` and report which
   files changed, which milestone statuses moved, and whether any diagnostics
   remain.

## Rules

- Keep all reconciliation inside `.strict-spec-driven/roadmap/`
- Do not invent new planned changes during sync
- Let strict CLI commands handle deterministic reconciliation mechanics
