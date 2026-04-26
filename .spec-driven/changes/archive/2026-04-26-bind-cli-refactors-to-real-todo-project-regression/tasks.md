# Tasks: bind-cli-refactors-to-real-todo-project-regression

## Implementation

- [x] In `test/suites/change-lifecycle.ts` section [15f], add a `list` call after `propose` and before `modify` that asserts the newly proposed change appears as an active entry in `list` output
- [x] In `test/suites/change-lifecycle.ts` section [15f], add an archive-directory lookup scenario by creating archived YAML artifacts in the copied workspace and asserting `modify <archive-dir>` exits zero and reports the artifact paths

## Testing

- [x] Run `bun run build` — typecheck and validate compiled output
- [x] Run `bun test/run.ts` — unit tests confirm list and archive-lookup assertions pass in the copied project workspace

## Verification

- [x] Verify `list` scenario runs against a `createCopiedProjectWorkspace("todo-app")` instance, not a temp dir
- [x] Verify `modify <archive-dir>` scenario uses the same copied workspace, not a separate temp dir
- [x] Verify committed `test/fixtures/projects/todo-app/` baseline is unchanged after all scenarios
