# add-yaml-validation-layer

## What

Add a shared YAML validation layer for the strict CLI that centralizes YAML parsing and serialization, JSON Schema compilation, bundled schema loading, and deterministic validation diagnostics.

## Why

Milestone 02 currently has CLI scaffolding but no reusable validation pipeline. Without this layer, later changes (`implement-strict-init`, `add-yaml-fixtures-and-tests`, and roadmap/state validators) would duplicate parsing and error handling behavior, increasing drift risk.

## Scope

In scope:
- Add shared source modules for YAML parse and stringify helpers
- Add shared schema validation helpers using `ajv` and `ajv-formats`
- Add schema loading helpers for bundled files under `templates/strict-spec-driven/schemas/`
- Add deterministic diagnostics that include artifact path, field path, expected value, and actual value when available
- Add duplicate-ID and reference-check validation hooks for strict artifact contracts
- Add focused tests for parser behavior, schema loading, and diagnostic output stability

Out of scope:
- Implementing the `init` subcommand behavior
- Porting propose/apply/verify/archive lifecycle commands
- Migrating roadmap commands or skills
- Converting `.spec-driven/` project state to `.strict-spec-driven/`

## Unchanged Behavior

- Existing `build` and `test` command behavior remains `bun run build` and `bun test/run.ts`
- CLI unknown-command handling and usage output semantics remain unchanged
- Existing strict schema and example assets in `templates/strict-spec-driven/` remain source-of-truth inputs, not generated workflow state
