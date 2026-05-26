---
name: strict-spec-sync-specs
description: Scan repository behavior and strict YAML specs for drift, then synchronize strict specs directly after user confirmation.
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

7. **Edit strict YAML spec files directly** — for each confirmed gap:
   - edit the corresponding file under `.strict-spec-driven/specs/`
   - add, modify, or remove structured requirements and scenarios as needed
   - preserve or update `mapping.implementation` and `mapping.tests` to match
     the repository evidence used for the sync
   - describe observable behavior only
   - if no existing category or file fits, create the new strict spec file under
     `.strict-spec-driven/specs/` with the correct relative path

8. **Refresh supporting spec state** — after all strict spec edits are complete:
   - update `.strict-spec-driven/specs/INDEX.yaml` if new files or categories
     were created
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
- Do not create a strict change — edit `.strict-spec-driven/specs/` files
  directly
- Do not write a standalone report file; the summary belongs in chat
- Get explicit user confirmation before editing any strict YAML spec file
- Keep mappings in `mapping.implementation` and `mapping.tests`, not in
  requirement prose
