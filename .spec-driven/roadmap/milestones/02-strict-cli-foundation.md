# 02 Strict CLI Foundation

## Goal
Bootstrap a TypeScript CLI foundation that can create, parse, validate, and test strict YAML workflow artifacts.

## In Scope
- Establish the package, TypeScript, strict ESM, build, and test skeleton based on the reference project's `package.json`, `tsconfig`, and `test/run.js` conventions.
- Add source files for the strict CLI entrypoint, command router, filesystem helpers, YAML loading, schema registry access, diagnostics, fixtures, and test harness.
- Add a reusable YAML parsing, serialization, and validation layer around structured YAML APIs.
- Implement strict initialization that creates `.strict-spec-driven/` instead of `.spec-driven/`.
- Generate strict scaffold files for config, specs, roadmap, changes, and template content using YAML artifact names.
- Add initial fixtures and tests for YAML validation behavior, init idempotency, and clear diagnostics.
- Preserve the reference CLI responsibility boundary: scripts handle filesystem mechanics, parsing, validation, and deterministic rewrites while AI skills handle judgment and content generation.

## Out of Scope
- Porting every workflow command.
- Rewriting skill prompts.
- Building the legacy Markdown migration tool.
- Implementing archive merge, roadmap sync, maintenance, or installer behavior beyond the foundation needed by later milestones.

## Done Criteria
- `npm run build` and `npm test` exist and pass for the initial CLI foundation.
- The init command creates `.strict-spec-driven/` with YAML scaffold files and does not overwrite existing user-authored artifacts.
- YAML validation reports clear errors with artifact path, field path, expected value, and actual value where available.
- Tests cover valid scaffold generation, invalid YAML syntax, missing required fields, invalid enums, invalid references, duplicate IDs, and unsupported artifact shapes.
- CLI commands return machine-readable JSON for validation-style commands where the reference project already does so.
- The scaffold separates template files from generated project state so future installation and migration work do not conflate them.
- The build output under `dist/` includes `templates/` so compiled scripts resolve scaffold and change-template assets without depending on the source tree.
- Tests confirm that the compiled CLI can find all required template assets when run from `dist/` alone.
- Skill-directory symlinks (`scripts -> ../../dist/scripts`, `templates -> ../../dist/templates`) are deferred to M04 where skill directories are created.

## Planned Changes
- `bootstrap-typescript-cli` - Declared: complete - add `package.json`, `tsconfig.json`, TypeScript source entrypoint, strict ESM command router, compiled `dist/` output, and repeatable `npm run build` plus `npm test` runner based on reference conventions.
- `select-yaml-schema-tooling` - Declared: complete - pin `js-yaml` and `ajv` with `ajv-formats` in `package.json`, document the dependency policy, and wire both into the TypeScript build and test scripts.
- `add-yaml-validation-layer` - Declared: complete - implement shared source modules for YAML parse/stringify, schema loading from bundled `templates/strict-spec-driven/schemas/`, path-aware diagnostics, reference checks, duplicate-ID checks, and deterministic serialization.
- `create-strict-template-assets` - Declared: complete - add bundled template YAML files for config, specs index, roadmap index, empty changes state, and seed README guidance used by init and fixture tests.
- `implement-strict-init` - Declared: complete - implement the `init` subcommand to create `.strict-spec-driven/` config, specs, roadmap, and changes from bundled template assets without clobbering existing user state.
- `add-yaml-fixtures-and-tests` - Declared: complete - add test fixtures and automated tests for valid scaffold generation, invalid YAML diagnostics, enum validation, reference validation, duplicate IDs, unsupported shapes, and idempotent init. Test cases must trace back to M01 requirement identifiers in `yaml-artifacts.md` so that every M01 scenario has a corresponding pass/fail signal. Positive tests confirm valid examples pass validation; negative tests confirm invalid artifacts produce deterministic failures with actionable diagnostics.
- `bundle-templates-with-dist` - Declared: complete - update the build step to copy `templates/` into `dist/templates/` alongside compiled JS, change template resolution in scripts to use `import.meta.url` relative paths instead of `PROJECT_ROOT`, and add tests verifying compiled scripts can locate all required scaffold and change-template assets from the dist output without relying on the source tree. Skill-directory symlinks are deferred to M04.

## Dependencies
- `01-yaml-contracts-and-naming` should define the first schema version before implementation.
- The repository must choose concrete build and test commands before completing this milestone.

## Risks
- Copying reference Markdown logic too directly could make later YAML enforcement harder.
- Schema validation errors may become difficult to act on if they do not include paths and field names.
- Adding external runtime dependencies beyond YAML parsing could make the CLI harder to install consistently across agent environments.
- If init templates are generated by ad hoc strings without schema validation, the scaffold may drift from the contract immediately.

## Status
- Declared: complete

## Notes
- Scripts should use structured YAML APIs instead of ad hoc text manipulation.
- Each CLI foundation change must produce executable source, package scripts, fixtures, or tests; contract-only updates belong in milestone 01.
- YAML tooling decision: use `js-yaml` for YAML parsing and `ajv` with `ajv-formats` for schema validation. Both run without native bindings in Bun and support JSON Schema Draft-07. The `select-yaml-schema-tooling` change should pin these packages and wire them into build and test rather than performing open-ended tooling research.
- Reference command surface: the strict CLI should eventually expose the same subcommand verbs as the reference project — `init`, `propose`, `modify`, `apply`, `verify`, `verify-spec-mappings`, `verify-roadmap`, `archive`, `cancel`, `list`, `run-maintenance`, `migrate`, `ship`. This milestone establishes the entrypoint and router only; later milestones port individual subcommands. Intentional behavioral differences from reference behavior must be recorded in `.spec-driven/specs/contracts/yaml-artifacts.md` rather than left as implicit changes.
- Coexistence rule: if `init` detects an existing `.spec-driven/` directory it should emit a single warning and continue without error. Strict CLI commands must read only from `.strict-spec-driven/` and must not scan `.spec-driven/` for workflow state.
- Atomic write strategy: all file write operations must write to a sibling `.partial` file first, then atomically rename to the final path on success. On failure the `.partial` file is left in place and the next run must report it rather than silently overwriting the final target.
- Reference tests reset fixture state and run against compiled `dist/` output; strict tests should keep that pattern once TypeScript sources exist.
- **Spec-to-test traceability**: M01 produced dozens of requirements and scenarios in `.spec-driven/specs/contracts/yaml-artifacts.md`, but none of them are verified by machines yet. The real risk is that detailed specs create a false sense of correctness — specs are for humans, tests are for machines. M02 must close this gap. Every requirement from M01 should have a corresponding test case: positive tests that load valid examples and confirm they pass validation, and negative tests that construct artifacts with missing fields, invalid enums, duplicate IDs, or illegal paths and confirm they produce deterministic validation failures. When M02 is complete, `npm test` should prove that M01's requirements are enforced, not just documented. The `add-yaml-fixtures-and-tests` planned change is the primary vehicle for this; it should trace its test cases back to M01 requirement identifiers rather than testing only ad hoc scenarios.
- **Template bundling rationale**: the reference project inlines all scaffold content into a single compiled JS file, which means its skills have zero external file dependencies. The strict project chose external YAML template files for readability and schema reuse, but this creates a distribution gap: `npx skills add <dir>` copies the entire skill directory, so templates must be visible inside each skill directory. Copying `templates/` into `dist/templates/` at build time, creating `scripts -> ../../dist/scripts` and `templates -> ../../dist/templates` symlinks in each skill directory, and resolving paths relative to `import.meta.url` keeps the readable external-file approach while making both `npx skills add` and direct skill directory usage work correctly.







