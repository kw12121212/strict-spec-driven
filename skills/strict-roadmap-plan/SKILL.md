---
name: strict-roadmap-plan
description: Create or restructure a strict YAML roadmap under .strict-spec-driven/roadmap/.
metadata:
  skill_id: strict_roadmap_plan
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user create or restructure the strict roadmap.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-generate-milestone: strict-spec-cli roadmap-generate milestone --<named-args>
roadmap-generate-planned-change: strict-spec-cli roadmap-generate planned-change --milestone <milestone-id> --id <planned-change-id> --summary "..." --details "..." [--depends-on <planned-change-id>] [--status <planned|complete>] [--remove-depends-on <planned-change-id>]
roadmap-status: strict-spec-cli roadmap-status
roadmap-sync: strict-spec-cli roadmap-sync [--fix-names]
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Roadmap Linking Rules

- Milestone ownership is defined by `planned_change.milestone`.
- Do not expect milestone files to list standalone planned-change file paths.
- Use `roadmap-status` output to locate planned-change source files; each
  `plannedChanges[]` entry reports its `path`.
- `planned_change.id` and `planned_change.milestone` are the source of truth
  for identity, and the file basename is enforced to match them: the canonical
  planned-change filename is `<milestone-id>-<planned-change-id>.yaml` (the
  milestone prefix is not duplicated when the id already starts with it). A
  misnamed active planned-change file is a blocking validation diagnostic;
  never pick filenames yourself — create planned changes through
  `roadmap-generate planned-change` and repair legacy names with
  `roadmap-sync --fix-names`.

## Preferred Human Language

Before user-facing work, read `.strict-spec-driven/config.yaml` when it exists.
Use the `preferred_human_language` field as the user's common human
language for natural-language responses, questions, summaries, and generated
operator-facing text. This field is a human-language preference, not a
programming language. Comply with that configured common human language unless
the active user message explicitly asks for a different language.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Read strict project context** — inspect `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/specs/INDEX.yaml`, and the main strict YAML specs that
   define the current system.

2. **Inspect the current roadmap state** — run:
   ```bash
   strict-spec-cli roadmap-status
   ```
   Use the returned milestone order, diagnostics, and derived status summaries
   as the basis for any roadmap edits under `.strict-spec-driven/roadmap/`. Use
   the returned `plannedChanges[].path` values when you need to inspect or move
   existing standalone roadmap items.

3. **Create or revise executable roadmap YAML artifacts** — create or update
   milestone files with:
   ```bash
   strict-spec-cli roadmap-generate milestone --id <milestone-id> --title "..." --goal "..." --scope-in "..." --scope-out "..." --done "..." --dependency "..." --risk "..." --note "..." --details "..."
   ```
   A supplied scalar field replaces the recorded value with no extra flag, and list fields always append, so editing one field never discards unrelated recorded content. `--intake-question` values merge by id, and restating an id replaces just that question. Remove a recorded entry by naming it: `--remove-scope-in`, `--remove-scope-out`, `--remove-done`, `--remove-dependency`, `--remove-risk` and `--remove-note` take a substring that must match exactly one entry, and `--remove-intake-question` takes an id. Use `roadmap-generate milestone` for milestone
   YAML shape and milestone-field changes; do not hand-roll milestone schema
   structure.
   Create and update standalone work items with:
   ```bash
   strict-spec-cli roadmap-generate planned-change --milestone <milestone-id> --id <planned-change-id> --summary "..." --details "..." --depends-on <planned-change-id> --status planned
   ```
   The CLI computes the canonical filename
   `<milestone-id>-<planned-change-id>.yaml` under
   `.strict-spec-driven/roadmap/planned-changes/` itself; never choose or edit
   planned-change filenames by hand. Milestone index state is normalized by
   `roadmap-sync`.
    Keep milestone planning in structured YAML fields such as `goal`, `scope`,
    `done_criteria`, `dependencies`, `risks`, `status`, `notes`, and
    `details`. Refine each milestone until its goal, scope, done criteria,
    dependencies, risks, notes, and details describe executable planning
    context rather than placeholders or broad intentions. Give each standalone
    planned-change artifact an actionable `summary`, `details`, `depends_on`,
    and `status` so later roadmap recommendation, proposal, and implementation
    workflows can understand the work without inventing missing detail. Keep
    milestone `planned_changes` empty unless you are explicitly materializing
    legacy data.
    If a milestone needs more than ten planned changes or mixes unrelated work,
    split it or stop for explicit user confirmation instead of hiding the scope
    problem in one large milestone.

4. **Normalize roadmap state** — run:
   ```bash
   strict-spec-cli roadmap-sync
   ```
   Use this to regenerate canonical index state and reconcile roadmap status
   with active and archived strict changes.

5. **Review the roadmap plan before handoff** — run `roadmap-status` after
   sync, then review the edited roadmap files directly. Check for placeholders,
   overbroad milestones, unclear dependencies, unverifiable done criteria, weak
   planned-change detail, excessive planned change count, stale status values,
   and current roadmap diagnostics. Fix safe structural or wording issues
   immediately. If the review finds a product scope decision, dependency
   decision, milestone split, or prioritization decision that requires the user,
   stop and report the specific question instead of guessing.

6. **Summarize the result** — report the milestone set, the next planned change
   candidates, and any roadmap diagnostics that still need human attention.

## Rules

- Keep all roadmap state under `.strict-spec-driven/roadmap/`
- Keep planned changes owned by exactly one milestone
- Keep milestone ids slug-only and stable once created; ordering comes from
  the optional integer `order` field (use `/strict-roadmap-reorder`), never
  from id prefixes or filenames. Legacy `NNNN-` prefixed ids remain valid but
  do not mint new ones
- Keep each milestone to ten planned changes or fewer
- Use `roadmap-generate milestone` for milestone YAML shape and
  `roadmap-generate planned-change` for standalone planned-change artifacts;
  never hand-pick planned-change filenames — the CLI owns the canonical
  `<milestone-id>-<planned-change-id>.yaml` naming and `roadmap-sync
  --fix-names` repairs misnamed files
