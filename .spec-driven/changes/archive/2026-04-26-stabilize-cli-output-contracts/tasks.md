# Tasks: stabilize-cli-output-contracts

## Implementation

- [x] Create `src/cli/output.ts` with `writeJson`, `writeOut`, `writeErr`, `writeUsage`, and `writeError` helpers
- [x] Update `cmd-change.ts` to use output helpers from `src/cli/output.ts`
- [x] Update `cmd-migration.ts` to use output helpers from `src/cli/output.ts`
- [x] Update `cmd-operations.ts` to use output helpers from `src/cli/output.ts`
- [x] Update `cmd-roadmap.ts` to use output helpers from `src/cli/output.ts`
- [x] Update `cmd-scaffold.ts` to use output helpers from `src/cli/output.ts`

## Testing

- [x] Run `bun run build` — typecheck and validate compiled output
- [x] Run `bun test/run.ts` — unit tests confirm no observable output change across all subcommands

## Verification

- [x] Verify implementation matches proposal scope
- [x] Verify no direct `process.stdout.write` or `process.stderr.write` calls remain in any `cmd-*.ts` file
