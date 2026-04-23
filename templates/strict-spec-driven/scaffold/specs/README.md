# Strict Specs

Current-state YAML specifications for the project.

## Format

```yaml
schema: strict-spec-driven/main-spec/v1
schema_version: 1
artifact_type: main_spec
schema_file: ../schemas/main-spec.yaml
spec:
  id: example-spec
  title: Example Spec
mapping:
  implementation:
    - src/example.ts
  tests:
    - test/example.test.ts
requirements:
  - id: req-example
    strength: MUST
    statement: The system MUST provide an observable behavior.
    scenarios:
      - id: scenario-example
        title: success
        steps:
          - kind: GIVEN
            text: a valid precondition
          - kind: WHEN
            text: an action is performed
          - kind: THEN
            text: the expected behavior is observed
```

## Conventions

- Use stable IDs for specs, requirements, and scenarios.
- Keep mappings in structured fields, not requirement prose.
- Keep each spec focused on one observable behavior area.
