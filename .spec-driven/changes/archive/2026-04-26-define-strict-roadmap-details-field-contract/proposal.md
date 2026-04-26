# define-strict-roadmap-details-field-contract

## What

Add a dedicated `details` field to the strict roadmap milestone schema, examples, templates, and schema registry so milestone authors can capture long-form technical and design guidance without overloading `notes` or `planned_changes`.

## Why

Milestone `notes` is a short string array for brief remarks. `planned_changes` is a concrete work list. There is no place for long-form planning guidance (design rationale, architectural constraints, migration considerations) that roadmap-backed proposals should consume as targeted context. Currently this content either gets stuffed into `notes` or lives outside the milestone artifact entirely, making it invisible to the workflow.

## Scope

- Add an optional `details` field (freeform string, typically YAML block scalar) to the roadmap milestone schema definition in `templates/strict-spec-driven/schemas/roadmap-milestone.yaml`
- Add `details` to the TypeScript model in `src/roadmap/model.ts`
- Add `details` validation (optional string) in `src/roadmap/validate.ts`
- Update the primary roadmap milestone example to demonstrate `details`
- Update the planning coverage example to demonstrate `details`
- No changes to `planned_change_entry` schema or planned change entries
- No changes to roadmap CLI behavior or proposal handoff (those belong to later milestone 10 changes)

## Unchanged Behavior

- Existing milestone validation, status derivation, and sync behavior must continue to work unchanged when `details` is absent
- The `notes` field remains required and unchanged in semantics
- The `planned_changes` field remains required and unchanged in semantics
- Schema version stays at v1 (adding an optional field is a compatible change)
