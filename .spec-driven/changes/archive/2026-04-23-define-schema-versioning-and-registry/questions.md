# Questions: define-schema-versioning-and-registry

## Open

None.

## Resolved

- [x] Q: Should `define-schema-versioning-and-registry` and `define-migration-compatibility-contract` be handled as one spec change?
  Context: The roadmap lists them as separate planned changes, but migration compatibility depends on stable schema IDs, artifact types, version compatibility, and registry lookup behavior.
  A: Yes. Combine both planned items into the same spec change.
