# extract-cli-spec-mapping-audit

## What

Move the spec-mapping audit logic currently inline in `src/strict-spec-cli.ts` into a dedicated module `src/cli/spec-mapping.ts`. This includes the `MappingField`, `MappingAuditDiagnostic`, and `VerifySpecMappingsResult` types; the `LEGACY_SPECS_DIR` and `EXCLUDED_MAPPING_SPEC_BASENAMES` constants; and the `makeMappingDiagnostic`, `normalizeMappedPath`, `parseSpecMapping`, `collectEvidenceCandidates`, `sortMappingDiagnostics`, and `verifySpecMappings` functions. The `runVerifySpecMappings` handler in `strict-spec-cli.ts` is updated to import `verifySpecMappings` from the new module. The `specs/cli/foundation.md` mapping frontmatter is updated to add `src/cli/spec-mapping.ts` to the implementation list.

## Why

The spec-mapping audit logic — parsing Markdown frontmatter, normalizing mapped paths, discovering evidence candidates, and sorting diagnostics — is a self-contained domain mixed into the CLI entrypoint alongside unrelated handler routing and scaffold management code. Extracting it gives it clear ownership under `src/cli/`, reduces the entrypoint size, and establishes a clean boundary before the domain-level handler split planned in `extract-cli-command-handlers-by-domain`.

## Scope

In scope:
- Create `src/cli/spec-mapping.ts` containing all audit types, constants, and functions.
- Export `verifySpecMappings` and the `VerifySpecMappingsResult` and `MappingAuditDiagnostic` types from the new module.
- Remove the moved definitions from `src/strict-spec-cli.ts` and replace with an import from `./cli/spec-mapping.js`.
- Update `specs/cli/foundation.md` mapping frontmatter to add `src/cli/spec-mapping.ts` to the implementation list.

Out of scope:
- Changing the audit logic, diagnostic messages, path normalization rules, or evidence collection heuristics.
- Moving the `runVerifySpecMappings` handler out of `strict-spec-cli.ts`.
- Changing any command output, JSON field names, or exit codes.

## Unchanged Behavior

- `strict-spec-driven verify-spec-mappings` JSON output shape, diagnostic content, diagnostic ordering, and exit codes must remain identical before and after the extraction.
- All existing section 15 tests in `test/suites/change-lifecycle.ts` must continue to pass without modification.
