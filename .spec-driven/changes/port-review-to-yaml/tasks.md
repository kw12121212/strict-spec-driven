# Tasks: port-review-to-yaml

## Implementation

- [ ] Create `src/review.ts` with artifact reading, internal verify call, finding generation, and JSON output logic
- [ ] Register the `review` subcommand in `src/strict-spec-cli.ts` routing table
- [ ] Ensure review exits non-zero with a clear error when the change directory does not exist or artifacts are unparseable

## Testing

- [ ] Run `bun run build` — typecheck and compile review module with zero errors
- [ ] Run `bun test/run.ts` — unit tests covering review happy path, missing change, all-findings-empty, and at least one finding-generating case

## Verification

- [ ] Verify implementation matches proposal scope
