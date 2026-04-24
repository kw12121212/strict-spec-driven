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
roadmap-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
roadmap-sync: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. Before
proceeding, verify that strict workflow state already exists.

## Steps

1. **Inspect current roadmap state** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
   ```
   Read diagnostics, milestone ordering, declared statuses, derived statuses,
   and planned change state under `.strict-spec-driven/roadmap/`.

2. **Fix or surface blocking roadmap shape issues** — if strict roadmap YAML is
   malformed, repair safe issues first. Stop and ask the user if the roadmap
   cannot be reconciled safely.

3. **Run sync** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-sync
   ```
   Use this to regenerate canonical roadmap index state and reconcile milestone
   and planned change completion against active and archived strict changes.

4. **Confirm the reconciled state** — rerun `roadmap-status` and report which
   files changed, which milestone statuses moved, and whether any diagnostics
   remain.

## Rules

- Keep all reconciliation inside `.strict-spec-driven/roadmap/`
- Do not invent new planned changes during sync
- Let strict CLI commands handle deterministic reconciliation mechanics
