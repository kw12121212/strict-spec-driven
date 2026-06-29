---
name: strict-spec-migrate
description: Guide a legacy `.spec-driven/` to `.strict-spec-driven/` migration using the strict CLI and structured migration report.
metadata:
  skill_id: strict_spec_migrate
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are guiding the user through a strict workflow migration from legacy
`.spec-driven/` Markdown artifacts into `.strict-spec-driven/` YAML artifacts.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
migrate: strict-spec-cli migrate
roadmap-status: strict-spec-cli roadmap-status
verify-spec-mappings: strict-spec-cli verify-spec-mappings
```

## Prerequisites

The legacy `.spec-driven/` directory must exist at the project root as migration
input.

Treat `.strict-spec-driven/` as the strict YAML target state. Do not overwrite
an existing target without explicit operator confirmation.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

1. **Inspect migration inputs first** — read the relevant legacy
   `.spec-driven/` config, specs, changes, and roadmap artifacts before running
   migration so you understand what state is expected to move into
   `.strict-spec-driven/`.

2. **Check for overwrite risk** — determine whether `.strict-spec-driven/`
   already contains state that would make a rerun unsafe. Warn the operator
   before proceeding if the target directory is not empty.

3. **Run migration with the strict CLI** — execute:
   ```bash
   strict-spec-cli migrate
   ```

4. **Review the structured migration report** — inspect converted entries,
   skipped entries, warnings, errors, and `manualFollowUp` items before
   declaring migration complete.

5. **Validate the migrated strict state** — after a successful migration, run:
   ```bash
   strict-spec-cli roadmap-status
   strict-spec-cli verify-spec-mappings
   ```
   Use those checks to confirm the generated `.strict-spec-driven/` state is
   structurally usable, especially for roadmap references and spec mappings.

6. **Guide manual follow-up explicitly** — if the report includes warnings,
   errors, or `manualFollowUp` items, summarize what still needs a human
   decision and keep those follow-up items explicit instead of inventing missing
   YAML fields or silently claiming unsupported Markdown was converted.

## Rules

- Treat `.spec-driven/` as preserved migration input, not the desired end state
- Treat `.strict-spec-driven/` as the canonical strict target after successful
  migration
- Never invent YAML fields for unsupported or ambiguous legacy Markdown
- Never claim migration is complete until the report and post-migration
  validation checks have been reviewed
- Use the CLI for deterministic migration and validation mechanics; use the
  prompt only for review, prioritization, and manual follow-up guidance
