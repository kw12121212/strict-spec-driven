# Design: define-command-naming-model

## Approach

Add contract-focused delta requirements under `specs/contracts/` that turn the
remaining naming decisions into observable behavior. The change keeps naming
rules at the contract level rather than implementing commands, because the
strict TypeScript CLI foundation has not been bootstrapped yet.

The delta spec will extend the existing `cli-naming-remains-separate`
requirement by defining the command surfaces and then adding explicit rules for
the CLI entrypoint, CLI subcommands, and installer-facing names.

## Key Decisions

- Use `strict-spec-driven` as the strict CLI entrypoint. This matches the
  repository and product name, gives scripts a strict-specific executable, and
  avoids overloading the legacy/reference `spec-driven` command.
- Keep CLI subcommands concise beneath the strict entrypoint, such as `init`,
  `propose`, `verify`, or future roadmap-oriented command names. The entrypoint
  already carries the strict namespace, so repeating `strict-spec-*` in every
  subcommand would make commands harder to read without adding precision.
- Treat skill names and slash commands as agent/user-facing surfaces, distinct
  from CLI entrypoints and subcommands. Skills can keep descriptive strict
  prefixes while scripts use deterministic CLI command names.
- Require installer-facing names to remain strict-explicit. Installation should
  not silently map legacy `spec-driven-*` skills or `spec-driven` commands to
  strict workflows unless migration tooling defines that compatibility.
- Leave legacy compatibility aliases to the migration compatibility roadmap
  item. This prevents the first strict CLI contract from promising aliases that
  could weaken validation or blur strict and legacy workflow state.

## Alternatives Considered

- Reuse `spec-driven` as the strict CLI entrypoint: rejected because it would
  conflate the strict YAML workflow with the reference Markdown-centric command
  surface and make stale-reference validation weaker.
- Prefix every CLI subcommand with `strict-spec-*` or `strict-roadmap-*`:
  rejected because the entrypoint already carries the strict namespace and
  command verbosity would not improve validation.
- Define compatibility aliases now: rejected because the roadmap has a dedicated
  migration compatibility contract, and aliases need to be evaluated against
  migration safety rather than guessed here.
- Leave the CLI entrypoint undecided until implementation: rejected because the
  next milestone needs a stable package and command target before bootstrapping
  scripts, tests, and skill snippets.
