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
modify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]
apply: node {{SKILL_DIR}}/scripts/strict-spec-driven.js apply <change-name>
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. Before
proceeding, verify that strict workflow state already exists.

## YAML Writing Rules

- Preserve valid strict YAML structures when updating `tasks.yaml`,
  `questions.yaml`, and delta specs. Do not replace structured fields with
  Markdown prose.
- If artifact fields are unclear, use `node {{SKILL_DIR}}/scripts/strict-spec-driven.js schema-show <schema-name>`;
  installed skills do not carry a `templates` directory.
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

## Steps

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

5. **Mark tasks with the strict apply command** — after you finish the next
   pending task, run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js apply <change-name>
   ```
   and confirm the returned `taskId` and `taskText` match the task you just
   completed.

6. **Do not use `apply` as a read-only status command** — the strict apply
   command mutates `tasks.yaml` by marking the first pending task complete. Read
   `tasks.yaml` directly when you need task status without changing it.

7. **Handle testing tasks carefully** — for tasks in the `Testing` section, run
   the task's `command` and confirm it succeeds before marking the task
   complete.

8. **Update delta specs after coding** — re-read the strict YAML delta specs and
   make sure they match what was actually implemented. Keep `mapping` fields in
   sync with the implementation and test files that were changed or directly
   relied on.

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

## Rules

- Read existing code before modifying it
- Complete tasks in order unless a clear dependency requires otherwise
- Mark each task complete immediately after implementing it
- Never run `apply` just to inspect status
- Open questions require a problem explanation, impact analysis, recommendation,
  and explicit human answer before continuing
- Keep implementation and test mappings in structured YAML fields, not prose
