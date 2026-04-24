# Questions: self-host-repo-on-strict-workflow

## Open

<!-- No open questions -->

## Resolved

- [x] Q: What should happen to the bootstrap `.spec-driven/` directory after
      successful self-hosting?
  Context: The cutover needs an explicit repository policy because guidance,
  migration expectations, and unchanged-behavior boundaries depend on whether
  bootstrap artifacts are preserved or removed.
  A: Preserve `.spec-driven/` as legacy migration input for now, while making
  `.strict-spec-driven/` the preferred active workflow state.
