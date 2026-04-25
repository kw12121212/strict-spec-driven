# Design: extract-cli-change-discovery-and-status

## Approach

Two new modules under `src/cli/`:

**`src/cli/fs.ts`** — general filesystem helpers with no domain knowledge:
- `listDirectoryNames(directoryPath)` — sorted directory entry names
- `listYamlFiles(directoryPath)` — recursive sorted YAML file paths
- `listFilesRecursive(directoryPath)` — recursive sorted file paths
- `normalizeRepoRelativePath(rootDir, absolutePath)` — repo-relative slash path
- `normalizePathSeparators(value)` — convert OS separators to forward slashes

**`src/cli/changes.ts`** — change discovery and status with imports from `fs.ts`:
- `getChangesDir(rootDir)` — resolved changes directory path
- `getArchiveDir(rootDir)` — resolved archive directory path
- `readActiveChangeStatus(rootDir, changeName)` — derived status string
- `listActiveChanges(rootDir)` — `ActiveChangeSummary[]`
- `listArchivedChanges(rootDir)` — sorted archive directory names
- `findArchivedMatchesByBareName(rootDir, bareName)` — date-prefix matched names
- `escapeRegExp` stays private inside `changes.ts` (only used there)

`src/strict-spec-cli.ts` removes those function definitions and imports them
from the new modules instead.

## Key Decisions

**Split fs.ts from changes.ts** — `listYamlFiles` and `listFilesRecursive` are
also used by spec-mapping audit. Keeping them in a separate `fs.ts` means the
upcoming `extract-cli-spec-mapping-audit` change can import them without pulling
in change-domain types or constants.

**No new public API surface** — all extracted functions are re-exported from
`src/strict-spec-cli.ts` if they were already exported there; otherwise they
stay internal. The entrypoint barrel keeps its current export shape.

**`escapeRegExp` stays private** — it is only used inside
`findArchivedMatchesByBareName` and has no value as a public export.

## Alternatives Considered

**Single `src/cli/helpers.ts`** — simpler but creates a grab-bag that future
splits (spec-mapping audit, command handlers) would need to split again. Two
modules with clear ownership costs little now and saves the re-split later.
