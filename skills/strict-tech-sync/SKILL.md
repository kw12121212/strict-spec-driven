---
name: strict-tech-sync
description: Scan repository implementation conventions and strict YAML technical standards for drift, then synchronize standalone standards or active-change delta tech after user confirmation.
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
check-workflow-state: strict-spec-cli check-workflow-state
tech-status: strict-spec-cli tech-status
verify-tech-mappings: strict-spec-cli verify-tech-mappings
modify: strict-spec-cli modify [change-name|archive-dir]
generate: strict-spec-cli generate <change-name> delta-tech --<named-args>
verify: strict-spec-cli verify <change-name>
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

1. **Choose the synchronization mode and scan scope** — determine whether the
   user wants:
   - an **active-change sync** for a selected change that is still under
     `.strict-spec-driven/changes/`; use `modify` without an argument to list
     candidates when the user did not name one
   - a **standalone sync** that directly reconciles live standards outside an
     active change

   Then determine whether the requested scope is:
   - a repository-wide scan
   - a scoped scan for a specific directory, module, layer, or concern
     (for example: error handling, logging, API surface, build tooling)

   An active-change sync is always bounded to the selected change. Build its
   scope from the selected change's proposal, design, tasks, questions, delta
   specs, delta tech, structured mappings, and repository changes attributable
   to the change. Use attributable tracked and untracked files only as
   supporting evidence; surface ambiguous ownership instead of absorbing
   unrelated repository drift.
   If a standalone user already gave a scope, use it. Otherwise ask whether to
   scan the whole repository or a narrower target.

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
   areas where a standard is missing. For active-change sync, inspect only the
   selected change evidence and the applicable standards; do not turn the scan
   into repository-wide maintenance.

4. **Classify drift findings** — compare repository evidence to current
   standards and sort findings into:
   - conventions already covered by applicable main standards or the active
     change's delta tech
   - established conventions present in the codebase but missing from standards
   - existing standard rules that are outdated, contradicted by the code, or
     unenforced
   - inconsistent areas where the team should pick a standard (needs human input)
   - patterns that are specific to this change and are not reusable engineering
     conventions
   - unrelated repository drift excluded from an active-change scan
   - areas with no meaningful drift in the scanned scope

5. **Report the drift summary in chat** — present a concise summary covering:
   - the scan scope that was analyzed
   - confirmed convention gaps or outdated standard rules, with file references
   - inconsistencies that need a human decision before becoming a rule
   - areas in scope where no meaningful drift was found

6. **Get operator confirmation** — before writing any standard or delta-tech
   artifact, ask the operator to confirm each proposed change. For every finding,
   provide the target standard (or proposed new standard), operation, stable rule
   id, strength, normative statement, rationale, enforcement method, and
   implementation/enforcement mappings. Do not proceed until the operator
   explicitly approves both the normative content and its strength. A convention
   only becomes a MUST when the operator agrees it is mandatory. A surfaced
   pattern may instead be explicitly classified as not reusable; a convention
   confirmed as reusable may not be deferred until after its active change is
   archived.

7. **Write confirmed findings through the selected mode** — for each confirmed
   finding:
   - in active-change mode, use `generate <change-name> delta-tech ...` to add or
     update a strict delta-tech artifact under the selected change; never edit a
     live main standard directly
   - in standalone mode, edit the corresponding file under
     `.strict-spec-driven/tech/` directly
   - add, modify, or remove structured rules with `strength`, `statement`,
     `rationale`, and `enforcement`
   - update `mapping.implementation` and `mapping.enforcement` to match the
     repository evidence used for the sync
   - if no existing category or file fits, create a new standard through the
     selected mode with the correct relative path and category

8. **Refresh supporting tech state** — after all edits are complete:
   - in active-change mode, run `verify <change-name>`, review every generated
     delta-tech operation and mapping against the confirmed finding, and rerun
     any complete regression evidence invalidated by the artifact edit before
     archive continues
   - in standalone mode, update `.strict-spec-driven/tech/INDEX.yaml` if new
     files or categories were created and run `verify-tech-mappings` when
     mapping fields changed
   - run `tech-status` to confirm the standards read back correctly

9. **Report final changes** — summarize:
   - which standard files were added, modified, or removed
   - a brief description of the drift fixed in each file
   - any inconsistencies that were left unresolved and why

## Rules

- Do not change product code; synchronize only strict technical-standard state
- Read strict tech context before judging drift
- Respect the user-selected scope
- Use code, configs, CI, and tests as evidence; record the rule plus its
  rationale and enforcement, not raw implementation detail
- Do not create a strict change. In active-change mode write confirmed findings
  only as delta tech inside the already selected change; edit live standards
  directly only in standalone mode.
- Do not write a standalone report file; the summary belongs in chat
- Get explicit user confirmation before editing any strict YAML standard file
- Keep mappings in `mapping.implementation` and `mapping.enforcement`, not in
  rule prose
