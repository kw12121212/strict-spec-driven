# Design: define-schema-versioning-and-registry

## Approach

Extend the existing strict YAML artifact contract with registry and migration
requirements before implementation work begins.

The change should update the contract spec first, then align concrete schema
files and examples only where the contract needs stable registry-facing fields.
If a registry file is materialized during implementation, it should live under
`.strict-spec-driven/schemas/` and describe the available artifact families by
schema ID, artifact type, schema version, schema file, primary example, and
compatibility metadata.

Migration compatibility should be specified as observable behavior: which
legacy Markdown artifact roles are supported as input, which strict YAML
artifact type each role produces, what relationships must be preserved, and how
unsupported shapes are reported for manual follow-up.

## Key Decisions

- Keep `define-schema-versioning-and-registry` as the spec change name because
  it is an existing roadmap planned change; include
  `define-migration-compatibility-contract` in the same scope to avoid splitting
  tightly coupled contract work.
- Treat schema IDs as stable semantic identifiers and schema versions as
  explicit compatibility gates rather than incidental file metadata.
- Put registry lookup under `.strict-spec-driven/schemas/` so validators and
  generators can discover schemas without reading roadmap or proposal files.
- Define migration compatibility in terms of artifact roles and relationships,
  not Markdown formatting details, so migration tooling can report unsupported
  input shapes deterministically.

## Alternatives Considered

- Leave migration compatibility for a later standalone change. This was ruled
  out because migration output depends directly on schema IDs, artifact type
  names, and version compatibility behavior.
- Start the TypeScript CLI foundation first. This was ruled out because the CLI
  should implement a stable registry and migration contract rather than
  discovering those rules during implementation.
- Use file paths alone as schema identity. This was ruled out because examples,
  validators, migration reports, and future version upgrades need stable schema
  IDs that survive file organization changes.
