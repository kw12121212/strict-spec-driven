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

The artifact's declared `schema_file` resolves beneath the shared schema cache root `~/.strict-spec-schemas/` (or `STRICT_SPEC_SCHEMA_CACHE_DIR`); installed skills never assume a source-repository `templates` directory.

---

## 3. Create the Artifact

`init` deliberately does not scaffold a design system artifact, because most projects have no user interface. Create it explicitly once you know the project does:

```sh
strict-spec-cli design-init
```

This writes a schema-valid skeleton with empty token and component collections, so `design-status` works immediately and you edit a valid artifact instead of composing one from nothing. An existing artifact is reported as `skipped` and left byte-identical — never overwritten — so the command is safe to re-run.

---

## 4. Author `.strict-spec-driven/design-system.yaml`

The design system artifact is CLI-owned YAML: fill in the skeleton through `design-edit` named arguments rather than by writing YAML text. Consult `strict-spec-cli design-edit --help --json` for the full argument contract:

```sh
strict-spec-cli design-edit --token-group colors --token primary --token-value "#1A73E8"

strict-spec-cli design-edit --component primary-button \
  --component-title "Primary Button" \
  --component-description "Primary action button across the user interface." \
  --component-token "backgroundColor=colors.primary" \
  --implementation src/components/button.tsx \
  --snapshot test/snapshots/button.png

strict-spec-cli design-edit \
  --overview "Clean, modern visual identity favoring accessible contrast." \
  --do "Use declared color tokens for all visual elements." \
  --dont "Do not introduce ad-hoc hex colors in component styles."
```

The artifact the CLI produces looks like this (read-only reference):

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

## 5. Check Status and Implementation Mapping Drift

Validate schema correctness and verify mapped implementation and snapshot paths:

```sh
strict-spec-cli design-status
```

`design-status` reports:
- Schema validation status and diagnostics.
- Total count of token groups, declared tokens, and components.
- Stale or missing mapped implementation paths and visual regression snapshot paths (`mappingDrift`).

---

## 6. Render `DESIGN.md`

Generate `DESIGN.md` at the repository root (or custom output path):

```sh
# Render to root DESIGN.md
strict-spec-cli design-generate

# Render to custom path
strict-spec-cli design-generate --output docs/DESIGN.md
```

---

## 7. Enforce Anti-Drift

Run in `--check` mode to verify that `DESIGN.md` matches current YAML sources without writing files:

```sh
strict-spec-cli design-generate --check
```

- Exits `0` if `DESIGN.md` is current.
- Exits `1` if `DESIGN.md` is stale or missing, listing the stale source files.

To have this checked on a schedule rather than on demand, declare it as a maintenance check in `.strict-spec-driven/config.yaml`:

```yaml
maintenance:
  checks:
    - type: generated-doc-check
```

`strict-spec-cli maintenance` then reports a stale `DESIGN.md` (and `ARCHITECTURE.md`) as a finding naming the stale sources and the re-render command, and seeds a maintenance change recording it. It never re-renders the document itself, and it stays silent for a document you have not rendered.

---

## 8. Keep the Artifact Aligned With the Code

`--check` and `generated-doc-check` compare `DESIGN.md` against `design-system.yaml`. Neither can tell that the *artifact* has fallen behind the interface — that a component was deleted, or a palette retuned. `design-status` catches only mapped paths that no longer exist.

For that, use `/strict-spec-design-sync`. It scans the stylesheets, theme files, and UI sources, reports each divergence between the code and the recorded identity, and reconciles the artifact after you confirm every edit, then re-renders the document.

---

## Summary of Commands

| Command | Description |
| :--- | :--- |
| `strict-spec-cli design-init` | Create `design-system.yaml` from the bundled scaffold, skipping an existing one |
| `strict-spec-cli design-status` | Validate `design-system.yaml` and report mapping drift |
| `strict-spec-cli design-generate` | Render `DESIGN.md` from `design-system.yaml` |
| `strict-spec-cli design-generate --check` | Verify `DESIGN.md` is up to date without writing changes |
| `strict-spec-cli schema-show design-system` | Show the design system YAML JSON schema |
| `strict-spec-cli sample-show design-system` | Show sample design system YAML file |
| `strict-spec-cli maintenance` | Report a stale `DESIGN.md` when `generated-doc-check` is configured |

## Related Skills

| Skill | Use it for |
| :--- | :--- |
| `/strict-spec-design` | Authoring or refreshing the design system artifact, then rendering `DESIGN.md` |
| `/strict-spec-design-sync` | Reconciling the artifact with UI code that has since changed |
