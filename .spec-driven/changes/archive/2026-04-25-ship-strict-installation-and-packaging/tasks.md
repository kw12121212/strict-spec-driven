# Tasks: ship-strict-installation-and-packaging

## Implementation

 - [x] Add strict install and uninstall entrypoints for shared/global and
      project-local usage on top of the repository installer.
 - [x] Harden installer behavior so strict package names and targets do not
      silently fall back to legacy-name assumptions.
 - [x] Add or extend smoke coverage for install, uninstall, packaged skill
      layout, and symlink resolution diagnostics.

## Testing

 - [x] Run `bun run validate-skills` — validation command for strict packaging
      surfaces.
 - [x] Run `bun test/run.ts` — unit tests for install, uninstall, and packaging
      smoke coverage.

## Verification

 - [x] Verify implementation matches proposal
