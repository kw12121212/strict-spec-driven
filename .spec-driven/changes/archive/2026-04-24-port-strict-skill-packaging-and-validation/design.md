# Design: port-strict-skill-packaging-and-validation

## Approach

Implement the packaging baseline in four passes:

1. Define strict skill package inventory and naming
- establish strict skill directories and metadata for `strict-spec-*` and
  `strict-roadmap-*`
- remove or reject legacy installer-facing names in strict contexts

2. Wire packaging assumptions used by installed skills
- enforce repository-relative `scripts` and `templates` symlink targets that
  resolve to `dist` bundles
- keep bundled script and template path assumptions explicit and testable

3. Add deterministic validation coverage
- validate required frontmatter metadata fields
- validate referenced commands and command sections
- validate stale legacy names and stale `.spec-driven/` references where strict
  naming is required
- validate symlink integrity and bundled target expectations

4. Add tests or smoke checks for packaging validity and failure diagnostics
- passing case: strict packages with valid metadata and symlinks
- failing cases: stale names, missing command references, broken symlinks

## Key Decisions

- Sequence packaging and validation before broad skill-content rewrites to avoid
  spreading inconsistent naming and metadata across many skill files.
- Keep validation deterministic and file-path specific so skill packaging issues
  are actionable during CI or local checks.
- Treat legacy-name rejection as a packaging guardrail in strict contexts,
  instead of relying on manual reviewer discipline.

## Alternatives Considered

- Update all strict skill prompts first, then harden packaging later.
  Rejected because it increases rework risk if metadata or naming constraints
  change after broad prompt edits.
- Enforce only naming rules and defer symlink checks.
  Rejected because skills may appear installed but fail at runtime if bundled
  links are invalid.
- Keep legacy alias names for convenience.
  Rejected because milestone 04 explicitly requires strict-family naming
  separation outside migration compatibility contexts.
