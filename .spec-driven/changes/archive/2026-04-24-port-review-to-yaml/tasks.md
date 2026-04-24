# Tasks: port-review-to-yaml

## Implementation

- [x] Create `src/review.ts` with artifact reading, internal verify call, finding generation, and JSON output logic
- [x] Register the `review` subcommand in `src/strict-spec-cli.ts` routing table
- [x] Ensure review exits non-zero with a clear error when the change directory does not exist or artifacts are unparseable

## Testing

- [x] Run `bun run build` — typecheck and compile review module with zero errors
- [x] Run `bun test/run.ts` — unit tests covering review happy path, missing change, all-findings-empty, and at least one finding-generating case

## Verification

- [x] Verify implementation matches proposal scope
