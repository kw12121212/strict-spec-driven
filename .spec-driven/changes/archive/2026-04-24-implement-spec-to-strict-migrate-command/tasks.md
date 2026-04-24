# Tasks: implement-spec-to-strict-migrate-command

## Implementation

 - [x] Add `migrate` command routing and preflight checks for legacy source
      discovery, strict target safety, and overwrite-protection failures
 - [x] Implement migration orchestration and structured report generation for
      converted files, skipped files, warnings, errors, and manual follow-up
      items
 - [x] Add automated coverage for migrate success, unsafe target conflicts,
      malformed or unsupported legacy input handling, and deterministic output

## Testing

 - [x] Run `bun run build` — build validation for migrate command routing and
      report-generation changes
 - [x] Run `bun test/run.ts` — unit tests covering migrate happy path,
      preflight failures, overwrite protection, and report output

## Verification

 - [x] Verify implementation matches the milestone-05 scope without absorbing the
      migration skill, converter-specific mapping work, self-hosting cutover, or
      milestone-06 operations work
