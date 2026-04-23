# Design: add-yaml-fixtures-and-tests

## Approach

Use a fixture-first testing approach that keeps validation expectations
deterministic and reviewable:
- add fixtures for valid and invalid artifact shapes under `test/` so each case
  can be loaded without inline ad hoc YAML strings where possible
- extend `test/run.ts` to assert both pass/fail outcomes and normalized
  diagnostic fields (`artifactPath`, `fieldPath`, and expected/actual payloads
  when available)
- include explicit requirement traceability labels for M01 contract coverage so
  gaps are discoverable during review

## Key Decisions

- Keep the test harness in `test/run.ts` and extend it incrementally instead of
  introducing a new runner, preserving existing project conventions.
- Prioritize deterministic output assertions over snapshot-only checks so
  diagnostics stay stable across runs.
- Focus scope on coverage expansion for existing requirements and avoid
  introducing new observable CLI behavior in this change.
- Reuse current bundled schema/example assets from
  `templates/strict-spec-driven/` to keep fixture data aligned with canonical
  contracts.

## Alternatives Considered

- Adding only inline test payloads without fixture files. Rejected because it
  makes requirement traceability and case reuse harder.
- Deferring M01 traceability until milestone 03. Rejected because milestone 02
  explicitly calls for this safety net before core command ports.
- Expanding into propose/apply/verify command behavior now. Rejected because
  this change is intentionally test-focused and should not absorb milestone 03
  scope.
