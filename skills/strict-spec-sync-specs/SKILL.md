---
name: strict-spec-sync-specs
description: Scan repository behavior and strict YAML specs for drift, then synchronize strict specs through the CLI after user confirmation.
metadata:
  skill_id: strict_spec_sync_specs
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user synchronize `.strict-spec-driven/specs/` with behavior
that already exists in the repository.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
spec-edit: strict-spec-cli spec-edit <spec-id> [--spec-path <path>] --<named-args>
verify-spec-mappings: strict-spec-cli verify-spec-mappings
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `spec-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli spec-edit --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show spec-index`, `strict-spec-cli schema-show main-spec`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show spec-index`, `strict-spec-cli sample-show main-spec`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli spec-edit`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
6. **Inspect the structured result and changed paths** — read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.
7. **Run the artifact's validation command** — `strict-spec-cli verify-spec-mappings`

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

1. **Choose the scan scope** — determine whether the user wants:
   - a repository-wide scan
   - a scoped scan for a specific directory, module, or feature area

   If the user already gave a scope, use it. If not, ask whether to scan the
   whole repository or a narrower target.

2. **Read strict spec context first** — before deciding that any drift exists,
   read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every strict YAML main spec file that appears relevant to the chosen scope

3. **Read repository evidence in the chosen scope** — inspect the code, tests,
   and nearby docs that define current observable behavior in that area.
   Prefer behavior-facing files, and do not treat internal implementation
   details as requirements.

4. **Classify drift findings** — compare repository evidence to the current
   strict specs and sort findings into:
   - confirmed behavior that exists in code but is missing from strict specs
   - existing strict requirements that appear outdated or incomplete
   - ambiguous findings that need human confirmation before they become specs
   - areas with no meaningful drift in the scanned scope

5. **Report the drift summary in chat** — present a concise summary covering:
   - the scan scope that was analyzed
   - confirmed gaps or outdated strict spec areas, with specific file references
   - ambiguous findings that need human input
   - areas in scope where no meaningful drift was found

6. **Get user confirmation** — before editing any strict YAML spec file, ask the
   user to confirm the proposed changes. List each strict spec file that will be
   added, modified, or removed. Do not proceed until the user explicitly
   approves.

7. **Synchronize through `spec-edit`** — for each confirmed gap, invoke the CLI
   with the stable spec id and only the named semantic fields that changed:
   - create a new main spec with `--spec-path`, `--title`, and one complete
     `--requirement` / `--scenario` group
   - add or update requirements and scenarios by stable id
   - append mappings with `--implementation` and `--test`, and remove stale
     paths with the exact named removal flags
   - remove obsolete keyed entries with `--remove-requirement` or
     `--remove-scenario`
   Describe observable behavior only. Never edit the main-spec YAML or spec
   index text; `spec-edit` validates both and reconciles `INDEX.yaml`
   transactionally.

8. **Refresh supporting spec state** — after all strict spec edits are complete:
   - confirm each mutation result reports the reconciled spec index
   - run `verify-spec-mappings` when mapping fields changed

9. **Report final changes** — summarize:
   - which strict spec files were added, modified, or removed
   - a brief description of the drift fixed in each file
   - any ambiguous findings that were left unresolved and why

## Rules

- This is a documentation skill only — do not change product code
- Read strict spec context before judging drift
- Respect the user-selected scope
- Use code, tests, and nearby docs as evidence, but write only observable
  behavior into the strict specs
- Do not create a strict change — author live specs through `spec-edit`
- Do not write a standalone report file; the summary belongs in chat
- Get explicit user confirmation before editing any strict YAML spec file
- Keep mappings in `mapping.implementation` and `mapping.tests`, not in
  requirement prose
- Never hand-edit main-spec or spec-index YAML
