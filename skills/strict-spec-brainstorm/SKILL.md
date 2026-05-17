---
name: strict-spec-brainstorm
description: Discuss and shape a strict YAML change from a rough idea, then after explicit confirmation scaffold the proposal artifacts.
metadata:
  skill_id: strict_spec_brainstorm
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user turn an early-stage idea into a strict YAML change
proposal.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
propose: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
generate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> <proposal|design|questions|delta-spec> --<named-args>
ready: node {{SKILL_DIR}}/scripts/strict-spec-driven.js ready <change-name>
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. If it is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Steps

Before any other step, confirm `.strict-spec-driven/` exists at the project
root. If it is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

1. **Start from the idea, not the artifact list** — ask the user what they want
   to achieve, what problem they are trying to solve, and any known constraints
   or preferences. Do not require a change name up front.

2. **Read strict project context and existing specs early** — before narrowing
   scope, read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every relevant strict YAML main spec file the idea appears likely to touch

3. **Brainstorm until the change is decision-ready** — use the discussion to
   converge on:
   - the desired outcome and user-visible behavior
   - what is in scope and explicitly out of scope
   - important tradeoffs, constraints, risks, and unchanged behavior
   - which existing strict YAML spec files will likely be modified, or whether a
     new strict spec area is needed
   - any questions that still need a human answer before implementation

4. **Suggest the change name** — once the idea is coherent enough, propose a
   short kebab-case change name. If the user already provided a valid name, keep
   it. Otherwise derive one from the agreed strict workflow scope.

5. **Present a proposal checkpoint** — before creating any files, summarize:
   - the proposed change name
   - the goal and scope
   - the main strict spec areas expected to change
   - key decisions or tradeoffs already settled
   - any unresolved questions that would go into `questions.yaml`

   Then ask for explicit confirmation. If the user wants revisions, continue the
   brainstorm and re-summarize until confirmed.

6. **Scaffold the change after confirmation** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
   ```
   This creates `.strict-spec-driven/changes/<name>/` with strict planning
   artifacts and an empty `specs/` directory for strict YAML delta files.

7. **Populate `proposal.yaml` and related artifacts step by step** — after
   scaffolding, follow this exact order. Generate supported artifacts with
   direct parameterized CLI invocations, edit scaffolded `tasks.yaml` directly,
   and do not create JSON payload files.
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..."`
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> design --reset --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."`
    - edit `.strict-spec-driven/changes/<change-name>/tasks.yaml` directly according to the task-list schema
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> questions --reset --open <question-id> --question "..." --context "..."` plus any needed `--resolved` entries
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."` once per target strict main spec path
    Prefer one invocation per supported generated artifact (or per target spec
    for delta specs) so generated YAML matches the full document shape
    immediately.

8. **Validate proposal readiness and artifact structure** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js ready <change-name>
   ```
   Use this as the deterministic proposal-handoff check. It reports structural
   blockers without asking the CLI to decide product scope or requirement
   content. Then run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   ```
   Use this as a strict YAML schema and artifact-shape check. At proposal time,
   pending-task diagnostics are expected because implementation has not started
   yet. Fix safe structure issues before handing the proposal off.

9. **Hand off** — summarize the strict change scope, key decisions, task count,
   unchanged behavior, and any open questions. If `questions.yaml` still has
   open entries, make clear that implementation must stop for explicit user
   resolution before coding starts.

## Rules

- Do not implement code during brainstorming
- Do not scaffold proposal artifacts until the user explicitly confirms the
  brainstorm summary and change name
- Keep all planning artifacts in strict YAML structures under
  `.strict-spec-driven/`
- Record ambiguity in `questions.yaml` instead of guessing silently
- Keep spec-code mappings in structured YAML mapping fields, not prose
