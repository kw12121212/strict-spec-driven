# Design: stabilize-cli-output-contracts

## Approach

Add `src/cli/output.ts` exporting five thin helpers:

- `writeJson(result: unknown): void` — writes `JSON.stringify(result) + "\n"` to stdout; normalizes the two current patterns into one
- `writeOut(text: string): void` — writes arbitrary human-readable text to stdout (replaces direct `process.stdout.write` calls for non-JSON lines)
- `writeErr(text: string): void` — writes to stderr without a prefix (replaces bare `process.stderr.write` calls)
- `writeUsage(usage: string): void` — writes a usage hint to stderr (semantic alias for `writeErr` that makes intent clear at the call site)
- `writeError(message: string): void` — writes `Error: ${message}\n` to stderr (replaces the repeated `Error: ` prefix pattern)

Each helper is a one-liner that formats and delegates to `process.stdout.write` or `process.stderr.write`. No buffering, no streams, no interfaces — just named formatting points.

Update each `cmd-*.ts` to import and use these helpers in place of the direct `process` calls. Domain module return values are unchanged; only the final write call in each command handler changes.

## Key Decisions

- **Five helpers, not one**: Splitting by semantic role (`writeJson`, `writeOut`, `writeErr`, `writeUsage`, `writeError`) makes each call site self-documenting and prevents callers from accidentally writing human text through the JSON path.
- **No abstraction over `process`**: The helpers call `process.stdout/stderr.write` directly. Injecting a writable interface would allow test isolation without spawning a subprocess, but the existing test suite already uses subprocess invocation, so the added complexity isn't justified by this change.
- **Normalize JSON emission pattern now**: Both `+ "\n"` and template literal forms produce identical output, but unifying them removes a future source of confusion when reading or auditing command output paths.

## Alternatives Considered

- **Output class or singleton**: Adds state and lifetime concerns without any benefit for a CLI that writes once and exits. Rejected.
- **Pass output helpers as arguments to command functions**: Enables dependency injection but requires changing every command function signature. Over-engineering for a scope that is purely about format stability. Rejected.
- **Leave `cmd-change.ts` unchanged** (it already defines `printChangeArtifacts` as a local helper): The module still calls `process.stdout.write` directly in ten other places. Partial centralization would leave the inconsistency in the largest command module. Rejected.
