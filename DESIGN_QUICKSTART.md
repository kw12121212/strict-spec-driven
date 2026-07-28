# UI Design System Quickstart

English | [中文](DESIGN_QUICKSTART.zh.md)

A condensed getting-started guide for authoring UI design system artifacts (`.strict-spec-driven/design-system.yaml`), verifying implementation & snapshot mappings, rendering `DESIGN.md`, and enforcing anti-drift checks in a `strict-spec-cli` project.

---

## 1. Prerequisites & Workflow Check

Verify your project is initialized for strict spec-driven workflow:

```sh
strict-spec-cli check-workflow-state
```

If `.strict-spec-driven/` is missing, initialize it first with `/strict-spec-init`.

> [!NOTE]
> The design system artifact is optional. A project with no user interface (e.g. backend service, library, CLI) does not require one.

---

## 2. Inspect Design System Schema and Samples

Understand the required structure before editing:

```sh
# View JSON schema for design system artifacts
strict-spec-cli schema-show design-system

# View a valid sample design system YAML file
strict-spec-cli sample-show design-system
```

---

## 3. Author `.strict-spec-driven/design-system.yaml`

Create or edit `.strict-spec-driven/design-system.yaml` to record design tokens, component mappings, and design guidance:

```yaml
schema: strict-spec-driven/design-system/v1
schema_version: 1
artifact_type: design_system
schema_file: templates/strict-spec-driven/schemas/design-system.yaml
design_system:
  id: app-design-system
  title: Application UI Design System
tokens:
  colors:
    primary: "#1A73E8"
    surface: "#FFFFFF"
    text: "#202124"
  typography:
    body:
      fontFamily: Inter, system-ui, sans-serif
      fontSize: 16px
      fontWeight: 400
      lineHeight: 1.5
    heading:
      fontFamily: Inter, system-ui, sans-serif
      fontSize: 28px
      fontWeight: 600
      lineHeight: 1.25
  layout:
    sm: 8px
    md: 16px
    lg: 24px
  elevation:
    card: 0 1px 3px rgba(0, 0, 0, 0.12)
  shapes:
    rounded: 8px
components:
  primary-button:
    title: Primary Button
    description: Primary action button across the user interface.
    tokens:
      backgroundColor: colors.primary
      textColor: colors.surface
      padding: layout.md
      rounded: shapes.rounded
    mapping:
      implementation:
        - src/components/button.tsx
      snapshots:
        - test/snapshots/button.png
guidance:
  overview: >-
    Clean, modern visual identity favoring accessible contrast and consistent spatial rhythm.
  do:
    - Use declared color tokens for all visual elements.
  dont:
    - Do not introduce ad-hoc hex colors in component styles.
```

### Scope Boundaries: What Belongs Where

- **Design System Artifact (`design-system.yaml`)**: Visual identity (tokens, components, visual guidance).
- **Main Specs (`.strict-spec-driven/specs/`)**: Observable UI behavior (states, loading, error handling, interactive flows).
- **`ui`-category Tech Standards (`.strict-spec-driven/tech/`)**: UI engineering rules (styling conventions, i18n, accessibility baselines).

---

## 4. Check Status and Implementation Mapping Drift

Validate schema correctness and verify mapped implementation and snapshot paths:

```sh
strict-spec-cli design-status
```

`design-status` reports:
- Schema validation status and diagnostics.
- Total count of token groups, declared tokens, and components.
- Stale or missing mapped implementation paths and visual regression snapshot paths (`mappingDrift`).

---

## 5. Render `DESIGN.md`

Generate `DESIGN.md` at the repository root (or custom output path):

```sh
# Render to root DESIGN.md
strict-spec-cli design-generate

# Render to custom path
strict-spec-cli design-generate --output docs/DESIGN.md
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
| `strict-spec-cli design-status` | Validate `design-system.yaml` and report mapping drift |
| `strict-spec-cli design-generate` | Render `DESIGN.md` from `design-system.yaml` |
| `strict-spec-cli design-generate --check` | Verify `DESIGN.md` is up to date without writing changes |
| `strict-spec-cli schema-show design-system` | Show the design system YAML JSON schema |
| `strict-spec-cli sample-show design-system` | Show sample design system YAML file |
