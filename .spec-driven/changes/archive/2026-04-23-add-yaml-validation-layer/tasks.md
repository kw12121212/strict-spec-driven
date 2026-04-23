# Tasks: add-yaml-validation-layer

## Implementation
- [x] Add shared YAML parse and stringify utilities for strict artifact documents
- [x] Add shared schema loading and compilation utilities using bundled schemas from `templates/strict-spec-driven/schemas/`
- [x] Add deterministic diagnostics plus duplicate-ID and reference-check validation passes

## Testing

- [x] Run `bun run build` — build and validate TypeScript compilation after validation-layer changes
- [x] Run `bun test/run.ts` — run unit tests for YAML parsing, schema loading, and validation diagnostics

## Verification
- [x] Verify implementation matches proposal scope
