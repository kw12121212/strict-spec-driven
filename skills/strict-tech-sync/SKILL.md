---
name: strict-tech-sync
description: Scan repository implementation conventions and strict YAML technical standards for drift, then synchronize standards directly after user confirmation.
metadata:
  skill_id: strict_tech_sync
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user synchronize `.strict-spec-driven/tech/` with the
implementation conventions that already exist in the repository.

Technical standards capture implementation-facing engineering rules — technology
choices, coding conventions, architecture rules, internal structure constraints,
and security, performance, or API design baselines. This skill detects where the
codebase already follows (or violates) such conventions and reconciles the
written standards with that reality.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
tech-status: node {{SKILL_DIR}}/scripts/strict-spec-driven.js tech-status
verify-tech-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-tech-mappings
```

## Prerequisites

Run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

Before any other step, run `node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Choose the scan scope** — determine whether the user wants:
   - a repository-wide scan
   - a scoped scan for a specific directory, module, layer, or concern
     (for example: error handling, logging, API surface, build tooling)

   If the user already gave a scope, use it. If not, ask whether to scan the
   whole repository or a narrower target.

2. **Read strict tech context first** — before deciding that any drift exists,
   read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/tech/INDEX.yaml`
   - run `tech-status` to enumerate existing standards and rules
   - every strict YAML standard file relevant to the chosen scope

3. **Read repository evidence in the chosen scope** — inspect the code,
   configuration, build files, lint/format configs, CI definitions, and tests
   that reveal current implementation conventions. Look for conventions that are
   followed consistently enough to be a de facto standard, and for inconsistent
   areas where a standard is missing.

4. **Classify drift findings** — compare repository evidence to current
   standards and sort findings into:
   - established conventions present in the codebase but missing from standards
   - existing standard rules that are outdated, contradicted by the code, or
     unenforced
   - inconsistent areas where the team should pick a standard (needs human input)
   - areas with no meaningful drift in the scanned scope

5. **Report the drift summary in chat** — present a concise summary covering:
   - the scan scope that was analyzed
   - confirmed convention gaps or outdated standard rules, with file references
   - inconsistencies that need a human decision before becoming a rule
   - areas in scope where no meaningful drift was found

6. **Get user confirmation** — before editing any strict YAML standard file, ask
   the user to confirm the proposed changes. List each standard file that will be
   added, modified, or removed, and the strength of each new or changed rule. Do
   not proceed until the user explicitly approves. A convention only becomes a
   MUST when the user agrees it is mandatory.

7. **Edit strict YAML standard files directly** — for each confirmed finding:
   - edit the corresponding file under `.strict-spec-driven/tech/`
   - add, modify, or remove structured rules with `strength`, `statement`,
     `rationale`, and `enforcement`
   - update `mapping.implementation` and `mapping.enforcement` to match the
     repository evidence used for the sync
   - if no existing category or file fits, create a new standard file under
     `.strict-spec-driven/tech/` with the correct relative path

8. **Refresh supporting tech state** — after all edits are complete:
   - update `.strict-spec-driven/tech/INDEX.yaml` if new files or categories were
     created
   - run `verify-tech-mappings` when mapping fields changed
   - run `tech-status` to confirm the standards read back correctly

9. **Report final changes** — summarize:
   - which standard files were added, modified, or removed
   - a brief description of the drift fixed in each file
   - any inconsistencies that were left unresolved and why

## Rules

- This is a documentation skill only — do not change product code
- Read strict tech context before judging drift
- Respect the user-selected scope
- Use code, configs, CI, and tests as evidence; record the rule plus its
  rationale and enforcement, not raw implementation detail
- Do not create a strict change — edit `.strict-spec-driven/tech/` files directly
- Do not write a standalone report file; the summary belongs in chat
- Get explicit user confirmation before editing any strict YAML standard file
- Keep mappings in `mapping.implementation` and `mapping.enforcement`, not in
  rule prose
