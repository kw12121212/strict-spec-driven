# Design: define-yaml-artifact-schemas

## Approach

Add a contract-focused delta spec under `specs/contracts/` that describes the
required behavior of strict YAML artifact schemas.

The spec will stay at the observable behavior level. It will require the system
to define complete YAML schema coverage, field contracts, examples, and
validation-ready rules without choosing implementation libraries or creating the
CLI foundation in this change.

## Key Decisions

- Treat this as a spec-only planning change. The repository has no source tree,
  package manifest, or test runner yet, so implementation mappings would be
  invented if added now.
- Keep schema coverage broad enough to unblock later work, while leaving
  directory naming, command naming, and migration compatibility to their
  dedicated roadmap items.
- Require structured YAML fields for workflow meaning. This prevents the strict
  variant from recreating Markdown heading/list parsing through YAML string
  blobs.
- Include examples as part of the schema contract so future validators and
  tests have concrete valid documents to target.

## Alternatives Considered

- Start with `define-strict-directory-and-prefixes`: rejected for now because
  naming can be documented once the artifact contract has a stable target.
- Start with `bootstrap-typescript-cli`: rejected because the CLI would need to
  guess schema shapes before the contract exists.
- Define only the spec and delta schema first: rejected because proposals,
  tasks, questions, indexes, and roadmap artifacts also need shared structure
  before later workflows can be ported consistently.
