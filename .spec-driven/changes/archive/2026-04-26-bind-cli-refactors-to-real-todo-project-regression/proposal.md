# bind-cli-refactors-to-real-todo-project-regression

## What

Add project-fixture regression scenarios that run `list`, `modify`, `cancel`, archive-lookup, `roadmap-status`, `roadmap-sync`, and `verify-spec-mappings` against a copied todo-app project workspace, proving the decomposed CLI modules produce identical observable behavior to the pre-decomposition monolith.

## Why

All six CLI decomposition changes for milestone 07 are archived, but none of them added end-to-end project-level coverage for the commands most affected by the split. The current tests for `list`, `modify`, `cancel`, and the roadmap commands rely on minimal temp directories rather than a real project context. The todo-app fixture and copied-workspace harness from milestone 09 are in place; this change wires the decomposed command surface to that infrastructure so decomposition can be validated repeatably.

## Scope

In scope:
- Add `createCopiedProjectWorkspace("todo-app")` regression scenarios for `list`, `modify <name>`, `cancel <name>`, and archive-directory lookup in `test/suites/change-lifecycle.ts`
- Add `createCopiedProjectWorkspace("todo-app")` regression scenarios for `roadmap-status` and `roadmap-sync` in `test/suites/roadmap-and-migration.ts`
- Add a `createCopiedProjectWorkspace("todo-app")` regression scenario for `verify-spec-mappings` in `test/suites/operations.ts`
- Each scenario asserts the command exits with the expected code and that JSON output or stderr matches the observable contract

Out of scope:
- Adding new commands or changing existing command behavior
- Modifying the todo-app fixture baseline
- Replacing existing narrow temp-dir assertions that already pass

## Unchanged Behavior

- All command exit codes, JSON output shapes, and human-readable output text remain identical
- The committed todo-app fixture is never mutated; copied workspaces are cleaned up after each scenario
- All existing test sections and their pass/fail behavior remain unchanged
