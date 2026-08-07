---
name: strict-spec-apply
description: Implement the tasks in a strict YAML change. Read the current change artifacts, work through tasks in order, and use the strict apply command only to mark the next pending task complete.
metadata:
  skill_id: strict_spec_apply
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user implement a strict YAML change.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
tech-status: strict-spec-cli tech-status
lesson-status: strict-spec-cli lesson-status [--category <category>]
verify-tech-mappings: strict-spec-cli verify-tech-mappings
modify: strict-spec-cli modify [change-name|archive-dir]
apply: strict-spec-cli apply <change-name>
verify: strict-spec-cli verify <change-name>
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## YAML Writing Rules

- Preserve valid strict YAML structures when updating `tasks.yaml`,
  `questions.yaml`, and delta specs. Do not replace structured fields with
  Markdown prose.
- If artifact fields are unclear, use `strict-spec-cli schema-show <schema-name>`;
  installed skills do not carry a `templates` directory.
- Shared schema cache root: `~/.strict-spec-schemas/`. When a YAML artifact already declares `schema_file`, resolve that relative path under the shared cache root to inspect the concrete schema file without relying on a local templates directory.
- If a valid artifact example would clarify the shape, use
  `strict-spec-cli sample-show <sample-name>`; installed skills do not rely on a
  local `examples` directory.
- Use block scalars only for free-text content. Prefer `>-` for wrapped prose
  such as longer `question`, `context`, `answer`, and spec `statement` values.
  Use `|` only when literal line breaks must be preserved as part of the value.
- Quote short strings that may contain YAML-sensitive characters or ambiguous
  scalar values, including `command` strings, URLs, paths, text containing `:`
  or `#`, leading `-`, JSON-like fragments, boolean-like words, and timestamp-
  like values.
- Keep short structural fields as plain scalars unless quoting is needed for
  correctness. Do not force IDs, enums, schema identifiers, artifact types,
  task references, or similar fields into block scalars.
- After editing YAML artifacts, self-check indentation, list nesting, quote
  closure, and colon spacing before running the documented strict commands.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `change-planning-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli apply --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show change-proposal`, `strict-spec-cli schema-show change-design`, `strict-spec-cli schema-show task-list`, `strict-spec-cli schema-show question-list`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show change-proposal`, `strict-spec-cli sample-show change-design`, `strict-spec-cli sample-show task-list`, `strict-spec-cli sample-show question-list`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli apply`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
6. **Inspect the structured result and changed paths** — read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.
7. **Run the artifact's validation command** — `strict-spec-cli verify <change-name>`

**Stop rather than edit YAML directly.**

When a required command, argument, or artifact kind is unavailable, stop and
report the missing capability. Editing the YAML directly, writing a raw
payload, or scripting around the CLI is never an available fallback, and an
unavailable command is a reason to stop rather than a reason to improvise.

When you stop, report:

- the operation that could not be completed
- the artifact kind and target artifact it would have written
- the command or argument that is missing
- the discovery commands already consulted

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

1. **Select the change** — run `modify` without an argument to list active
   changes. If the change is already specified, use it.

2. **Load current strict context** — treat prior chat context as stale unless it
   has been revalidated from the repository. Read:
   - `.strict-spec-driven/changes/<name>/proposal.yaml`
   - `.strict-spec-driven/changes/<name>/design.yaml`
   - `.strict-spec-driven/changes/<name>/tasks.yaml`
   - `.strict-spec-driven/changes/<name>/questions.yaml`
   - every strict YAML delta spec under `changes/<name>/specs/`
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every relevant strict YAML main spec
   - the technical standards that govern the files this change will touch: run
     `strict-spec-cli tech-status` and read the
     relevant files under `.strict-spec-driven/tech/`. These are the engineering
     rules the implementation must satisfy.
   - select the lesson category that matches the affected spec or technical area, run
     `strict-spec-cli lesson-status --category <category>`, and read the lessons it ranks first.
     Repeat for another category when the change genuinely spans more than one; use the unfiltered
     command only when repository evidence cannot identify a relevant category.
     Lessons are recorded experience, not binding rules: they carry no MUST or
     SHOULD strength, so treat each one as a warning worth checking against this
     change rather than a constraint to satisfy. Match on `applies_when` — that
     field states the condition under which the lesson is worth recalling. A
     lesson with several occurrences has bitten this project repeatedly and
     deserves weight even though nothing enforces it.

3. **Gate on open questions** — inspect `questions.yaml`.
   - if `open` contains entries, do not infer answers or continue
     automatically
   - for each unresolved question, explain the missing decision or information,
     the impact on scope, implementation, testing, or spec behavior, and the
     recommended answer or options with tradeoffs
   - stop and wait for an explicit human reply
   - only continue once every entry is moved to `resolved` with an explicit
     answer and removed from `open`

4. **Implement tasks in order** — work through the pending tasks in
   `tasks.yaml.sections` from top to bottom.
   - read relevant code before editing
   - implement the next pending task
   - preserve every item in `proposal.yaml.unchanged_behavior`
   - write code that satisfies the applicable technical standards from step 2:
     never violate a MUST rule, and follow each SHOULD rule unless the change's
     design already records an explicit justified deviation. If a task can only
     be completed by violating a MUST rule, stop and raise it as an open
     question rather than breaking the standard; if the standard itself is wrong
     and must change as part of this change, carry that change as a delta tech
     artifact under `changes/<name>/tech/` (run
     `strict-spec-cli schema-show delta-tech`
     for the contract) so it merges on archive — do not edit the live standard
     under `.strict-spec-driven/tech/` directly.

5. **Mark tasks with the strict apply command** — after you finish the next
   pending task, run:
   ```bash
   strict-spec-cli apply <change-name>
   ```
   and confirm the returned `sectionName` and `taskId` match the task you just
   completed.

6. **Do not use `apply` as a read-only status command** — the strict apply
   command mutates `tasks.yaml` by marking the first pending task complete. Read
   `tasks.yaml` directly when you need task status without changing it.

7. **Handle testing tasks carefully** — for tasks in the `Testing` section, run
   the task's `command` and confirm it succeeds before marking the task
   complete.

8. **Update delta specs and delta tech after coding** — re-read the strict YAML
   delta specs and make sure they match what was actually implemented. Keep
   `mapping` fields in sync with the implementation and test files that were
   changed or directly relied on. If the change carries delta tech artifacts
   under `changes/<name>/tech/`, re-read them too and confirm the rule
   operations and `mapping` still match the standard change that was actually
   implemented.

9. **Gitignore hygiene** — once all tasks are complete, check for non-source
   artifacts that should not be committed:
   - run `git status --short` to find newly created untracked files
   - identify non-source artifacts such as build output (`dist/`, `build/`,
     `out/`), dependency directories (`node_modules/`, `vendor/`), cache
     directories (`.cache/`, `.tmp/`), log files (`*.log`), and other
     generated files
   - add matching entries to `.gitignore` automatically
   - do not ignore source code, configuration, or files that are part of the
     deliberate project output

10. **Finish cleanly** — read `tasks.yaml` again to confirm there are no
    remaining `status: pending` entries, then suggest `strict-spec-verify`.

## Harness Guidance

When `.strict-spec-driven/harness.yaml` exists in the project and a task
requires starting declared components or opening declared targets:

1. Run `harness-plan` first and explain the declared long-running commands
   before starting them.
2. Use `harness-start` to start declared executable components rather than
   guessing undeclared startup steps.
3. Use declared URLs, targets, and evidence labels from the plan when exercising
   the running application.
4. Capture evidence consistently using harness session evidence identifiers.
5. Run `harness-stop` to stop all components you started before finishing the
   task.
6. If required environment variables are missing, the declaration is absent,
   or the user has already provided a running service URL outside the harness
   declaration, report the unavailable prerequisites and do not use lifecycle
   commands.

## Rules

- Read existing code before modifying it
- Complete tasks in order unless a clear dependency requires otherwise
- Mark each task complete immediately after implementing it
- Never run `apply` just to inspect status
- Open questions require a problem explanation, impact analysis, recommendation,
  and explicit human answer before continuing; encode the impact and
  recommendation in `questions.yaml.open[*].context`
- Implemented code must satisfy applicable technical standards under
  `.strict-spec-driven/tech/`: never break a MUST rule, follow SHOULD rules by
  default, and raise a conflict instead of silently violating a standard
- When a change must alter a standard, do it through a delta tech artifact under
  the change's `tech/` directory, never by editing the live standard during the
  change
- Keep implementation and test mappings in structured YAML fields, not prose
