# Design: bootstrap-typescript-cli

## Approach

Mirror the reference project's build and test skeleton (`../auto-spec-driven`) with two changes: replace `npm` with `bun` throughout, and name the package `strict-spec-driven` to match the CLI entrypoint naming contract.

`package.json` uses `"type": "module"` for strict ESM, defines `build` as `bun run tsc` and `test` as `bun run test/run.js`. TypeScript compiles from `src/` to `dist/`. The command router in `src/index.ts` reads `process.argv[2]` and dispatches to subcommand handlers; unknown subcommands print usage and exit non-zero. The test runner at `test/run.js` uses the same `pass/fail` counter pattern as the reference project.

## Key Decisions

- **bun instead of npm**: Project requirement. `bun run build` and `bun test` replace all `npm run` invocations.
- **Package name `strict-spec-driven`**: Matches the CLI entrypoint naming contract defined in Milestone 01 (`strict-cli-entrypoint` requirement).
- **`src/` → `dist/` compilation**: Keeps the same reference project layout so later changes (YAML layer, init, fixtures) slot in without restructuring.
- **Minimal command router only**: The router scaffolds the dispatch pattern but does not implement any subcommand logic; that belongs to later Milestone 02 changes.

## Alternatives Considered

- **Skip the command router and add it later**: Rejected — downstream changes need a stable entrypoint to import and test against. An empty shell still provides the import surface.
- **Use tsx or ts-node for runtime TypeScript**: Rejected — the reference project compiles to `dist/` and tests run against compiled output; keeping that pattern avoids a separate runtime dependency and keeps the test boundary clear.
