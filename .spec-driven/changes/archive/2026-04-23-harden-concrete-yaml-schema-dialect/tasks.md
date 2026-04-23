# Tasks: harden-concrete-yaml-schema-dialect

## Implementation

- [x] Update schema files to use stable `schema_id` values and recursive field definitions
- [x] Make planned change entries use the same artifact identity fields as other strict artifacts
- [x] Update minimal examples so `schema` values match schema IDs and no minimal example contains blocking workflow state
- [x] Add coverage examples for delta operations and open questions
- [x] Add task-list testing gates and explicit testing command fields
- [x] Add delta spec requirements for the hardened schema dialect

## Testing

- [x] Run validation command `python3 -c "import glob, yaml; [yaml.safe_load(open(path, encoding='utf-8')) for path in glob.glob('.strict-spec-driven/schemas/*.yaml') + glob.glob('.strict-spec-driven/examples/*.yaml')]; print('yaml ok')"` to parse all schema and example YAML files
- [x] Run validation command `python3 - <<'PY'` identity check to confirm each primary example references its schema file and schema ID
- [x] Run unit test command `find . -maxdepth 2 -type f -name 'package.json' -o -name 'pnpm-lock.yaml' -o -name 'package-lock.json' -o -name 'yarn.lock' -o -name 'deno.json' -o -name 'tsconfig.json'` to confirm no unit test runner exists for this artifact-only change

## Verification

- [x] Verify schema and example hardening matches proposal scope
