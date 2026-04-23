# Design: define-yaml-spec-and-delta-model

## Approach

Add contract-focused delta requirements under `specs/contracts/` that define the
observable YAML shape of main specs and delta specs.

The contract will stay at the behavior level. It will define which concepts must
be represented as structured YAML fields, how stable identifiers are used for
matching, which enum values validators must recognize, and which Markdown-era
conventions are replaced by structured fields. It will not introduce source
files, validators, parser code, or migration logic.

## Key Decisions

- Treat requirement identity as a stable YAML field rather than deriving it from
  a Markdown heading.
- Treat spec identity as a stable YAML field so archive and validation workflows
  do not need to infer spec identity from paths alone.
- Treat RFC 2119 strength as a structured enum field instead of scanning prose
  for MUST, SHOULD, or MAY.
- Keep observable requirement text separate from identifier and strength fields
  so validators can check both structure and behavior statements.
- Represent scenario steps as ordered structured entries with explicit step
  kinds, preserving GIVEN, WHEN, THEN, and AND semantics without depending on
  bullet formatting.
- Keep implementation and test mappings in structured file-level fields using
  normalized repo-relative paths, preserving the reference project's mapping
  boundary.
- Represent delta specs as explicit ADDED, MODIFIED, and REMOVED collections so
  archive and verification commands can operate without Markdown section
  parsing.
- Require minimal valid examples for both main specs and delta specs so later
  validators and migration tests have concrete target documents without this
  change selecting a parser or schema library.

## Alternatives Considered

- Start with the Markdown exception policy: rejected for now because the
  spec/delta model is more directly blocking for validation, archive, migration,
  and CLI foundation work.
- Start with the migration compatibility contract: rejected because migration
  needs a target YAML spec and delta shape before source-to-target mapping can be
  defined safely.
- Allow requirement bodies to remain Markdown strings inside YAML: rejected
  because it would preserve the ambiguity this project is intended to remove.
- Use generated numeric identifiers for requirements and scenarios: rejected for
  the contract because human-authored stable IDs better preserve reviewability
  and archive matching across agent edits.
