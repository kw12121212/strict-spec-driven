# extract-cli-change-discovery-and-status

## What

Move change listing, archive matching, active-status calculation, and the
shared filesystem path helpers they depend on out of `src/strict-spec-cli.ts`
into two focused modules: `src/cli/changes.ts` and `src/cli/fs.ts`.

## Why

`src/strict-spec-cli.ts` is ~1073 lines and mixes command handlers, shared
filesystem utilities, and change-discovery logic in one file. The list, modify,
cancel, and ship command handlers all reach into this file for helpers that have
nothing to do with the entrypoint itself. Extracting these helpers into their
own modules gives future command handler splits clean, non-circular imports to
depend on — and reduces the entrypoint size before the larger handler extraction
in `extract-cli-command-handlers-by-domain`.

## Scope

In scope:
- Create `src/cli/changes.ts` exporting: `getChangesDir`, `getArchiveDir`,
  `readActiveChangeStatus`, `listActiveChanges`, `listArchivedChanges`,
  `findArchivedMatchesByBareName`
- Create `src/cli/fs.ts` exporting: `listDirectoryNames`, `listYamlFiles`,
  `listFilesRecursive`, `normalizeRepoRelativePath`, `normalizePathSeparators`
- Remove the extracted functions from `src/strict-spec-cli.ts` and replace
  with imports from the new modules
- `escapeRegExp` moves as an unexported helper inside `src/cli/changes.ts`

Out of scope:
- Spec-mapping audit helpers (`makeMappingDiagnostic`, `normalizeMappedPath`,
  `parseSpecMapping`) — those belong in `extract-cli-spec-mapping-audit`
- Any change to command names, exit codes, output text, or JSON shapes
- Splitting command handler bodies into domain-oriented modules

## Unchanged Behavior

All observable command behavior for `list`, `modify`, `cancel`, `ship`, and any
other command that reads change discovery state must remain identical: same
output text, same JSON structures, same exit codes.
