---
name: strict-spec-propose
description: Propose a new strict change. Scaffolds proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and an empty specs/ directory under .strict-spec-driven/changes/<name>/.
metadata:
  skill_id: strict_spec_propose
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user create a strict YAML change proposal.

Do not ask follow-up questions or require confirmation during the proposal
stage. Derive the strongest proposal you can from the user request, project
context, and existing strict specs. Record remaining ambiguity in
`questions.yaml` for `strict-spec-auto` or `strict-spec-apply` to surface
before implementation.

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

## YAML Writing Rules

- Keep artifacts in valid strict YAML structures. Do not switch to Markdown
  prose or freeform notes inside YAML files.
- Use block scalars only for free-text content. Prefer `>-` for wrapped prose
  such as longer `summary`, `approach`, `decision`, `rationale`, `question`,
  `context`, `answer`, and spec `statement` values. Use `|` only when literal
  line breaks must be preserved as part of the value.
- Quote short strings that may contain YAML-sensitive characters or ambiguous
  scalar values, including `command` strings, URLs, paths, text containing `:`
  or `#`, leading `-`, JSON-like fragments, boolean-like words, and timestamp-
  like values.
- Keep short structural fields as plain scalars unless quoting is needed for
  correctness. Do not force IDs, enums, schema identifiers, artifact types,
  task references, or similar fields into block scalars.
- Before handing off, self-check indentation, list nesting, quote closure, and
  colon spacing, then run `verify` to catch remaining schema or YAML issues.

## Steps

1. **Determine the change name** — use the user-provided kebab-case name when it
   already exists. Otherwise derive one from the request and scope.

2. **Read project context and existing strict specs** — read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every strict YAML main spec the change is likely to touch

3. **Scaffold the change** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
   ```

4. **Generate `proposal.yaml`** — run a direct CLI invocation with named
   arguments:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..."
   ```
   Populate:
   - `summary.what`
   - `summary.why`
   - `scope.in`
   - `scope.out`
   - `unchanged_behavior`
   Keep the content observable and concrete.

5. **Generate `design.yaml`** — run one or more direct CLI invocations with
   named arguments:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> design --reset --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."
   ```
   Populate:
   - `approach`
   - `decisions`
   - `alternatives`
   - `risks`

6. **Generate strict YAML delta specs** — run direct CLI invocations for each
   target spec and requirement:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> delta-spec --target-spec <spec-id> --operation ADDED --requirement <requirement-id> --strength MUST --statement "..."
   ```
   The generated files under `.strict-spec-driven/changes/<name>/specs/` should
   mirror the target main spec paths.
   - use strict YAML delta artifacts with `target_spec`, `mapping`, and
     `operations`
   - populate `operations.ADDED`, `operations.MODIFIED`, and `operations.REMOVED`
     only as needed
   - added and replacement requirements use structured fields such as `id`,
     `strength`, `statement`, `scenarios`, and ordered `steps`
   - if the change has no observable spec impact, leave the `specs/` directory
     empty rather than inventing a prose-only file

7. **Generate `tasks.yaml`** — run one direct CLI invocation per task. Use
   `--reset` on the first task command for the artifact:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> tasks --reset --section Implementation --task <task-id> --text "..." --status pending --validation-task <testing-task-id> --unit-test-task <testing-task-id>
   ```
   Create concrete task sections for
   `Implementation`, `Testing`, and `Verification`.
   - every task needs `id`, `text`, and `status`
   - testing tasks should include runnable `command` fields
   - `testing_gates.validation_task` and `testing_gates.unit_test_task` must
     point at the corresponding Testing task IDs

8. **Generate `questions.yaml`** — run direct CLI invocations for open or
   resolved questions. Use `--reset` when intentionally replacing scaffold
   content:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> questions --reset
   ```
   Record open questions as
   structured entries under `open` using fields such as `id`, `question`, and
   `context`; the script writes the status. If everything is clear, leave
   `open: []`.

9. **Validate artifact structure** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   ```
   Use the command as a strict YAML schema and artifact-shape sanity check. At
   proposal time, pending-task diagnostics are expected because implementation
   has not started yet. Repair schema or structure issues before handing the
   proposal off. Do not stop for human question resolution during
   `strict-spec-propose`; leave open questions in `questions.yaml`.

10. **Hand off** — summarize the scope, key decisions, task count, unchanged
    behavior, and any open questions. Explicitly recommend `/strict-spec-auto`
    as the primary next step. If `questions.yaml` still has open entries, make
    clear that `/strict-spec-auto` or `/strict-spec-apply` must surface and
    resolve them before coding starts.

## Rules

- Do not implement anything during proposal
- Do not pause for user confirmation or question resolution during proposal
- Keep all change artifacts in strict YAML structures
- Document ambiguity in `questions.yaml` instead of guessing
- Keep spec-code mappings in structured `mapping` fields rather than burying
  them in prose
