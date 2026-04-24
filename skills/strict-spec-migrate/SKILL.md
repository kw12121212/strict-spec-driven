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
migrate: node {{SKILL_DIR}}/scripts/strict-spec-driven.js migrate [--force|-f]
roadmap-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
```

## Prerequisites

The legacy `.spec-driven/` directory must exist at the project root as migration
input.

Treat `.strict-spec-driven/` as the strict YAML target state. Do not overwrite
an existing target unless the operator explicitly confirms a safe rerun path
that uses `--force` or `-f`.

## Steps

1. **Inspect migration inputs first** — read the relevant legacy
   `.spec-driven/` config, specs, changes, and roadmap artifacts before running
   migration so you understand what state is expected to move into
   `.strict-spec-driven/`.

2. **Check for overwrite risk** — determine whether `.strict-spec-driven/`
   already contains state that would make a rerun unsafe, and do not treat
   `--force` as the default. Only recommend `--force` or `-f` when the operator
   explicitly intends to replace existing strict output.

3. **Run migration with the strict CLI** — execute:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js migrate
   ```
   Use `--force` or `-f` only when the operator has explicitly chosen a safe
   rerun.

4. **Review the structured migration report** — inspect converted entries,
   skipped entries, warnings, errors, and `manualFollowUp` items before
   declaring migration complete.

5. **Validate the migrated strict state** — after a successful migration, run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js roadmap-status
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
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
