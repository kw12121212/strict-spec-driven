---
mapping:
  implementation:
    - src/scaffold.ts
    - src/validation.ts
    - package.json
    - test/run.ts
  tests:
    - test/run.ts
---

## ADDED Requirements

### Requirement: cli-build-bundles-templates
The system MUST copy the `templates/` directory into `dist/templates/` as part of the build step so compiled scripts can resolve scaffold and schema assets without depending on the source tree.

#### Scenario: templates appear in dist after build
- GIVEN the TypeScript sources compile successfully
- WHEN `bun run build` completes
- THEN `dist/templates/strict-spec-driven/scaffold/` contains all required scaffold template assets
- AND `dist/templates/strict-spec-driven/schemas/` contains all schema and registry assets

### Requirement: cli-template-resolution-from-dist
The system MUST resolve bundled template directories relative to `import.meta.url` so that compiled scripts in `dist/` find templates under `dist/templates/` without depending on the source tree.

#### Scenario: compiled scripts find scaffold templates
- GIVEN `dist/` contains compiled JS and `dist/templates/` contains copied template assets
- WHEN a compiled script resolves a scaffold template path
- THEN the template is found under `dist/templates/strict-spec-driven/scaffold/`

#### Scenario: compiled scripts find schema assets
- GIVEN `dist/` contains compiled JS and `dist/templates/` contains copied template assets
- WHEN a compiled script resolves a schema path
- THEN the schema is found under `dist/templates/strict-spec-driven/schemas/`

### Requirement: cli-template-resolution-fallback
The system MUST fall back to `../templates/` relative to the module file when `dist/templates/` does not exist, so template resolution works during development before the copy step runs.

#### Scenario: source-tree fallback when dist templates missing
- GIVEN `dist/templates/` does not exist
- WHEN a script resolves a bundled template path
- THEN the template is found under `../templates/strict-spec-driven/` relative to the module file

### Requirement: cli-init-works-from-dist-only
The system MUST allow `strict-spec-driven init` to create scaffold files correctly when run from the compiled `dist/` output without the source tree present.

#### Scenario: init succeeds from dist-only environment
- GIVEN only the `dist/` directory exists with compiled JS and bundled templates
- WHEN `strict-spec-driven init` is executed
- THEN it creates `.strict-spec-driven/` with all required scaffold artifacts

### Requirement: cli-propose-works-from-dist-only
The system MUST allow `strict-spec-driven propose` to create change scaffolds correctly when run from the compiled `dist/` output without the source tree present.

#### Scenario: propose succeeds from dist-only environment
- GIVEN only the `dist/` directory exists with compiled JS and bundled templates
- WHEN `strict-spec-driven propose <name>` is executed
- THEN it creates the change directory with all planning artifacts
