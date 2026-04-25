# Tasks: extract-cli-change-discovery-and-status

## Implementation

- [x] Create `src/cli/fs.ts` with `listDirectoryNames`, `listYamlFiles`, `listFilesRecursive`, `normalizeRepoRelativePath`, and `normalizePathSeparators` extracted verbatim from `src/strict-spec-cli.ts`
- [x] Create `src/cli/changes.ts` with `getChangesDir`, `getArchiveDir`, `readActiveChangeStatus`, `listActiveChanges`, `listArchivedChanges`, and `findArchivedMatchesByBareName` extracted from `src/strict-spec-cli.ts`, importing shared helpers from `src/cli/fs.ts`
- [x] Remove the extracted function definitions from `src/strict-spec-cli.ts` and replace with imports from `src/cli/changes.ts` and `src/cli/fs.ts`

## Testing

- [x] Run `bun run build` — typecheck and compile the extracted modules end-to-end
- [x] Run `bun test/run.ts` — run unit tests to confirm list, modify, cancel, and ship command behavior is unchanged after the extraction

## Verification

- [x] Verify implementation matches proposal scope
