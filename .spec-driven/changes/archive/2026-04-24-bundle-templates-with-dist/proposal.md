# Proposal: bundle-templates-with-dist

## What

Update the build step to copy `templates/` into `dist/templates/`, change template resolution in source modules from `PROJECT_ROOT` (source-tree-relative) to `import.meta.url`-relative paths, and add tests verifying the compiled CLI can locate all required template assets when run from `dist/` alone.

## Why

Currently `scaffold.ts` and `validation.ts` derive `BUNDLED_SCAFFOLD_DIR` and `BUNDLED_SCHEMA_DIR` by resolving `../templates/strict-spec-driven/...` relative to `PROJECT_ROOT` (the parent of the source file's directory). This works when running from the source tree but breaks when running compiled JS from `dist/` — the compiled code would look for `templates/` in `dist/../templates/` rather than `dist/templates/`.

The milestone done criteria require: "The build output under `dist/` includes `templates/` so compiled scripts resolve scaffold and change-template assets without depending on the source tree" and "Tests confirm that the compiled CLI can find all required template assets when run from `dist/` alone."

The planned change also mentions creating `scripts -> ../../dist/scripts` and `templates -> ../../dist/templates` symlinks under each skill directory. This repository has no skill directories yet, so symlink creation is out of scope for this change and should be deferred to milestone 04.

## Scope

- Update `package.json` build script to copy `templates/` into `dist/templates/` after TypeScript compilation.
- In `src/scaffold.ts`, replace the `PROJECT_ROOT` + `BUNDLED_SCAFFOLD_DIR` pattern with `import.meta.url`-relative resolution that works from both source and compiled locations.
- In `src/validation.ts`, replace the `PROJECT_ROOT` + `BUNDLED_SCHEMA_DIR` pattern with `import.meta.url`-relative resolution.
- Add a build-time post-compile step (copy) and verify it runs as part of `bun run build`.
- Add tests that verify the compiled CLI can resolve all required scaffold assets and schema assets from `dist/` without referencing the source tree.
- Add a test that runs `strict-spec-driven init` from a temp directory using only the compiled `dist/` output and confirms scaffold files are created correctly.

## Unchanged Behavior

- `strict-spec-driven init` and `strict-spec-driven propose` continue to work identically from the CLI.
- Template asset contents and validation behavior are unchanged.
- The test harness in `test/run.ts` continues to run against `dist/` output.
- No new runtime dependencies are introduced.
