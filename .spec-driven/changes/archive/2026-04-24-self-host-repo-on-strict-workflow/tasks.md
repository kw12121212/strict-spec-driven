# Tasks: self-host-repo-on-strict-workflow

## Implementation

- [x] Run `node dist/strict-spec-cli.js migrate --force` against the repository
      bootstrap state and inspect the generated `.strict-spec-driven/` tree for
      migration, schema, or reference issues
- [x] Fix any strict migration, validation, or command-consumption defects that
      block the migrated repository state from working as real self-hosted
      strict workflow state
- [x] Update `README.md`, `RTK.md`, and related repository guidance to prefer
      `.strict-spec-driven/`, `strict-spec-*`, and `strict-roadmap-*` while
      preserving `.spec-driven/` as legacy migration input
- [x] Add focused regression coverage for any self-host-specific gaps discovered
      during the repository cutover

## Testing

- [x] Run `bun run build` — build validation for strict migration, repository
      guidance, and generated strict-state changes
- [x] Run `bun test/run.ts` — unit tests covering self-host migration
      regressions and existing strict workflow behavior

## Verification

- [x] Verify the repository contains usable `.strict-spec-driven/` self-hosted
      state, guidance reflects the preserved bootstrap policy, and milestone-06
      operations work remains out of scope
