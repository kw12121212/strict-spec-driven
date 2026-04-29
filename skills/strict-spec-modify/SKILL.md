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
modify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
```

## Prerequisites

The `.strict-spec-driven/` directory must exist at the project root. Before
proceeding, verify that strict workflow state already exists.

## YAML Writing Rules

- Keep updated artifacts in valid strict YAML structures. Do not replace
  structured fields with Markdown prose or side notes.
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

## Steps

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

4. **Apply targeted edits**
   - in `proposal.yaml`, update structured fields like `summary`, `scope`, or
     `unchanged_behavior`
   - in `design.yaml`, update `approach`, `decisions`, `alternatives`, or `risks`
   - in strict YAML delta specs, preserve `target_spec`, `mapping`, and
     `operations`
   - in `tasks.yaml`, preserve existing `status: complete` entries unless the
     user explicitly asks to change completed work
   - in `questions.yaml`, add new `open` entries or move resolved decisions into
     `resolved`

5. **Validate after editing** — when the edited change is implementation-complete,
   run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   ```
   If the change still has pending tasks or open questions, use the output only
   as a strict YAML structure check and treat those lifecycle diagnostics as
   expected until implementation is complete.

6. **Summarize the change** — explain what changed across the updated YAML
   artifacts and confirm the resulting proposal state.

## Rules

- Preserve completed task state unless the user explicitly asks otherwise
- Keep strict delta specs aligned to the target main spec paths
- Keep mappings in structured YAML fields, not prose
