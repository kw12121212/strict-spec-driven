# Tasks: bootstrap-typescript-cli

## Implementation

- [x] Add `package.json` with name `strict-spec-driven`, `"type": "module"`, `build` script (`bun run tsc`), `test` script (`bun run test/run.js`), and TypeScript as a dev dependency
- [x] Add `tsconfig.json` with `strict`, `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist`, and `rootDir: src` following the reference project config
- [x] Add `src/index.ts` as the CLI entrypoint with a minimal command router that reads `process.argv[2]`, dispatches to a subcommand map, prints usage for unknown commands, and exits non-zero on failure
- [x] Add `test/run.js` test runner using the reference project's pass/fail counter pattern and at least one smoke test that imports and calls the compiled entrypoint module

## Testing

- [x] Run `bun run build` — typecheck and compile `src/` to `dist/` with zero TypeScript errors
- [x] Run `bun test/run.ts` — unit tests pass with the smoke test confirming the compiled entrypoint is reachable

## Verification

- [x] Verify implementation matches proposal scope: `dist/` output exists, `bun run build` and `bun run test/run.js` both pass, `.strict-spec-driven/` contents are unmodified
