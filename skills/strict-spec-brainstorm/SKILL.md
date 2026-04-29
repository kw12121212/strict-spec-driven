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
generate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> <proposal|design|tasks|questions|delta-spec> --<named-args>
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. Before
proceeding, verify that strict workflow state already exists.

## Steps

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

7. **Generate the proposal artifacts** — after scaffolding, including
   `proposal.yaml`, run direct parameterized CLI invocations. These commands
   MUST be generated and executed directly. Do not hand-author strict change
   YAML artifacts or create JSON payload files.
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..."`
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> design --reset --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."`
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."` once per target strict main spec path
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> tasks --reset --validation-task <testing-task-id> --unit-test-task <testing-task-id> --task <implementation-task-id> --section Implementation --text "..." --status pending --task <testing-task-id> --section Testing --text "..." --status pending --command "npm test" --task <verification-task-id> --section Verification --text "..." --status pending`
    - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> questions --reset --open <question-id> --question "..." --context "..."` plus any needed `--resolved` entries
    Prefer one invocation per artifact (or per target spec for delta specs) so
    the generated YAML matches the full document shape immediately.

8. **Validate artifact structure** — run:
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
