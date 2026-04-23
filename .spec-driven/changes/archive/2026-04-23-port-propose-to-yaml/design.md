# Design: port-propose-to-yaml

## Approach

- Add a `propose` command path in the strict CLI that validates the requested
  change name, resolves the strict changes root, and creates the target change
  directory.
- Rename the CLI entry source file from `src/index.ts` to
  `src/strict-spec-cli.ts` (compiled as `dist/strict-spec-cli.js`) and update
  related references so command
  ownership is explicit in the source layout.
- Seed required YAML artifacts (`proposal.yaml`, `design.yaml`, `tasks.yaml`,
  `questions.yaml`) from bundled strict templates so artifact shape is
  deterministic.
- Create a mirrored `specs/` directory in the scaffolded change and leave delta
  content to agent-authored planning work.
- Return machine-readable, path-oriented command output that confirms what was
  created and where follow-up edits should happen.

## Key Decisions

- Keep `propose` limited to deterministic artifact scaffolding; do not couple
  apply/verify/archive semantics into this change.
- Include the CLI entry filename correction in this same change to avoid
  splitting command-surface work across two near-term refactors.
- Reuse strict template assets rather than inline ad hoc YAML assembly in the
  command implementation.
- Fail fast when a change already exists to preserve non-destructive behavior.
- Keep strict output rooted in `.strict-spec-driven/changes/` to preserve
  separation from bootstrap `.spec-driven/` state.

## Alternatives Considered

- Scaffolding Markdown artifacts first and converting later:
  rejected because it breaks the strict YAML-first contract for milestone 03.
- Allowing `propose` to overwrite existing change directories:
  rejected because it risks data loss and non-deterministic planning state.
- Delaying specs updates until later core commands land:
  rejected because this command needs observable contract coverage as soon as it
  is introduced.
