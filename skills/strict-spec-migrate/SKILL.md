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
```

## Prerequisites

The legacy `.spec-driven/` directory must exist at the project root as migration
input.

Treat `.strict-spec-driven/` as the strict YAML target state. Do not overwrite
an existing target without explicit operator confirmation.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `workflow-config`, `spec-state`, `roadmap-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli migrate --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show config`, `strict-spec-cli schema-show spec-index`, `strict-spec-cli schema-show main-spec`, `strict-spec-cli schema-show roadmap-index`, `strict-spec-cli schema-show roadmap-milestone`, `strict-spec-cli schema-show planned-change`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show config`, `strict-spec-cli sample-show spec-index`, `strict-spec-cli sample-show main-spec`, `strict-spec-cli sample-show roadmap-index`, `strict-spec-cli sample-show roadmap-milestone`, `strict-spec-cli sample-show planned-change`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli migrate`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
6. **Inspect the structured result and changed paths** — read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.
7. **Run the artifact's validation command** — `strict-spec-cli check-workflow-state`, `strict-spec-cli roadmap-status`

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
   strict-spec-cli check-workflow-state
   ```
   Use those checks to confirm the generated `.strict-spec-driven/` state is
   structurally usable, especially for roadmap references.

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
