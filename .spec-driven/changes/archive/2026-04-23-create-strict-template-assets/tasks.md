# Tasks: create-strict-template-assets

## Implementation

- [x] Add scaffold template files under `templates/strict-spec-driven/scaffold/` for config, specs index, roadmap index, empty changes state, and seed README guidance.
- [x] Ensure scaffold templates are deterministic and keep strict scaffold assets separated from schema and example assets.
- [x] Add or update repository references that `implement-strict-init` and fixture tests will use to locate the scaffold template files.

## Testing

- [x] Run `bun run build` — build validation for scaffold template asset changes
- [x] Run `bun test/run.ts` — unit tests validating strict scaffold template asset behavior

## Verification

- [x] Verify implementation matches proposal scope
