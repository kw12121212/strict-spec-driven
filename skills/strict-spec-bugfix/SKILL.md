---
name: strict-spec-bugfix
description: Fix a known bug through a narrow strict YAML change. Use when Codex has a concrete defect, expected behavior, and enough reproduction evidence to implement a minimal fix with regression coverage; route unclear, unreproduced, browser/API/Electron, or CDP-access investigations to strict-spec-debug-session first, and route open-ended product ideas to strict-spec-brainstorm or strict-spec-propose.
metadata:
  skill_id: strict_spec_bugfix
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are fixing a known bug through the strict workflow.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
tech-status: strict-spec-cli tech-status
propose: strict-spec-cli propose <change-name>
generate: strict-spec-cli generate <change-name> <proposal|design|questions|delta-spec|delta-tech> --<named-args>
ready: strict-spec-cli ready <change-name>
next: strict-spec-cli next <change-name>
apply: strict-spec-cli apply <change-name>
verify: strict-spec-cli verify <change-name>
verify-spec-mappings: strict-spec-cli verify-spec-mappings
archive: strict-spec-cli archive <change-name>
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## YAML Writing Rules

- Keep strict artifacts in valid YAML structures at every stage. Do not replace
  structured fields with Markdown prose.
- If artifact fields are unclear, use `strict-spec-cli schema-show <schema-name>`;
  installed skills do not carry a `templates` directory.
- Shared schema cache root: `~/.strict-spec-schemas/`. When a YAML artifact already declares `schema_file`, resolve that relative path under the shared cache root to inspect the concrete schema file without relying on a local templates directory.
- Use block scalars only for free-text content. Prefer `>-` for wrapped prose
  such as longer `summary`, `approach`, `decision`, `rationale`, `question`,
  `context`, `answer`, and spec `statement` values. Use `|` only when literal
  line breaks must be preserved.
- Quote short strings that may contain YAML-sensitive characters or ambiguous
  scalar values, including `command` strings, URLs, paths, text containing `:`
  or `#`, leading `-`, JSON-like fragments, boolean-like words, and timestamp-
  like values.
- Keep short structural fields as plain scalars unless quoting is needed for
  correctness. Do not force IDs, enums, schema identifiers, artifact types,
  task references, or similar fields into block scalars.
- Before moving between workflow stages, self-check indentation, list nesting,
  quote closure, and colon spacing, then use the documented verification
  commands to catch remaining schema or YAML issues.

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

1. **Confirm bugfix fit** — use this skill only when the issue is a known bug:
   observed incorrect behavior, expected behavior, affected path or component,
   and reproduction evidence or a credible failing assertion are available. If
   the issue cannot be reproduced, needs web/API/Electron/CDP investigation, or
   needs evidence gathering before code changes, stop and recommend
   `strict-spec-debug-session`. If the request is a new product behavior or a
   broad design decision, stop and recommend `strict-spec-brainstorm` or
   `strict-spec-propose`.

2. **Reset context from targeted files** — treat prior chat context as stale
   unless it has been revalidated from current repository state. Read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every strict YAML main spec the bug appears to violate or touch
   - the relevant implementation and test files
   - the applicable technical standards by running
     `strict-spec-cli tech-status` and reading the relevant files under
     `.strict-spec-driven/tech/`

3. **Reproduce before fixing** — prove the failure before making production
   code changes. Reading code and inferring a likely defect is not enough to
   edit production code.
   - Use an existing failing test, a new minimal failing regression test, or a
     deterministic command that demonstrates the defect.
   - If reproduction is impossible in the local environment because of missing
     dependencies, credentials, fixtures, services, platform state, or unclear
     reproduction steps, record the blocker in `questions.yaml` and stop before
     implementation.
   - Do not use this skill for unclear or unreproduced issues. Route evidence
     gathering to `strict-spec-debug-session` instead of making a source-level
     fix from code inspection alone.

4. **Propose or resume a narrow change** — derive a short kebab-case change
   name from the defect, usually starting with `fix-`. If the change does not
   exist, run:
   ```bash
   strict-spec-cli propose <change-name>
   ```
   If a populated change already exists, resume it without regenerating
   planning artifacts.

5. **Populate bugfix planning artifacts** — for new or empty scaffolds, generate
   supported artifacts in this order and keep every artifact scoped to the bug.
   - `proposal.yaml`: state the observed bug, expected behavior, why the
     current behavior violates a strict spec or intended contract, in-scope
     affected paths, explicit out-of-scope adjacent issues, and unchanged
     behavior.
   - `design.yaml`: record the minimal fix strategy, why the fix belongs at the
     selected layer, and any risk to unchanged behavior.
   - `tasks.yaml`: use concrete sections for Reproduction, Implementation,
     Testing, and Verification. Include a failing-regression-test or equivalent
     deterministic reproduction task before the production fix. Testing tasks
     must include runnable `command` fields.
   - `questions.yaml`: leave `open: []` only when reproduction, scope, expected
     behavior, and regression validation are all clear. Otherwise record the
     missing decision and stop before implementation.
   - delta specs: prefer `MODIFIED` operations when the bug corrects an existing
     requirement; use `ADDED` only when the expected behavior is not already
     represented. Leave `specs/` empty only for a purely internal defect with no
     observable spec impact.

6. **Run the proposal checkpoint** — before implementation, semantically check
   every generated or edited file under `.strict-spec-driven/changes/<change-name>/`
   against the known bug, reproduction evidence, expected behavior, relevant
   main specs, applicable technical standards, unchanged behavior, task
   coverage, unresolved-question impact, delta spec scenarios, delta tech use
   when applicable, and structured mapping fields. The checkpoint should fix safe, in-scope
   documentation gaps immediately. Do not expand scope or answer unresolved
   human questions silently.

7. **Validate readiness** — run:
   ```bash
   strict-spec-cli ready <change-name>
   ```
   If you use `verify` before implementation, treat pending-task diagnostics as
   expected. If `questions.yaml.open` is not empty, explain each blocker,
   recommend concrete answers or options with tradeoffs, and stop.

8. **Implement the minimal fix** — work through `tasks.yaml` in order.
   - Create or confirm the failing regression evidence before production edits.
   - Read the relevant code before editing it.
   - Make the smallest production change that satisfies the expected behavior.
   - Preserve every `proposal.yaml.unchanged_behavior` item.
   - Follow applicable technical standards: never violate a MUST rule and
     follow SHOULD rules unless `design.yaml` records a justified deviation.
   - Do not opportunistically refactor, rename, reformat, or fix adjacent bugs
     unless required for the target bugfix.

9. **Mark tasks only after completion** — after each task is actually complete,
   run:
   ```bash
   strict-spec-cli apply <change-name>
   ```
   Confirm the returned task matches the work just completed. Never run
   `apply` as a read-only status command because it mutates `tasks.yaml`.

10. **Run regression evidence** — complete every Testing task by running its
    `command`. The targeted regression must fail before the fix and pass after
    the fix. If the before/after evidence cannot be produced locally, leave the
    implementation unstarted or unarchived and record the blocker instead of
    claiming the bug is fixed. Then run the configured complete project-level
    regression command from `.strict-spec-driven/config.yaml` before archive.

11. **Verify and review before archive** — run:
    ```bash
    strict-spec-cli verify <change-name>
    strict-spec-cli verify-spec-mappings
    ```
    Read the changed implementation, tests, strict artifacts, relevant main
    specs, and tracked diff yourself. Check correctness, spec alignment,
    unchanged behavior, regression assertions, error handling, and technical
    standard compliance. Automatically fix safe in-scope review findings and
    rerun strict verification plus the configured complete regression command
    after review-time changes. Do not call or rely on a `strict-spec-cli review` command.

12. **Archive only when clean** — archive only after strict verification,
    mapping verification, direct review, targeted regression, and complete
    regression evidence pass:
    ```bash
    strict-spec-cli archive <change-name>
    ```
    Summarize the fixed bug, regression evidence, updated specs, archive
    destination, and any follow-up that remains outside the bugfix scope.

## Harness Guidance

When `.strict-spec-driven/harness.yaml` exists and reproduction or verification
requires starting declared components:

1. Run `harness-plan` first and explain the declared long-running commands
   before starting them.
2. Use `harness-start` to start declared executable components rather than
   guessing undeclared startup steps.
3. Use declared harness targets from the plan when reproducing the bug.
4. Capture evidence consistently using declared evidence labels and harness
   session evidence identifiers.
5. Run `harness-stop` to stop all components you started before finishing.

## Rules

- Use this skill for known bug fixes, not open-ended design or investigation.
- Reproduce before fixing; code inspection alone is not sufficient evidence to
  modify production code.
- Use regression evidence that fails before the fix and passes after it.
- Keep the change narrow and preserve documented unchanged behavior.
- Do not implement adjacent fixes or refactors unless required for the target bug.
- Stop for explicit human input when reproduction, expected behavior, or scope is ambiguous.
- Keep strict YAML artifacts structured and keep implementation/test mappings in structured fields, not prose.
- Archive only after strict verification, mapping verification, direct review, targeted regression, and complete project regression evidence pass.
