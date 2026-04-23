# Tasks: implement-strict-init

## Implementation

- [x] Add `init` command wiring in the CLI router and implement strict scaffold
      creation under `.strict-spec-driven/` from bundled template assets.
- [x] Implement idempotent non-clobber behavior so rerunning `init` preserves
      existing strict workflow artifacts.
- [x] Add warning behavior for `.spec-driven/` coexistence while allowing
      strict scaffold generation to continue.

## Testing

- [x] Run `bun run build` — build validation for init command and scaffold
      integration changes
- [x] Run `bun test/run.ts` — unit tests covering strict init scaffold
      generation, idempotency, and coexistence warning behavior

## Verification

- [x] Verify implementation matches proposal scope
