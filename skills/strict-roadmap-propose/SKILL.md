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
generate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> <proposal|design|tasks|questions|delta-spec> <input-json>
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

4. **Read the owning milestone's `details` field** — after scaffolding, read
   the owning milestone YAML file and check for a `details` field. If present,
   extract the portions relevant to the selected planned change and use them as
   targeted planning guidance when populating the change artifacts. Do not copy
   the full milestone plan into change artifacts — only extract guidance
   relevant to this one planned change. If `details` is absent, proceed normally.

5. **Generate the normal strict change artifacts** — write compact JSON input
   files and run the artifact-specific commands:
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> proposal <input-json>`
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> design <input-json>`
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> tasks <input-json>`
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> questions <input-json>`
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> delta-spec <input-json>` for each target spec under `.strict-spec-driven/changes/<change-name>/specs/`

6. **Validate the result** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   ```
   Fix safe proposal-structure issues immediately and keep unresolved ambiguity
   in `questions.yaml` instead of guessing.

## Rules

- Keep the roadmap source of truth in `.strict-spec-driven/roadmap/`
- Use the roadmap planned change ID as the strict change identity
- Do not duplicate whole milestone plans inside the change artifacts
