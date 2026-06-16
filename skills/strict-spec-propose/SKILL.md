---
name: strict-spec-propose
description: Propose a new standalone strict change from a user request. Use when Codex should scaffold proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and optional delta artifacts under .strict-spec-driven/changes/<name>/ without sourcing work from the roadmap.
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
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
tech-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js tech-status
propose: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
generate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> <proposal|design|questions|delta-spec|delta-tech> --<named-args>
ready: node {{SKILL_DIR}}/scripts/strict-spec-driven.js ready <change-name>
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
```

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## YAML Writing Rules

- Keep artifacts in valid strict YAML structures. Do not switch to Markdown
  prose or freeform notes inside YAML files.
- If artifact fields are unclear, use `node {{SKILL_DIR}}/scripts/strict-spec-driven.js schema-show <schema-name>`;
  installed skills do not carry a `templates` directory.
- Shared schema cache root: `~/.strict-spec-schemas/`. When a YAML artifact already declares `schema_file`, resolve that relative path under the shared cache root to inspect the concrete schema file without relying on a local templates directory.
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

1. **Determine the change name** — use the user-provided kebab-case name when it
   already exists. Otherwise derive one from the request and scope. If the user
   asks to source a change from the roadmap, stop and tell them to use
   `/strict-spec-propose-from-roadmap` so standalone proposals and roadmap-backed
   proposals stay separate.

2. **Read project context, existing strict specs, and technical standards** — read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every strict YAML main spec the change is likely to touch
   - the technical standards that govern the code this change will touch by
     running `node {{SKILL_DIR}}/scripts/strict-spec-driven.js tech-status` and
     reading the relevant files under `.strict-spec-driven/tech/`. Treat every
     applicable MUST rule as a binding design constraint and every SHOULD rule
     as the default the proposal follows unless it records an explicit
     justification. If no standards apply, note that and continue.
   - Decide the relationship to each standard: most changes only *comply* with
     existing standards. If this change's intent is to *alter* a standard (add,
     modify, or retire a rule, or introduce a whole new standard), plan a delta
     tech artifact for it in step 8b instead of editing the live standard.
   - For user interface work, split it the same way: capture user-observable UI
     behavior as delta-spec requirements, capture UI engineering and design rules
     (design-system usage, styling, accessibility, i18n) as a `ui`-category
     technical standard, and govern pixel-level visual fidelity with
     visual-regression snapshots referenced from mappings rather than inlined.

3. **Scaffold the change** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
   ```
   After scaffolding, generate supported artifacts in the exact ordered steps
   below and edit the scaffolded `tasks.yaml` directly. Do not create JSON
   payload files.

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

5. **Generate `design.yaml`** — run one direct CLI invocation with named
   arguments:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> design --reset --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."
   ```
   Populate:
   - `approach`
   - `decisions`
   - `alternatives`
   - `risks`
   Make the design conform to the applicable technical standards from step 2.
   When a standard meaningfully shapes the approach, record it as a `decision`
   with a `rationale` that cites the standard. If the design must deviate from a
   SHOULD rule, record the deviation and its justification as a decision; if it
   would violate a MUST rule, record an open question in `questions.yaml`
   instead of silently breaking the standard.

6. **Edit `tasks.yaml` directly** — update the scaffolded
   `.strict-spec-driven/changes/<change-name>/tasks.yaml` according to the
   task-list schema. Keep concrete task sections for `Implementation`,
   `Testing`, and `Verification`.
   - every task needs `text` and `status`
   - testing tasks should include runnable `command` fields
   - `testing_gates.validation_task` and `testing_gates.unit_test_task` must
     point at the corresponding Testing task IDs
   - keep YAML valid and structured; do not use Markdown prose inside the file

7. **Generate `questions.yaml`** — run one direct CLI invocation for the full
   artifact. Use `--reset` when intentionally replacing scaffold content:
    ```bash
    node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> questions --reset --open <question-id> --question "..." --context "..." --resolved <question-id> --question "..." --context "..." --answer "..."
    ```
   Record open questions as structured entries under `open` using fields such
   as `id`, `question`, and `context`; the script writes the status. If
   everything is clear, leave `open: []`.

8. **Generate strict YAML delta specs** — run one direct CLI invocation per
   target spec and include all mapping paths and requirement operations needed
   for that target in the same command:
    ```bash
    node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..." --operation MODIFIED --requirement <requirement-id> --strength MUST --statement "..."
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

8b. **Generate strict YAML delta tech (only when the change alters a standard)** —
    if step 2 identified that this change must add, modify, or retire a technical
    standard, generate delta tech artifacts under
    `.strict-spec-driven/changes/<change-name>/tech/` with one direct CLI
    invocation per target standard:
    ```bash
    node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> delta-tech --target-standard <standard-id> --implementation "src/file.ts" --enforcement "eslint.config.js" --operation ADDED --rule <rule-id> --strength MUST --statement "..." --rationale "..." --method review --operation REMOVED --rule <rule-id> --reason "..."
    ```
    `ADDED`/`MODIFIED` rules require `--strength`, `--statement`, `--rationale`,
    and `--method` (one of lint, ci, test, review, manual), with optional
    `--detail`, `--example-good`, `--example-bad`, and `--exception`; `REMOVED`
    rules take only `--reason`. To introduce a brand new standard, pass
    `--target-standard <new-id> --title "..." --category <category>`; archive
    creates the standard file and merges the rules. The `mapping` (built from
    `--implementation`/`--enforcement`) is additive: archive unions these paths
    into the standard's existing mapping, so list only the paths this change adds
    rather than restating the whole set. Run
    `node {{SKILL_DIR}}/scripts/strict-spec-driven.js schema-show delta-tech` if
    you need the full contract. Leave the `tech/` directory absent when the
    change only complies with existing standards and changes none of them.

9. **Run the proposal checkpoint over generated planning artifacts** — before
   validation, perform a semantic self-check of every generated or edited file under
   `.strict-spec-driven/changes/<change-name>/` against the user request, the
   relevant main specs, and the existing project constraints. Look for vague
   requirements, inconsistent in-scope/out-of-scope/unchanged behavior, missing
   implementation or testing tasks, misplaced open questions, weak delta-spec
   scenarios, and prose that should be represented in structured mapping
   fields. Fix safe, in-scope issues immediately by rerunning the supported
   `generate` commands for script-owned artifacts and by directly editing
   `tasks.yaml` for task-list structure. Do not expand scope or answer
   unresolved human questions during this checkpoint; record ambiguity in
   `questions.yaml`.

10. **Validate proposal readiness and artifact structure** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js ready <change-name>
   ```
   Use this as the deterministic proposal-handoff check. It reports missing
   planning artifacts, open questions, delta-spec gaps, and schema issues
   without deciding product scope. Then run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   ```
   Use the command as a strict YAML schema and artifact-shape sanity check. At
   proposal time, pending-task diagnostics are expected because implementation
   has not started yet. Repair schema or structure issues before handing the
   proposal off. Do not stop for human question resolution during
   `strict-spec-propose`; leave open questions in `questions.yaml`.

11. **Hand off** — summarize the scope, key decisions, proposal checkpoint
    refinements made, task count, unchanged behavior, and any open questions. Explicitly
    recommend `/strict-spec-auto` as the primary next step. If `questions.yaml`
    still has open entries, make clear that `/strict-spec-auto` or
    `/strict-spec-apply` must surface and resolve them before coding starts.

## Rules

- Do not implement anything during proposal
- Do not pause for user confirmation or question resolution during proposal
- Keep all change artifacts in strict YAML structures
- Document ambiguity in `questions.yaml` instead of guessing
- Do not auto-invoke `/strict-spec-auto` during strict-spec-propose; hand off
  after proposal validation instead
- Keep spec-code mappings in structured `mapping` fields rather than burying
  them in prose
- Treat applicable technical standards under `.strict-spec-driven/tech/` as
  binding: design within MUST rules, follow SHOULD rules by default, and record
  any deviation or conflict as a decision or open question
- When the change must alter a standard, carry that change as a delta tech
  artifact under the change's `tech/` directory so it merges through archive;
  never edit live standards under `.strict-spec-driven/tech/` directly during a
  change
