---
name: strict-roadmap-propose
description: Turn one strict roadmap planned change into a normal strict change proposal.
metadata:
  skill_id: strict_roadmap_propose
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user turn one strict roadmap planned change into a normal
strict change proposal.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
roadmap-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
propose: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. Before
proceeding, verify that strict workflow state already exists.

## Steps

1. **Locate the planned change in the strict roadmap** — inspect
   `.strict-spec-driven/roadmap/INDEX.yaml`, the relevant milestone YAML file,
   and the current `roadmap-status` output so the change name and owning
   milestone are unambiguous.

2. **Read strict proposal context** — read `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/specs/INDEX.yaml`, and the strict YAML main specs the
   planned change is expected to affect.

3. **Scaffold the strict change** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
   ```
   Use the planned change ID as the strict change name.

4. **Fill the normal strict change artifacts** — populate `proposal.yaml`,
   `design.yaml`, `tasks.yaml`, `questions.yaml`, and any strict YAML delta
   specs under `.strict-spec-driven/changes/<change-name>/specs/`.

5. **Validate the result** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   ```
   Fix safe proposal-structure issues immediately and keep unresolved ambiguity
   in `questions.yaml` instead of guessing.

## Rules

- Keep the roadmap source of truth in `.strict-spec-driven/roadmap/`
- Use the roadmap planned change ID as the strict change identity
- Do not duplicate whole milestone plans inside the change artifacts
