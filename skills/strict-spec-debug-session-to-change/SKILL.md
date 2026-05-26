---
name: strict-spec-debug-session-to-change
description: Turn an active strict debug-session into a populated strict YAML change proposal, prompting for session selection when needed and handing off to auto/apply workflows.
metadata:
  skill_id: strict_spec_debug_session_to_change
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user convert one active strict debug-session into a strict
YAML change proposal.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
debug-session-validate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js debug-session-validate <session-id|session.yaml>
propose: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
generate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> <proposal|design|questions|delta-spec> --<named-args>
ready: node {{SKILL_DIR}}/scripts/strict-spec-driven.js ready <change-name>
verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
```

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

Work in the intended repository root before reading debug-session artifacts or
creating files under `.strict-spec-driven/changes/`.

## YAML Writing Rules

- Keep generated artifacts in valid strict YAML structures. Do not replace YAML
  fields with Markdown prose.
- If artifact fields are unclear, use `node {{SKILL_DIR}}/scripts/strict-spec-driven.js schema-show <schema-name>`;
  installed skills do not carry a `templates` directory.
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
- Before handoff, self-check indentation, list nesting, quote closure, and
  colon spacing, then run the documented validation commands.

## Steps

Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Select the source debug-session** — use the debug-session name supplied by
   the user when present. Otherwise inspect `.strict-spec-driven/debug-sessions/`
   and consider only active sessions.
   - ignore the reserved `archive/` directory
   - if no active debug-session exists, stop and tell the user to create or
     resume one with `strict-spec-debug-session`
   - if exactly one active session exists, use it automatically
   - if multiple active sessions exist, read each `session.yaml` and ask the
     human to choose using concise `session id + status + summary` metadata

2. **Validate the source artifact** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js debug-session-validate <session-id|session.yaml>
   ```
   Stop if validation reports YAML, schema, or filesystem diagnostics.

3. **Read strict project context and likely target specs** — before deriving the
   change, read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every relevant strict YAML main spec the debug-session findings appear
     likely to change
   - the selected debug-session `session.yaml`

4. **Derive the intended change from evidence** — use structured debug-session
   fields such as issue summary, observed and expected behavior, targets,
   hypotheses, findings, replay commands, and verification state to infer:
   - the desired user-visible outcome
   - what is in scope and out of scope
   - likely implementation and testing surfaces
   - likely strict spec impact
   - unchanged behavior that must be preserved

5. **Derive the change name** — create a short kebab-case change name from the
   debug-session content rather than defaulting to the session id. If the
   derived name collides with an existing active change, stop and ask the human
   to choose a revised name.

6. **Scaffold or reuse the change directory** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
   ```
   Reuse an empty scaffold when it already exists for the chosen name. Do not
   overwrite a populated unrelated change directory.

7. **Populate change artifacts in order** — after scaffolding, follow this exact
   sequence. Generate supported artifacts with direct CLI invocations, edit
   `tasks.yaml` directly, and do not create JSON payload files.
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> proposal --what "..." --why "..." --in "..." --out "..." --unchanged "..."`
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> design --reset --approach "..." --decision <decision-id> --decision-text "..." --rationale "..."`
   - edit `.strict-spec-driven/changes/<change-name>/tasks.yaml` directly with concrete `Implementation`, `Testing`, and `Verification` sections
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> questions --reset --open <question-id> --question "..." --context "..."` plus any needed `--resolved` entries
   - `node {{SKILL_DIR}}/scripts/strict-spec-driven.js generate <change-name> delta-spec --target-spec <spec-id> --implementation "src/file.ts" --test "test/file.test.ts" --operation ADDED --requirement <requirement-id> --strength MUST --statement "..." --scenario <scenario-id> --given "..." --when "..." --then "..."`

8. **Handle ambiguity explicitly** — when the debug-session evidence does not
   fully determine scope, requirements, tasks, or delta specs:
   - record each unresolved item in `questions.yaml.open`
   - explain the missing information in `context`
   - do not invent an implementation-ready answer
   - keep the generated proposal ready for handoff, but make clear that coding
     must stop until those questions are resolved

9. **Validate proposal readiness and artifact structure** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js ready <change-name>
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
   ```
   Treat pending-task diagnostics as expected at proposal time, but fix safe
   YAML or schema issues before handoff.

10. **Hand off without implementation** — summarize the selected debug-session,
    created change name, main spec areas touched, any open questions, and the
    unchanged behavior preserved. Then recommend:
    - `/strict-spec-auto <change-name>` for automatic implementation
    - `/strict-spec-apply <change-name>` for step-by-step implementation

## Rules

- Convert only active debug-session artifacts
- Preserve the source debug-session exactly as-is; do not archive, rewrite, or
  delete it as part of conversion
- Do not implement code during this skill
- Do not auto-run `strict-spec-auto` or `strict-spec-apply`; only recommend
  them after artifact creation
- Record uncertainty in `questions.yaml` instead of guessing silently
- Keep spec-code mappings in structured YAML mapping fields, not prose
