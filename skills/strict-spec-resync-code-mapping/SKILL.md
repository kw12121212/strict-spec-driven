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
check-workflow-state: node {{SKILL_DIR}}/scripts/strict-spec-driven.js check-workflow-state
verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
```

## Prerequisites

Run `check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Steps

Before any other step, run `check-workflow-state`. If `.strict-spec-driven/` is
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
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
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

7. **Apply confirmed mapping repairs** — after confirmation, edit only
   `mapping.implementation` and `mapping.tests` in the selected strict spec
   files. Do not rewrite requirement behavior while repairing mappings.

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
