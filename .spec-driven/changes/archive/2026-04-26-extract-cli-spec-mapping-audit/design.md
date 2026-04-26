# Design: extract-cli-spec-mapping-audit

## Approach

Create `src/cli/spec-mapping.ts` by moving the audit types, constants, and all six functions verbatim from `src/strict-spec-cli.ts`. The new module imports `parseYamlDocument` from `../yaml.js` and `listFilesRecursive`, `normalizeRepoRelativePath`, `normalizePathSeparators` from `./fs.js` — both already used by the inline code. Export `verifySpecMappings`, `VerifySpecMappingsResult`, and `MappingAuditDiagnostic` from the module. In `strict-spec-cli.ts`, delete the moved definitions and add a single import of `verifySpecMappings` from `./cli/spec-mapping.js`. No test files need to change; the existing section 15 CLI-invocation tests in `test/suites/change-lifecycle.ts` will cover the extraction automatically.

## Key Decisions

- **Place in `src/cli/`**: Matches the extraction pattern already established by `argv.ts`, `changes.ts`, `fs.ts`, `registry.ts`, and `usage.ts`. The spec-mapping audit is a CLI-layer concern that serves the `verify-spec-mappings` subcommand.
- **Keep internal helpers unexported**: Only `verifySpecMappings`, `VerifySpecMappingsResult`, and `MappingAuditDiagnostic` need to be public. `makeMappingDiagnostic`, `normalizeMappedPath`, `parseSpecMapping`, `collectEvidenceCandidates`, and `sortMappingDiagnostics` remain module-private.
- **Keep `runVerifySpecMappings` in the entrypoint**: The handler is CLI dispatch glue — it owns the argv validation, stdout write, and exit code. Moving it would pre-empt the domain handler split in `extract-cli-command-handlers-by-domain`.
- **No new tests**: The extraction is behavior-preserving by construction. The existing section 15 tests exercise the full command surface and will detect any regression.

## Alternatives Considered

- **`src/spec-mapping/` directory**: Deferred. The six functions and three types are cohesive enough for a single file. A multi-file namespace can be introduced later if the module grows.
- **Exporting all helpers**: Rejected. Exporting internal helpers as public API creates coupling; only the top-level result type and the entry function are needed by callers.
