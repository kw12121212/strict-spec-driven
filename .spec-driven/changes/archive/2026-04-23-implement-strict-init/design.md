# Design: implement-strict-init

## Approach

- Add an `init` command implementation that resolves bundled scaffold template
  paths and materializes `.strict-spec-driven/` with the required directory
  structure and files.
- Reuse existing scaffold helper utilities for template discovery/loading so init
  behavior stays consistent with the shared scaffold asset layer.
- Make writes idempotent by checking for existing targets and skipping overwrite
  of existing strict workflow artifacts.
- Emit deterministic CLI messaging for created vs skipped files and for
  `.spec-driven/` coexistence warnings.

## Key Decisions

- Keep `init` responsibilities limited to strict scaffold filesystem behavior; do
  not couple fixture expansion or non-init command behavior into this change.
- Treat existing `.strict-spec-driven/` artifacts as user-owned state and avoid
  clobbering them on rerun to preserve manual edits and in-progress work.
- Keep `.spec-driven/` coexistence as warning-only so projects can bootstrap
  strict state before migration tooling lands.
- Define observable command behavior in `cli/foundation` delta spec now so later
  fixture/test work can validate against explicit requirements.

## Alternatives Considered

- Overwrite existing strict scaffold files on every run:
  rejected because it is destructive and breaks idempotent bootstrap semantics.
- Fail hard when `.spec-driven/` is present:
  rejected because bootstrap/legacy coexistence is an expected intermediate state.
- Delay spec updates until fixture tests are added:
  rejected because it would decouple implementation from observable behavioral
  contract and reduce test traceability.
