---
name: strict-spec-modify
description: Modify an existing strict YAML change artifact while preserving completed task state and keeping strict delta specs aligned with main spec paths.
metadata:
  skill_id: strict_spec_modify
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user modify an existing strict YAML change artifact.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
modify: strict-spec-cli modify [change-name|archive-dir]
generate: strict-spec-cli generate <change-name> <proposal|design|questions|tasks|delta-spec|delta-tech> --<named-args>
verify: strict-spec-cli verify <change-name>
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## YAML Writing Rules

- Keep updated artifacts in valid strict YAML structures. Do not replace
  structured fields with Markdown prose or side notes.
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
- Before finishing, self-check indentation, list nesting, quote closure, and
  colon spacing, then run `verify` when the skill instructions call for it.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `change-planning-state`, `change-delta-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli generate --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show change-proposal`, `strict-spec-cli schema-show change-design`, `strict-spec-cli schema-show task-list`, `strict-spec-cli schema-show question-list`, `strict-spec-cli schema-show delta-spec`, `strict-spec-cli schema-show delta-tech`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show change-proposal`, `strict-spec-cli sample-show change-design`, `strict-spec-cli sample-show task-list`, `strict-spec-cli sample-show question-list`, `strict-spec-cli sample-show delta-spec`, `strict-spec-cli sample-show delta-tech`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli generate`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
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

2. **Understand the requested edit** — clarify the content change, not just which
   file to touch.

3. **Read affected strict artifacts** — choose from:
   - `proposal.yaml`
   - `design.yaml`
   - `tasks.yaml`
   - `questions.yaml`
   - strict YAML delta specs under `changes/<name>/specs/`
   Also read `.strict-spec-driven/config.yaml`, `.strict-spec-driven/specs/INDEX.yaml`,
   and relevant main specs when editing delta specs.

4. **Apply targeted edits through `generate`**
   - for `proposal.yaml`, use the proposal generator's named summary, scope,
     unchanged-behavior, status, roadmap-link, and removal arguments
   - for `design.yaml`, use named approach, decision, alternative, risk,
     removal, or isolated deletion arguments
   - for strict YAML delta specs and delta tech, use target-confined operation,
     requirement/rule, scenario, removal, and deletion arguments; preserve
     `target_spec` or `target_standard` identity
   - for `tasks.yaml`, use `strict-spec-cli generate <change-name> tasks` to
     add or update a task — one invocation per task, `--section <name> --task
     <id> --text "..."` (upserts by section and task id, so
     other tasks are untouched). Restating a task is a field-level merge that
     overwrites only the fields you pass, so an existing `status: complete` and
     `command` are preserved automatically on a text-only edit — you no longer
     need to re-pass `--status complete`. Delete a task with `--remove <id>`,
     and move a task between sections by `--remove`-ing it and restating it
     under the new section in the same call; set gates with
     `--validation-task`/`--unit-test-task`. Use `--text=...`/`--command=...`
     when a value begins with a dash. Rename a task id by removing the old id
     and restating it under the new id in one invocation. Preserve existing
     `status: complete` entries unless the user explicitly asks to change
     completed work
   - for `questions.yaml`, use named open, resolved, resolve, and removal
     arguments; canonical requirement questions remain protected

5. **Validate after editing** — when the edited change is implementation-complete,
   run:
   ```bash
   strict-spec-cli verify <change-name>
   ```
   If the change still has pending tasks or open questions, use the output only
   as a strict YAML structure check and treat those lifecycle diagnostics as
   expected until implementation is complete.

6. **Summarize the change** — explain what changed across the updated YAML
   artifacts and confirm the resulting proposal state.

## Rules

- Preserve completed task state unless the user explicitly asks otherwise
- Keep strict delta specs aligned to the target main spec paths
- Never hand-edit change planning or delta YAML; every supported mutation flows
  through `generate`
