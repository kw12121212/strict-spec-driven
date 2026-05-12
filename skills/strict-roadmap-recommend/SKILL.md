---
name: strict-roadmap-recommend
description: Recommend the next strict roadmap-backed change, then scaffold it as a normal strict change without extra user interaction.
metadata:
  skill_id: strict_roadmap_recommend
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user choose the next strict roadmap-backed change and turn
that recommendation into a normal strict change without pausing for human
confirmation during the recommend step.

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

## Roadmap Linking Rules

- Milestone ownership is defined by `planned_change.milestone`.
- Do not expect milestone files to list standalone planned-change file paths.
- Use `roadmap-status` output to locate planned-change source files; each
  `plannedChanges[]` entry reports its `path`.
- Treat filenames as helpful conventions only. `planned_change.id` and
  `planned_change.milestone` are the source of truth.
- If `roadmap-status` reports legacy inline milestone `planned_changes`, stop
  and materialize them before recommending work.

## Steps

1. **Read roadmap context first** — read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/roadmap/INDEX.yaml`
   - the milestone YAML files relevant to the current strict roadmap phase
   - standalone planned-change YAML artifacts under
     `.strict-spec-driven/roadmap/planned-changes/`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - the strict YAML main specs the candidate change is likely to touch
   - the current `roadmap-status` output
   - the owning milestone YAML file's `details` field, if present, as targeted
     planning guidance for the recommended change
   - the selected standalone planned-change artifact's `details` field, if the
     planned change comes from a split-file artifact

2. **Choose the next candidate from existing planned changes** — recommend only a
   planned change that already exists as a standalone planned-change artifact in
   the strict roadmap. Use `roadmap-status` output to avoid selecting planned
   changes with unsatisfied cross-file dependencies, invalid milestone
   references, duplicate identities, or active strict change conflicts. These
   active strict change conflicts mean another active strict change already
   claims the same planned-change identity. Choose a planned change whose
   dependencies are complete and whose workflow state is missing, not active or
   archived. Use the reported `plannedChanges[].path` to open the exact source
   file you are recommending from.

3. **Present a checkpoint before scaffolding** — summarize:
   - the proposed change name
   - the milestone it comes from
   - the standalone planned-change file path from `roadmap-status`
   - why it is the best next step
   - which strict specs are likely to change
   - any open questions that would need to go into the strict change proposal
   Do not stop for human confirmation here — use the checkpoint only to explain
   the recommendation before creating the scaffold.

4. **Scaffold the recommended change immediately** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
   ```
   Then populate normal strict change artifacts under
   `.strict-spec-driven/changes/<change-name>/` in this exact order. Generate
   supported artifacts with direct named arguments, edit scaffolded
   `tasks.yaml` directly, and do not create JSON payload files.
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..." --milestone <milestone-id> --planned-change <planned-change-id>`
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> design --reset --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."`
   - edit `.strict-spec-driven/changes/<change-name>/tasks.yaml` directly according to the task-list schema
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> questions --reset --open <question-id> --question "..." --context "..."`
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."` for each target spec
   Prefer one invocation per supported generated artifact (or per target spec
   for delta specs).
   Do this without copying full milestone-level planning metadata into the
   change. If the selected planned change is a standalone artifact, keep that
   artifact as the canonical home for its status, summary, dependencies, and
   details. If the owning milestone has a `details` field or the standalone
   planned-change artifact has a `details` field, extract only the portions
   relevant to the selected planned change and use them as targeted planning
   guidance when generating the change artifacts. Do not copy the full milestone
   plan or the full planned-change details — only extract guidance relevant to
    this one planned change. If `details` is absent, proceed normally.

5. **Validate the proposed strict change** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   ```
   Fix safe proposal-shape issues and record real ambiguity in
   `questions.yaml`. Do not stop for human question resolution during
   `strict-roadmap-recommend`; leave those questions for `strict-spec-auto` or
   `strict-spec-apply` to surface before implementation.

6. **Automatically continue with implementation** — immediately invoke the
   `strict-spec-auto` skill to carry the recommended change through the rest of
   the strict lifecycle (review, apply, verify, archive). If
   `questions.yaml.open` is non-empty, `strict-spec-auto` will surface those
   questions before implementation begins. Do not offer a choice or ask the
   user which workflow to use — invoke the `strict-spec-auto` skill via the
   Skill tool (do not run it as a bash command or raw slash command).

## Rules

- Recommend only work that already exists under `.strict-spec-driven/roadmap/`
- Keep `.strict-spec-driven/roadmap/` as the canonical home of milestone-level
  and planned-change planning metadata
- Use the standalone planned-change artifact path from `roadmap-status` when
  opening or quoting roadmap work
- Convert exactly one planned change into one normal strict change scaffold
- Do not pause for user confirmation during the recommend step
