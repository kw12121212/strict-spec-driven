---
name: strict-spec-design-sync
description: Scan user interface code and the strict YAML design-system artifact for drift, then synchronize the live artifact and re-render the generated design document after user confirmation.
metadata:
  skill_id: strict_spec_design_sync
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user synchronize `.strict-spec-driven/design-system.yaml` with
the visual identity the user interface code already implements.

`/strict-spec-design` authors the artifact from scratch. This skill is for
afterwards: components get added and deleted, palettes get retuned, spacing
scales get renamed, and the recorded identity silently stops matching the code.
`design-status` catches only one kind of drift — a mapped path that no longer
exists — because no script can tell that a hex value in a stylesheet has diverged
from `tokens.colors.primary`. That judgment is this skill's job.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
design-status: strict-spec-cli design-status
design-init: strict-spec-cli design-init
design-edit: strict-spec-cli design-edit [named semantic fields or removals]
design-generate: strict-spec-cli design-generate
design-check: strict-spec-cli design-generate --check
schema-show: strict-spec-cli schema-show design-system
tech-status: strict-spec-cli tech-status
```

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `design-system-state`. Before the first mutation run
`strict-spec-cli yaml-authoring-protocol design-system-state`: that command
reports the ordered authoring steps, the owning command for each operation, and
the bundled schema and example keys with their cache-resolved paths, bound to
the artifact kind and current where a copy would go stale. Validate the result
with `strict-spec-cli design-status`.

**Stop rather than edit YAML directly.** When a required command, argument, or
artifact kind is unavailable, stop and report the missing capability. Editing
the YAML directly, writing a raw payload, or scripting around the CLI is never
an available fallback, and an unavailable command is a reason to stop rather
than a reason to improvise.

## Preferred Human Language

Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` —
the user's common human language, not a programming language — for all
user-facing and generated operator-facing text, including generated design
prose, unless that file is absent or the active user message asks otherwise.

## Scope of This Skill

This skill synchronizes the live design-system artifact directly. It has no
active-change mode, unlike `/strict-tech-sync`:

- There is no delta-design artifact type and archive has no design-system merge
  path, so a design-system edit is never carried inside a change.
- Do not invent a `delta-design` artifact to mirror delta tech.
- When the drift you find is really a change in **observable UI behavior**, it
  belongs in a strict main spec, not here — stop and route it to
  `/strict-spec-brainstorm` or `/strict-spec-propose`.
- When it is really a **UI engineering rule** (design-system usage, styling
  conventions, accessibility baselines, internationalization), it belongs in a
  `ui`-category technical standard — stop and route it to `/strict-tech-sync` or
  `/strict-tech-edit`.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If
`.strict-spec-driven/` is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

1. **Check workflow state** — run `strict-spec-cli check-workflow-state` first.

2. **Read the recorded identity** — run `strict-spec-cli design-status`. It
   reports whether the artifact validates, how many token groups, tokens, and
   components it declares, and which mapped implementation and snapshot paths no
   longer exist. If it reports the artifact as absent, there is nothing to
   synchronize: the project either has no user interface, or it needs
   `strict-spec-cli design-init` and `/strict-spec-design` first. Say so and
   stop rather than authoring an artifact from a sync run.

3. **Choose the scan scope** — if the user already gave one, use it. Otherwise
   ask whether to scan the whole interface or a narrower target such as one
   component family, one theme, or one token group. Respect the answer; do not
   widen a scoped scan into repository-wide maintenance.

4. **Read repository evidence in that scope** — inspect the stylesheets, theme
   and token files, design-system or component-library configuration, and the UI
   sources that consume them. Run `strict-spec-cli tech-status` and read any
   `ui`-category standard so the identity you record stays consistent with the
   rules that bind the code. Use `strict-spec-cli schema-show design-system`
   when a field's shape is unclear; do not guess field names.

5. **Classify drift findings** — compare code evidence to the recorded artifact
   and sort findings into:
   - tokens and components already recorded accurately
   - values the code uses that the artifact records differently
   - tokens or components present in the code but missing from the artifact
   - tokens or components recorded in the artifact that the code no longer has
   - mapped implementation or snapshot paths that no longer resolve
   - inconsistent areas where the team must pick one value before it can be
     recorded (needs human input)
   - findings that belong in a main spec or a `ui` standard instead of here
   - areas in scope with no meaningful drift

6. **Report the drift summary in chat** — cover the scope analyzed, each
   confirmed divergence with its file reference and the current versus recorded
   value, the inconsistencies that need a decision, the findings routed
   elsewhere, and the areas that were clean. Do not write a report file.

7. **Get user confirmation** — before editing the artifact, ask the user to
   confirm each proposed edit: the target token or component id, the operation,
   and the exact value to record. Do not proceed on a plausible guess. A value
   that appears inconsistently across the code is a decision for the user, not a
   majority vote for you to take.

8. **Write confirmed findings to the live artifact** — translate every confirmed finding into a named `strict-spec-cli design-edit` upsert or exact removal. Never edit `.strict-spec-driven/design-system.yaml` directly:
   - keep token and component ids stable; renaming an id reads to a reader as a
     deletion plus an addition and breaks every component token reference that
     points at it
   - preserve authoring order within a group, because the renderer emits entries
     in document order
   - reference tokens from components by their dotted path, such as
     `colors.primary`
   - fix mapping drift by correcting the path or removing the component that no
     longer exists — never delete a mapping merely to silence the report

9. **Re-render and confirm** — run `strict-spec-cli design-generate` to
   re-render the design document, then `strict-spec-cli design-status` for clean
   validation and no mapping drift, then
   `strict-spec-cli design-generate --check` to confirm the rendered document
   matches its source.

10. **Report final changes** — summarize which tokens, components, guidance
   entries, and mappings changed, that the design document was re-rendered, and
   any inconsistency left unresolved and why.

## Rules

- Do not change product code; synchronize only the strict design-system artifact
  and re-render the document it feeds
- Never hand-edit `DESIGN.md` or any file carrying the generated banner; change
  the artifact and re-render
- Never hand-edit `.strict-spec-driven/design-system.yaml`; synchronize it only through `design-edit` named fields and removals
- Read the recorded identity and the applicable `ui` standards before judging
  that any drift exists
- Respect the user-selected scan scope
- Get explicit user confirmation before every artifact edit, and never guess a
  token value the code reports inconsistently
- Do not create a strict change, a delta-design artifact, or a design-system
  artifact from this skill; route behavior changes to main specs and engineering
  rules to `ui`-category standards
- Do not write a standalone report file; the drift summary belongs in chat
- Keep component links in `mapping.implementation` and `mapping.snapshots`, not
  in guidance prose
