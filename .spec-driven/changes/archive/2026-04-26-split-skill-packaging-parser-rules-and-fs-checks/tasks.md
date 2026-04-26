# Tasks: split-skill-packaging-parser-rules-and-fs-checks

## Implementation

- [x] Create `src/skills/model.ts` with shared types, constants, and `makeDiagnostic` factory extracted from `src/skills.ts`
- [x] Create `src/skills/frontmatter.ts` with `validateFrontmatterFields` and `validateLegacyReferences` extracted from `src/skills.ts`
- [x] Create `src/skills/content.ts` with `validateSkillContentAgainstExpectation`, the four domain content validators, and `validateCommandSection` extracted from `src/skills.ts`
- [x] Create `src/skills/fs-checks.ts` with `validateRequiredSymlink` and `validateMarketplaceMetadata` extracted from `src/skills.ts`
- [x] Create `src/skills/diagnostics.ts` with the diagnostic sorting helper extracted from `src/skills.ts`
- [x] Reduce `src/skills.ts` to a thin orchestrator that imports from `src/skills/*` and re-exports the public API

## Testing

- [x] Run `bun run build` — confirm TypeScript compiles with zero errors after the split
- [x] Run `bun test/run.ts` — confirm all unit tests in `test/suites/entrypoint-and-skills.ts` pass with unchanged assertions

## Verification

- [x] Verify `validate-skills` CLI output and exit codes are identical before and after the split
- [x] Verify implementation matches proposal scope
