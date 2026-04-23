# Questions: define-command-naming-model

## Open

<!-- No open questions -->

## Resolved

- [x] Q: Should the strict CLI entrypoint remain compatible with `spec-driven`, or should it become a strict-specific entrypoint such as `strict-spec-driven`?
  Context: The command naming model must distinguish skill names, slash commands, CLI entrypoints, CLI subcommands, and installer-facing names before CLI foundation work begins.
  A: Use a strict-specific CLI entrypoint. This proposal records `strict-spec-driven` as the strict CLI entrypoint, with legacy compatibility aliases deferred to migration-specific work if needed.
