# Tasks: extract-cli-spec-mapping-audit

## Implementation

- [x] Create `src/cli/spec-mapping.ts` with the `MappingField`, `MappingAuditDiagnostic`, and `VerifySpecMappingsResult` types; `LEGACY_SPECS_DIR` and `EXCLUDED_MAPPING_SPEC_BASENAMES` constants; and `makeMappingDiagnostic`, `normalizeMappedPath`, `parseSpecMapping`, `collectEvidenceCandidates`, `sortMappingDiagnostics`, and `verifySpecMappings` functions moved verbatim from `src/strict-spec-cli.ts`
- [x] Remove the moved definitions from `src/strict-spec-cli.ts` and add `import { verifySpecMappings } from "./cli/spec-mapping.js"` to replace them
- [x] Update `specs/cli/foundation.md` mapping frontmatter to add `src/cli/spec-mapping.ts` to the implementation list

## Testing

- [x] Run `bun run build` — confirm TypeScript compiles with zero errors after the move
- [x] Run `bun test/run.ts` — confirm all unit tests pass, including section 15 `verify-spec-mappings` scenarios

## Verification

- [x] Verify `strict-spec-driven verify-spec-mappings` JSON output, diagnostic content, diagnostic ordering, and exit codes are identical to pre-extraction behavior
- [x] Verify implementation matches proposal scope — no audit logic changed, no handler moved, no new commands added
