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
generate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> <proposal|design|questions|delta-spec> --<named-args>
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

5. **Populate the normal strict change artifacts step by step** — generate
   supported artifacts with direct parameterized CLI invocations, edit
   scaffolded `tasks.yaml` directly, and do not create JSON payload files.
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..." --milestone <milestone-id> --planned-change <planned-change-id>`
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> design --reset --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."`
   - edit `.strict-spec-driven/changes/<change-name>/tasks.yaml` directly according to the task-list schema
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> questions --reset --open <question-id> --question "..." --context "..."`
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."` for each target spec under `.strict-spec-driven/changes/<change-name>/specs/`
   Prefer one invocation per supported generated artifact (or per target spec
   for delta specs).

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
