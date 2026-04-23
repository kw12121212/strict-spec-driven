# Tasks: bundle-templates-with-dist

## Implementation
- [x] Update `src/scaffold.ts` to replace `PROJECT_ROOT`/`BUNDLED_SCAFFOLD_DIR` with `import.meta.url`-relative resolution using a `getBundledDir` helper that checks `dist/templates/` first then falls back to `../templates/`
- [x] Update `src/validation.ts` to replace `PROJECT_ROOT`/`BUNDLED_SCHEMA_DIR` with the same `import.meta.url`-relative resolution pattern
- [x] Update `package.json` build script from `tsc` to `tsc && cp -r templates dist/templates`
- [x] Add a new test section in `test/run.ts` verifying bundled template assets exist under `dist/templates/` after build
- [x] Add a test verifying `strict-spec-driven init` works from a temp directory using only compiled output
- [x] Add a test verifying `strict-spec-driven propose` works from a temp directory using only compiled output

## Testing
- [x] Run `bun run build` — build command including template copy
- [x] Run `bun test/run.ts` — unit tests including template resolution and CLI integration

## Verification
- [x] Verify implementation matches proposal scope
