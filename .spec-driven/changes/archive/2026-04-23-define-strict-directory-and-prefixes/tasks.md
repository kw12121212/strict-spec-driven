# Tasks: define-strict-directory-and-prefixes

## Implementation

- [x] Add delta spec requirements for `.strict-spec-driven/` as the strict workflow directory
- [x] Add delta spec requirements for `strict-spec-*` and `strict-roadmap-*` skill and slash-command prefixes
- [x] Review the proposal against `README.md`, `RTK.md`, and the `yaml-contracts-and-naming` milestone scope

## Testing

- [x] Run validation command `find . -maxdepth 2 -type f -name 'package.json' -o -name 'pnpm-lock.yaml' -o -name 'package-lock.json' -o -name 'yarn.lock' -o -name 'deno.json' -o -name 'tsconfig.json'` to confirm no lint or validation runner exists for this spec-only change
- [x] Run unit test command `find . -maxdepth 2 -type f -name 'package.json' -o -name 'pnpm-lock.yaml' -o -name 'package-lock.json' -o -name 'yarn.lock' -o -name 'deno.json' -o -name 'tsconfig.json'` to confirm no unit test runner exists for this spec-only change

## Verification

- [x] Verify proposal artifacts match the roadmap item and remain planning-only
