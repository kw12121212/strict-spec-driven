# stabilize-cli-output-contracts

## What

Create `src/cli/output.ts` with shared output helpers (`writeJson`, `writeOut`, `writeErr`, `writeUsage`, `writeError`) and update all `cmd-*.ts` command modules to route stdout and stderr writes through those helpers instead of calling `process.stdout.write` and `process.stderr.write` directly.

## Why

Output shaping is currently distributed across five command modules with two inconsistent JSON emission patterns (`JSON.stringify(result) + "\n"` vs `\`${JSON.stringify(result)}\n\``). As the CLI surface continues to evolve, per-module output calls make it easy to drift the format of a single command or accidentally introduce a whitespace or encoding difference. Centralizing into a thin shared module makes all observable output shapes stable and auditable from one place, which is the prerequisite for reliable project-level regression coverage.

## Scope

In scope:
- Create `src/cli/output.ts` with typed output helpers
- Update `cmd-change.ts`, `cmd-migration.ts`, `cmd-operations.ts`, `cmd-roadmap.ts`, and `cmd-scaffold.ts` to use the shared helpers
- Normalize the two inconsistent JSON emission patterns into one canonical form

Out of scope:
- Changing any command name, flag, exit code, JSON field name, or human-readable output text
- Modifying domain modules (`apply.ts`, `archive.ts`, `verify.ts`, `review.ts`, `roadmap.ts`, `migrate.ts`, etc.)
- Adding new commands or output modes

## Unchanged Behavior

- All JSON field names and structure for every subcommand output remain identical
- All human-readable output text (init, propose, list, modify, cancel confirmations) remains identical
- All usage hint strings remain identical
- All error message formats remain identical
- All exit codes remain identical
