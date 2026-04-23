# Design: create-strict-template-assets

## Approach

- Add a dedicated strict scaffold template location under
  `templates/strict-spec-driven/scaffold/` and create YAML/Markdown seed files that
  represent initial strict workflow state.
- Keep template assets machine-parseable and deterministic so `init` and future tests
  can copy or validate them without ad hoc string assembly.
- Keep this change artifact-focused; defer command wiring (`init`) and broader fixture
  matrices to subsequent planned changes.

## Key Decisions

- Separate scaffold assets from `templates/strict-spec-driven/schemas/` and
  `templates/strict-spec-driven/examples/` to avoid mixing generated-state templates
  with contract and example files.
- Use this change to define minimal required scaffold files only, so downstream
  `implement-strict-init` can focus on idempotent filesystem behavior.
- Record template-asset expectations in `cli/foundation` delta spec so downstream
  implementation and tests have an explicit observable contract.

## Alternatives Considered

- Fold template creation directly into `implement-strict-init`:
  rejected because it couples asset definition and command semantics, making failures
  harder to isolate.
- Reuse schema example files as init templates:
  rejected because examples are contract demonstrations, not necessarily complete
  scaffold state for generated project directories.
