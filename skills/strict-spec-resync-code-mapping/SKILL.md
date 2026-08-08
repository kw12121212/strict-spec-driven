---
name: strict-spec-resync-code-mapping
description: Retrofit or repair strict YAML spec mapping fields between specs, implementation files, and test files.
metadata:
  skill_id: strict_spec_resync_code_mapping
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user retrofit or repair spec-code mappings in strict YAML
main spec files under `.strict-spec-driven/specs/`.

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

1. **Choose the remapping scope** — determine whether the user wants to remap:
   - all strict main spec files
   - one strict spec category or file
   - only specs reported by `verify-spec-mappings` as malformed or stale

   If the user already gave a scope, use it. If not, ask which scope to repair.

2. **Read strict spec context first** — before proposing mapping edits, read:
   - `.strict-spec-driven/config.yaml`
   - `.strict-spec-driven/specs/INDEX.yaml`
   - every strict YAML main spec file in the selected scope
   - any existing `mapping.implementation` and `mapping.tests` fields in those
     specs

3. **Run mapping validation** — run:
   ```bash
   strict-spec-cli verify-spec-mappings
   ```
   Use the JSON result to identify missing mapping fields, malformed values, and
   stale file paths.

4. **Inspect repository evidence** — infer mappings by converging on the current
   repository evidence, not by trying to list every related file. Keep
   implementation files separate from test files, and stop once the mapping
   covers the main files a maintainer would inspect first.

5. **Classify findings** — sort findings into:
   - missing mapping fields that can be confidently added
   - malformed mapping fields that can be repaired without changing requirement
     behavior
   - stale paths that can be replaced with current implementation or test files
   - behavior or strict spec drift that requires `/strict-spec-sync-specs`,
     `/strict-spec-spec-edit`, or a normal strict change workflow
   - ambiguous mappings that require human input

6. **Present proposed mapping edits** — before editing any file, show the user:
   - each strict spec file whose mapping fields will change
   - the proposed `mapping.implementation` paths
   - the proposed `mapping.tests` paths
   - any behavior drift or ambiguity that will not be edited by this skill

   Wait for explicit confirmation before writing files.

7. **Apply confirmed mapping repairs through `spec-edit`** — after confirmation,
   invoke `spec-edit <spec-id>` with `--implementation` and `--test` for paths
   to add, and `--remove-implementation` and `--remove-test` for exact stale
   paths. The command preserves requirement behavior, validates the main spec,
   and reconciles the spec index atomically. Never edit spec or index YAML text.

8. **Validate after editing** — rerun `verify-spec-mappings`. Fix safe mapping
   field format issues immediately. If any remaining error needs human judgment,
   report it clearly.

9. **Report the final result** — summarize:
   - which strict spec files had mapping fields added or repaired
   - which stale paths were replaced
   - whether mapping validation now passes
   - any behavior drift or ambiguity left for another workflow

## Rules

- This is a planning and documentation skill only — do not change implementation
  code or tests
- Do not create, modify, archive, or cancel entries under
  `.strict-spec-driven/changes/`
- Do not rewrite requirement behavior while repairing mappings
- Keep `mapping.implementation` and `mapping.tests` separate
- Use repo-relative file paths only
- Keep mappings at file granularity; do not use line numbers, ranges, or symbols
- Always run `verify-spec-mappings` before and after confirmed mapping edits
- Express every mapping mutation through `strict-spec-cli spec-edit`
