---
name: strict-spec-bugfix
description: Fix a known bug through a narrow strict YAML change. Use when a concrete defect, expected behavior, and enough reproduction evidence are in hand to implement a minimal fix with regression coverage; route unclear, unreproduced, or evidence-gathering investigations to strict-spec-brainstorm first, and route open-ended product ideas to strict-spec-brainstorm or strict-spec-propose.
metadata:
  skill_id: strict_spec_bugfix
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are fixing a known bug through the strict workflow.

This skill owns the bugfix-specific discipline — confirming the issue is a known
bug, reproducing it before touching production code, keeping the fix minimal,
and proving it with before-and-after regression evidence. The general workflow
procedures it sits on top of are owned by the skills listed under Delegated
Procedures below, and this skill does not restate them.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
tech-status: strict-spec-cli tech-status
lesson-status: strict-spec-cli lesson-status [--category <category>]
lesson-create: strict-spec-cli lesson-create --title <text> --category <category> --context <text> --observation <text> --takeaway <text> --applies-when <text> --origin <text> --evidence <text>
lesson-edit: strict-spec-cli lesson-edit <lesson-id> --origin <text> --evidence <text>
propose: strict-spec-cli propose <change-name>
generate: strict-spec-cli generate <change-name> <proposal|design|questions|tasks|delta-spec|delta-tech> --<named-args>
ready: strict-spec-cli ready <change-name>
next: strict-spec-cli next <change-name>
apply: strict-spec-cli apply <change-name>
verify: strict-spec-cli verify <change-name>
archive: strict-spec-cli archive <change-name>
```

## YAML Writing Rules

- Keep strict artifacts in valid YAML structures at every stage. Do not replace
  structured fields with Markdown prose.
- If artifact fields are unclear, use `strict-spec-cli schema-show <schema-name>`;
  installed skills do not carry a `templates` directory.
- Shared schema cache root: `~/.strict-spec-schemas/`. When a YAML artifact already declares `schema_file`, resolve that relative path under the shared cache root to inspect the concrete schema file without relying on a local templates directory.
- If a valid artifact example would clarify the shape, use
  `strict-spec-cli sample-show <sample-name>`; installed skills do not rely on a
  local `examples` directory.
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

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `change-planning-state`, `change-delta-state`,
`spec-state`, `tech-state`, `lessons-state`. Before the first mutation run
`strict-spec-cli yaml-authoring-protocol <artifact-kind>` for each of them:
that command reports the ordered authoring steps, the owning command for each
operation, and the bundled schema and example keys with their cache-resolved
paths, bound to the artifact kind and current where a copy would go stale.
Validate the result with `strict-spec-cli verify <change-name>`,
`strict-spec-cli lesson-status`.

**Stop rather than edit YAML directly.** When a required command, argument, or
artifact kind is unavailable, stop and report the missing capability. Editing
the YAML directly, writing a raw payload, or scripting around the CLI is never
an available fallback, and an unavailable command is a reason to stop rather
than a reason to improvise.

## Preferred Human Language

Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` —
the user's common human language, not a programming language — for all
user-facing and generated operator-facing text, unless that file is absent or
the active user message asks otherwise.

## Delegated Procedures

Each procedure below is owned by the skill named beside it. That skill's
guidance is authoritative for it, and this skill does not restate it. Follow the
owning skill's procedure at the step that needs it; how it is loaded is whatever
the running harness provides.

- requirement-interrogation: owned by `strict-spec-propose`
- change-intake-gate: owned by `strict-spec-propose`
- spec-artifact-routing: owned by `strict-spec-propose`
- delta-artifact-authoring: owned by `strict-spec-propose`
- implementation-order: owned by `strict-spec-apply`
- lesson-outcome: owned by `strict-spec-review`

Delegation moves where a procedure is stated, never whether it runs. Every gate
this skill declares below still binds, and a delegated procedure that cannot be
followed stops the run exactly as an inline one would.

What a bugfix adds to those procedures stays here, at the step that needs it.
The one that shapes every later step: interrogate the defect's real impact and
the outcome the requester expects, not the patch you already have in mind.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Confirm bugfix fit** — use this skill only when the issue is a known bug:
   observed incorrect behavior, expected behavior, affected path or component,
   and reproduction evidence or a credible failing assertion are available. If
   the issue cannot be reproduced or needs evidence gathering before code
   changes, stop and recommend `strict-spec-brainstorm`, which interrogates the
   problem before any scope is committed. If the request is a new product
   behavior or a broad design decision, stop and recommend
   `strict-spec-brainstorm` or `strict-spec-propose`.

2. **Reset context from targeted files** — treat prior chat context as stale
   unless it has been revalidated from current repository state. Read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every strict YAML main spec the bug appears to violate or touch, if any;
     for a purely internal defect, confirm from the spec index that no main spec
     requirement is implicated instead of forcing one
   - the relevant implementation and test files
   - the applicable technical standards by running
     `strict-spec-cli tech-status` and reading the relevant files under
     `.strict-spec-driven/tech/`
   - the recorded experience that may bear on this defect by running
     `strict-spec-cli lesson-status --category <category>` for the category matching the failing
     area and matching its `applies_when` conditions
     against the failing area. Lessons carry no MUST or SHOULD strength; treat
     them as warnings worth checking, and weight a lesson with several
     occurrences because it has bitten this project repeatedly.
   Use this evidence to run the delegated change-intake-gate procedure before
   asking the human or continuing into implementation.

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
     gathering to `strict-spec-brainstorm` instead of making a source-level fix
     from code inspection alone.

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
     must include runnable `command` fields. For technical-only bugfixes,
     include the concrete scripts, tooling, generated assets, documentation, or
     skill-prompt edits in scope; include validation, strict `ready`/`verify`,
     and archive-readiness or archive-merge checks when relevant.
     The reproduction task must come first in list order, so place a task with
     `--before <task-id>` or `--after <task-id>` instead of letting it append;
     task order is the order `apply` walks, so a task that must run before
     existing pending work is anchored rather than appended, and naming an
     existing task id with an anchor moves it there while preserving its
     `status` and `command`.
   - `questions.yaml`: resolve the seeded requirement questions through the
     delegated requirement-interrogation procedure. Leave `open: []` only when
     reproduction, scope, expected behavior, and regression validation are all
     clear. Otherwise record the missing decision and stop before
     implementation.
   - delta specs: route them with the delegated spec-artifact-routing and
     delta-artifact-authoring procedures, and prefer `MODIFIED` operations when
     the bug corrects an existing requirement; use `ADDED` only when the
     expected behavior is not already represented. Leave `specs/` empty only for
     a purely internal defect with no observable spec impact.

6. **Run the proposal checkpoint** — before implementation, semantically check
   every generated or edited file under `.strict-spec-driven/changes/<change-name>/`
   against the known bug, reproduction evidence, expected behavior, relevant
   main specs, applicable technical standards, unchanged behavior, task
   coverage, unresolved-question impact, delta spec scenarios, and delta tech
   use when applicable. When no delta specs are appropriate, replace delta spec
   scenario review with a justified absence check for the technical-only bugfix. For technical-only bugfixes, verify that
   tasks cover reproduction evidence, scripts or tooling, validation commands,
   `ready`/`verify`, and archive or archive-merge checks when archive behavior
   is affected. The checkpoint should fix safe, in-scope
   documentation gaps immediately. Do not expand scope or answer unresolved
   human questions silently.

7. **Validate readiness** — run:
   ```bash
   strict-spec-cli ready <change-name>
   ```
   If you use `verify` before implementation, treat pending-task diagnostics as
   expected. If `questions.yaml.open` is not empty, explain each blocker,
   recommend concrete answers or options with tradeoffs, and stop.

8. **Implement the minimal fix** — follow the delegated implementation-order
   procedure, and hold it to the bugfix's narrower bar:
   - Create or confirm the failing regression evidence before production edits.
   - Make the smallest production change that satisfies the expected behavior.
   - Preserve every `proposal.yaml.unchanged_behavior` item.
   - Do not opportunistically refactor, rename, reformat, or fix adjacent bugs
     unless required for the target bugfix.

9. **Run regression evidence** — complete every Testing task by running its
    `command`. The targeted regression must fail before the fix and pass after
    the fix. If the before/after evidence cannot be produced locally, leave the
    implementation unstarted or unarchived and record the blocker instead of
    claiming the bug is fixed. Then run the configured complete project-level
    regression command from `.strict-spec-driven/config.yaml` before archive.
    That evidence survives the lesson declaration in step 11: a write the
    configured regression command neither compiles nor reads — currently a
    change-local delta-tech artifact or a lesson — does not invalidate passing
    complete project regression evidence. Any other write after it, including a
    delta-spec, a planning artifact, or a source or test file, forces a rerun
    before archive.

10. **Verify and review before archive** — run:
    ```bash
    strict-spec-cli verify <change-name>
    ```
    Read the changed implementation, tests, strict artifacts, relevant main
    specs, and tracked diff yourself. Check correctness, spec alignment,
    unchanged behavior, regression assertions, error handling, and technical
    standard compliance. Automatically fix safe in-scope review findings and
    rerun strict verification plus the configured complete regression command
    after review-time changes. Do not call or rely on a `strict-spec-cli review` command.

11. **Declare the lesson outcome (required)** — follow the delegated
    lesson-outcome procedure before archiving. A defect that reached a fix is
    direct evidence about why the existing tests and technical standards failed
    to catch it, which is the reusable part of a bugfix, so the trigger to
    record one is a gap that will let the next defect through too — a missing
    test shape, a misleading error message, an invariant nothing enforces. A fix
    for a plain typo teaches nothing and is declared "no lesson".

12. **Archive only when clean** — archive only after strict verification,
    direct review, targeted regression, and complete regression evidence pass:
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
- Archive only after strict verification, direct review, targeted regression, and complete project regression evidence pass.
