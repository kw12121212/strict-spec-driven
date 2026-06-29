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
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-status: strict-spec-cli roadmap-status
roadmap-recommend: strict-spec-cli roadmap-recommend
propose: strict-spec-cli propose <change-name>
generate: strict-spec-cli generate <change-name> <proposal|design|questions|delta-spec|delta-tech> --<named-args>
ready: strict-spec-cli ready <change-name>
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Roadmap Linking Rules

- Milestone ownership is defined by `planned_change.milestone`.
- Do not expect milestone files to list standalone planned-change file paths.
- Use `roadmap-status` output to locate planned-change source files; each
  `plannedChanges[]` entry reports its `path`.
- Treat filenames as helpful conventions only. `planned_change.id` and
  `planned_change.milestone` are the source of truth.
- If `roadmap-status` reports legacy inline milestone `planned_changes`, stop
  and materialize them before recommending work.

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

1. **Obtain the scripted recommendation first** — run the scripted
   recommendation command before reading broad roadmap context,
   selecting work, or opening candidate planned-change files, and treat the
   command's selected planned change as authoritative for the recommendation
   step. The scripted result already accounts for active strict change
   conflicts, invalid roadmap state, and dependency blockers. The concise JSON
   output includes a `status` field with one of three values. Branch on
   `status`:
   - `"roadmap-error"` — the roadmap has validation diagnostics. Surface the
     JSON diagnostics and stop. Suggest running `roadmap-status` for details.
   - `"no-candidate"` — the roadmap is valid but no planned change is eligible
     right now. Surface `candidateSummary` and the actionable `blockers[]`
     entries with their `skipReasons`, then stop. If the concise output is not
     enough to explain the blockers, rerun
     `strict-spec-cli roadmap-recommend --details`
     and surface the full `candidates[].skipReasons`.
   - `"recommended"` — proceed to step 2 with the returned recommendation.
   Do not manually choose among planned changes; branch on `status`
   instead of manually choosing among planned changes. Use the returned
   recommendation `path` to open the exact standalone planned-change file you
   are recommending from.

2. **Read targeted recommendation context** — after a successful scripted
   recommendation, read only the files needed to explain and scaffold that
   selected change:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/roadmap/INDEX.yaml`
   - the owning milestone YAML file for the selected planned change
   - the standalone planned-change YAML artifact reported by the
     scripted recommendation result `path`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - the strict YAML main specs the selected change is likely to touch
   - `roadmap-status` output only when needed to explain diagnostic context or
     legacy inline planned-change state
   - the owning milestone YAML file's `details` field, if present, as targeted
     planning guidance for the recommended change
   - the selected standalone planned-change artifact's `details` field, if the
     planned change comes from a split-file artifact

3. **Present a checkpoint before scaffolding** — summarize:
   - the proposed change name
   - the milestone it comes from
   - the standalone planned-change file path from the scripted recommendation result
   - why it is the best next step
   - which strict specs are likely to change
   - any open questions that would need to go into the strict change proposal
   Do not stop for human confirmation here — use the checkpoint only to explain
   the recommendation before creating the scaffold.

4. **Scaffold the recommended change immediately** — run:
   ```bash
   strict-spec-cli propose <change-name>
   ```
   Then populate normal strict change artifacts under
   `.strict-spec-driven/changes/<change-name>/` in this exact order. Generate
   supported artifacts with direct named arguments, edit scaffolded
   `tasks.yaml` directly, and do not create JSON payload files.
   - `strict-spec-cli generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..." --milestone <milestone-id> --planned-change <planned-change-id>`
   - `strict-spec-cli generate <change-name> design --reset --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."`
   - edit `.strict-spec-driven/changes/<change-name>/tasks.yaml` directly according to the task-list schema
   - `strict-spec-cli generate <change-name> questions --reset --open <question-id> --question "..." --context "..."`
   - `strict-spec-cli generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."` for each target spec
   - when the change alters a technical standard, generate delta tech under `.strict-spec-driven/changes/<change-name>/tech/` with `generate <change-name> delta-tech --target-standard <id> ...`; for user interface work, capture observable UI behavior as delta-spec requirements and UI engineering and design rules as a `ui`-category technical standard, with visual fidelity governed by visual-regression snapshots rather than inlined
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

5. **Run the proposal checkpoint and validate the proposed strict change** —
   before running `ready`, perform a proposal checkpoint over the populated
   change artifacts against the selected roadmap planned change, relevant main
   specs, technical standards, and project constraints. Check for decision-ready
   detail in scope, unchanged behavior, design decisions, task coverage,
   unresolved-question impact, delta spec scenarios, delta tech use when
   applicable, and structured mapping fields. The checkpoint should fix safe,
   in-scope documentation gaps immediately, and record real ambiguity in
   `questions.yaml` without expanding scope or answering unresolved human
   questions.

   Then run:
   ```bash
   strict-spec-cli ready <change-name>
   ```
   Use `ready` as the proposal handoff validation for deterministic blockers.
   Do not run a separate full verify command at proposal time solely to
   rediscover expected pending implementation tasks. Do not stop for human
   question resolution during `strict-roadmap-recommend`; leave open questions
   for `strict-spec-auto` or `strict-spec-apply` to surface before
   implementation.

6. **Automatically continue with implementation** — immediately invoke the
   `/strict-spec-auto <change-name>` skill with the populated change scaffold
   to carry the recommended change through the rest of the strict lifecycle
   (review, apply, verify, archive). If `questions.yaml.open` is non-empty,
   `strict-spec-auto` will surface those questions before implementation
   begins. Do not offer a choice or ask the user which workflow to use —
   invoke the `strict-spec-auto` skill via the Skill tool (do not run it as a
   bash command or raw slash command), and rely on its populated-scaffold
   resume path instead of regenerating the planning artifacts.

## Rules

- Recommend only work that already exists under `.strict-spec-driven/roadmap/`
- Keep `.strict-spec-driven/roadmap/` as the canonical home of milestone-level
  and planned-change planning metadata
- Use the standalone planned-change artifact path from the scripted
  recommendation result when opening or quoting roadmap work
- Convert exactly one planned change into one normal strict change scaffold
- Do not pause for user confirmation during the recommend step
- Do not manually choose among eligible roadmap planned changes once the
  scripted recommendation command returns a recommendation
