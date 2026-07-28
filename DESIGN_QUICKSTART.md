# Design Quickstart

English | [中文](DESIGN_QUICKSTART.zh.md)

A condensed getting-started guide for authoring architecture artifacts (`.strict-spec-driven/architecture.yaml`), verifying implementation mappings, rendering `DESIGN.md`, and enforcing anti-drift checks in a `strict-spec-cli` project.

---

## 1. Prerequisites & Workflow Check

Verify your project is initialized for strict spec-driven workflow:

```sh
strict-spec-cli check-workflow-state
```

If `.strict-spec-driven/` is missing, initialize it first with `/strict-spec-init`.

---

## 2. Inspect Architecture Schema and Samples

Understand the required structure before editing:

```sh
# View JSON schema for architecture artifacts
strict-spec-cli schema-show architecture

# View a valid sample architecture YAML file
strict-spec-cli sample-show architecture
```

---

## 3. Author `.strict-spec-driven/architecture.yaml`

Create or edit `.strict-spec-driven/architecture.yaml` with components, data flows, and architectural decisions:

```yaml
version: 1
components:
  cli:
    responsibility: Parse user command-line arguments and route to sub-handlers.
    boundaries: Deliberately does not implement domain rendering logic.
    dependencies:
      - design-renderer
    implementation:
      - src/cli/cmd-design.ts
      - src/cli/entrypoint.ts

data_flows:
  render_design_doc:
    trigger: User runs `strict-spec-cli design-generate`
    steps:
      - Read architecture.yaml, spec index, and technical standards
      - Merge components, flows, decisions, specs, and tech into Markdown
      - Write output file to disk
    components:
      - cli
      - design-renderer

decisions:
  single_source_of_truth:
    decision: DESIGN.md is strictly generated from YAML sources and must never be hand-edited.
    rationale: Hand-edits drift over time; generating ensures consistency with code and specs.
    rejected_alternatives:
      - Manual Markdown documentation maintaining separate architecture diagrams.
    status: accepted
```

---

## 4. Check Status and Implementation Mapping Drift

Validate schema correctness and verify mapped implementation paths:

```sh
strict-spec-cli design-status
```

`design-status` reports:
- Schema validation status and diagnostics.
- Total count of components, data flows, and decisions.
- Stale or missing mapped implementation paths (`mappingDrift`).

---

## 5. Render `DESIGN.md`

Generate `DESIGN.md` at the repository root (or custom output path):

```sh
# Render to root DESIGN.md
strict-spec-cli design-generate

# Render to custom path
strict-spec-cli design-generate --output docs/ARCHITECTURE.md
```

---

## 6. Enforce Anti-Drift in CI / Automation

Run in `--check` mode to verify that `DESIGN.md` matches current YAML sources without writing files:

```sh
strict-spec-cli design-generate --check
```

- Exits `0` if `DESIGN.md` is current.
- Exits `1` if `DESIGN.md` is stale or missing, listing the stale source files.

---

## Summary of Commands

| Command | Description |
| :--- | :--- |
| `strict-spec-cli design-status` | Validate `architecture.yaml` and report mapping drift |
| `strict-spec-cli design-generate` | Render `DESIGN.md` from architecture, spec index, and tech standards |
| `strict-spec-cli design-generate --check` | Verify `DESIGN.md` is up to date without writing changes |
| `strict-spec-cli schema-show architecture` | Show the architecture YAML JSON schema |
| `strict-spec-cli sample-show architecture` | Show sample architecture YAML file |
