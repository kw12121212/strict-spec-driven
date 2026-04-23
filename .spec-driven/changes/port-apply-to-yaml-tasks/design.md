# Design: port-apply-to-yaml-tasks

## Approach

Add a `runApply` function in `strict-spec-cli.ts` following the same pattern as `runInit` and `runPropose`. The function accepts the change name as a CLI argument, resolves the change directory under `.strict-spec-driven/changes/`, reads and parses `tasks.yaml`, finds the first task with `status: pending` across all sections, sets it to `complete`, writes the file back, and prints a JSON status object to stdout.

A dedicated `applyTask` function in a new `src/apply.ts` module handles the core logic: locating the next pending task, updating it, and producing the status result. This keeps the CLI handler thin and the apply logic testable independently.

## Key Decisions

- **One-task-at-a-time**: `apply` completes exactly the first pending task per invocation. This matches the reference workflow semantics and forces incremental progress rather than bulk completion.
- **JSON status output**: The command emits a structured JSON object to stdout so downstream tooling and skills can parse task state without scraping human-readable text. Human-readable summary goes to stderr.
- **Dedicated module**: Core apply logic lives in `src/apply.ts`, separate from CLI wiring, so unit tests can call it directly without spawning a subprocess.
- **File-level round-trip**: Read the full `tasks.yaml`, modify only the target task's `status` field, write the whole file back. This preserves comments, ordering, and any future fields added by other commands.

## Alternatives Considered

- **Accept task ID argument**: Could allow `apply <name> <task-id>` to complete a specific task. Rejected for now — one-task-at-a-time is simpler and matches the reference workflow. Can be added later if needed.
- **Interactive mode**: Could prompt the user to select which task to complete. Rejected — adds complexity and doesn't match the non-interactive CLI design of the existing commands.
- **Batch mode**: Could complete all pending tasks at once. Rejected — undermines the incremental progress model and would bypass the verify gate that `port-verify-to-yaml` will enforce.
