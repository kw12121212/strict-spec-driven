# Questions: define-markdown-exception-policy

## Open

<!-- No open questions -->

## Resolved

- [x] Q: Should the recommended change be `define-markdown-exception-policy` from milestone `01-yaml-contracts-and-naming`?
  Context: The roadmap recommendation needed confirmation before scaffolding proposal artifacts.
  A: Yes.
- [x] Q: Which repo unit test command should this change use before the repository has a package and test runner?
  Context: This repository currently has no `package.json` or local test runner, but the spec-driven verifier requires each proposal to name an explicit unit test command.
  A: Use `node --test` as the interim explicit unit tests command for this contract-only proposal until the CLI foundation defines a package test script.
