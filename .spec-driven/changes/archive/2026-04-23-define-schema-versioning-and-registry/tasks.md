# Tasks: define-schema-versioning-and-registry

## Implementation

- [x] Add schema registry, schema versioning, artifact type, and compatibility requirements to the strict YAML artifact contract
- [x] Add migration compatibility requirements for supported legacy `.spec-driven/` Markdown artifact roles and strict YAML output artifact types
- [x] Define unsupported-shape warning and manual follow-up reporting behavior for migration tooling
- [x] Align concrete schema files and examples with the registry/versioning contract where required
- [x] Verify the combined scope covers both roadmap planned items: `define-schema-versioning-and-registry` and `define-migration-compatibility-contract`

## Testing

- [x] Run validation command `python3 -c "import glob, yaml; [yaml.safe_load(open(path, encoding='utf-8')) for path in glob.glob('.strict-spec-driven/schemas/*.yaml') + glob.glob('.strict-spec-driven/examples/*.yaml')]; print('yaml ok')"` to parse all strict schema and example YAML files
- [x] Run unit test command `find . -maxdepth 2 -type f -name 'package.json' -o -name 'pnpm-lock.yaml' -o -name 'package-lock.json' -o -name 'yarn.lock' -o -name 'deno.json' -o -name 'tsconfig.json'` to confirm no package-level unit test runner exists before the CLI foundation change

## Verification

- [x] Verify implementation matches proposal scope
- [x] Verify migration compatibility requirements remain contract-only and do not implement the migration command
