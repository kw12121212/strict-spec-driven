---
name: strict-tech-edit
description: Create or modify individual strict YAML technical standard files through the CLI for lightweight engineering-standard corrections.
metadata:
  skill_id: strict_tech_edit
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user create or modify strict YAML technical standard files
under `.strict-spec-driven/tech/` through the artifact-aware CLI, without going
through the strict change workflow.

Technical standards capture the implementation-facing engineering rules that
main specs deliberately exclude: technology choices, coding conventions,
architecture rules, internal structure constraints, and security, performance,
or API design baselines. A main spec says what the system does; a technical
standard says how the code that implements it must be built.

Use this skill only for standalone, lightweight standard maintenance that is not
part of an active strict change. When a standard change is part of a code change
— so it must be reviewed and merged alongside that change — do not edit the live
standard here; carry it as a delta tech artifact under
`.strict-spec-driven/changes/<name>/tech/` through `/strict-spec-propose`,
`/strict-spec-apply`, and archive instead.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
tech-edit: strict-spec-cli tech-edit <standard-id> [--tech-path <path>] --<named-args>
tech-status: strict-spec-cli tech-status
lesson-status: strict-spec-cli lesson-status [--category <category>]
lesson-edit: strict-spec-cli lesson-edit <lesson-id> --promoted-standard <id> --promoted-rule <id>
verify-tech-mappings: strict-spec-cli verify-tech-mappings
schema-show: strict-spec-cli schema-show main-tech
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
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

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Read strict tech context first** — before making any changes, read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/tech/INDEX.yaml`
   - run `tech-status` to see existing standards and their rules
   - any existing strict YAML technical standard files relevant to the request
   - the schema contract via `schema-show main-tech` when unsure of the shape

2. **Check whether a lesson is being promoted** — run
   `strict-spec-cli lesson-status --category <category>` with the target standard's category and
   check whether recorded experience already
   covers the rule being added. A lesson with repeated occurrences is the
   strongest case for a new standard: the recurrence count is objective evidence
   that the rule is needed, and the lesson's `observation` already supplies the
   `rationale`. Note any lesson the rule originates from; step 7 links them once
   the standard exists.

3. **Understand the request** — identify whether the user wants to:
   - add a new strict YAML technical standard file or category
   - add new structured rules to an existing standard file
   - modify an existing rule
   - remove one or more existing rules

4. **Choose the target** — use `INDEX.yaml` and `tech-status` to determine where
   the content belongs:
   - if an existing standard file covers the area, use it
   - only create a new standard file if no existing file fits
   - keep one standard file focused on one category
     (`coding`, `architecture`, `security`, `performance`, `api`, `testing`,
     `tooling`, `operations`, or `documentation`)

5. **Prepare the changes** — draft the exact structured edits. Every rule must
   carry:
   - `strength`: MUST (required, no exceptions), SHOULD (default unless
     justified), or MAY (genuinely optional)
   - `statement`: the rule itself, phrased as an enforceable engineering
     constraint
   - `rationale`: why the rule exists — this is what separates a standard from
     arbitrary preference
   - `enforcement`: a `method` of `lint`, `ci`, `test`, `review`, or `manual`,
     plus optional `detail`
   - optional `examples.good` / `examples.bad` and `exceptions`
   Keep `mapping.implementation` (representative files the standard governs) and
   `mapping.enforcement` (lint configs, CI files, or tests that enforce it) as
   repo-relative path arrays. Either may be empty for a manual-only standard.

6. **Present and confirm** — show the user:
   - which strict YAML standard file or files will change
   - the exact content that will be added, modified, or removed
   - whether `.strict-spec-driven/tech/INDEX.yaml` needs updating

   Wait for explicit confirmation before writing anything.

7. **Apply the confirmed edits through `tech-edit`** — after confirmation:
   - create a standard with `tech-edit <standard-id> --tech-path <path>
     --title <text> --category <category> --rule <id> --strength
     <MUST|SHOULD|MAY> --statement <text> --rationale <text> --method
     <lint|ci|test|review|manual>`
   - update one rule by restating `--rule <id>` and only the scalar, enforcement,
     example, or exception fields that changed
   - add mappings with repeatable `--implementation` and `--enforcement`, and
     remove exact paths with their named removal flags
   - remove keyed content with `--remove-rule`, or rule-scoped examples and
     exceptions with their named removal flags
   - use isolated `tech-edit <standard-id> --delete` only for a confirmed whole
     standard removal; active delta-tech references block deletion
   Never edit main-tech or tech-index YAML text. The command validates the full
   candidate and reconciles the index in the same transaction.
   - link any lesson the new rule came from, now that the standard exists:
     ```bash
     strict-spec-cli lesson-edit <lesson-id> --promoted-standard <standard-id> --promoted-rule <rule-id>
     ```
     This sets the lesson to `promoted` and drops it from the default lesson
     list so the same guidance is not surfaced twice. Never delete the lesson —
     a rule states what must be done but omits the failure that motivated it,
     and the lesson is the only remaining record of that failure.

8. **Validate the result** — after editing, verify:
   - each edited file remains valid strict YAML matching the `main-tech` schema
   - the mutation result reports the reconciled tech index
   - run `verify-tech-mappings` when mapping fields changed
   - run `tech-status` to confirm the standards and rules read back correctly

9. **Summarize** — tell the user which strict YAML standard files changed, what
   was added, modified, or removed, and whether `INDEX.yaml` was updated.

## Rules

- Always read existing standards before authoring through `tech-edit`
- Present the exact changes and wait for confirmation before writing
- Prefer existing categories and files unless the content clearly requires a new
  path
- Every rule MUST carry a rationale and an enforcement method — no rationale-free
  rules
- Do not implement product code
- Do not create or interact with `.strict-spec-driven/changes/`
- Keep mappings in `mapping.implementation` and `mapping.enforcement`, not in
  rule prose
- Never hand-edit main-tech or tech-index YAML; express every standalone
  mutation through `strict-spec-cli tech-edit`
