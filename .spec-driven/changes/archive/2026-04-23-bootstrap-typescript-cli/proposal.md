# bootstrap-typescript-cli

## What

Add `package.json`, `tsconfig.json`, a TypeScript source entrypoint, a strict ESM command router, compiled `dist/` output, and a repeatable `bun run build` + `bun test` runner for the strict-spec-driven CLI.

## Why

All Milestone 02 implementation work — YAML validation layer, strict init, template assets, and fixtures — requires a compilable TypeScript project with a working build and test harness before any of it can proceed. This change creates that foundation following the conventions established by the reference project at `../auto-spec-driven`.

## Scope

In scope:
- `package.json` with `build` and `test` scripts using bun, TypeScript dev dependency, and strict ESM (`"type": "module"`)
- `tsconfig.json` modelled on the reference project's config
- TypeScript source entrypoint at `src/index.ts` with a minimal command router that dispatches subcommands
- Compiled output to `dist/` via `bun run build`
- Test runner at `test/run.js` following the reference project pattern
- At least one passing smoke test that verifies the compiled entrypoint is reachable

Out of scope:
- YAML parsing or validation logic (covered by `add-yaml-validation-layer`)
- The `init` subcommand implementation (covered by `implement-strict-init`)
- Template asset generation (covered by `create-strict-template-assets`)
- Skill rewrites or installer scripts

## Unchanged Behavior

The existing `.strict-spec-driven/schemas/` and `.strict-spec-driven/examples/` files produced by Milestone 01 must not be modified or removed.
