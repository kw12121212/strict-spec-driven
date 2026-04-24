# Tasks: port-strict-skill-packaging-and-validation

## Implementation

- [x] Define strict skill package directories and metadata for
      `strict-spec-*` and `strict-roadmap-*` families.
- [x] Update installer-facing and marketplace metadata to strict naming and
      remove stale legacy install names in strict contexts.
- [x] Implement skill packaging validation for frontmatter metadata, command
      references, stale legacy names, and broken symlink targets.
- [x] Enforce and validate `scripts -> ../../dist/scripts` and
      `templates -> ../../dist/templates` packaging assumptions.
- [x] Add or update automated checks that exercise valid and invalid skill
      packaging states.

## Testing

- [x] Run `bun run build` build validation after packaging and validator updates.
- [x] Run `bun test/run.ts` unit tests for strict skill packaging and
      validation diagnostics.

## Verification

- [x] Verify implementation matches proposal scope
