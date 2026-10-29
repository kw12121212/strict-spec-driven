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
roadmap-delete-planned-change: strict-spec-cli roadmap-delete-planned-change <planned-change-id> [--allow-complete] [--detach-dependents]
roadmap-status: strict-spec-cli roadmap-status
roadmap-sync: strict-spec-cli roadmap-sync [--fix-names]
roadmap-defer: strict-spec-cli roadmap-defer <milestone-id> [--reason "..."]
```

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

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `roadmap-state`. Before the first mutation run
`strict-spec-cli yaml-authoring-protocol roadmap-state`: that command reports
the ordered authoring steps, the owning command for each operation, and the
bundled schema and example keys with their cache-resolved paths, bound to the
artifact kind and current where a copy would go stale. Validate the result with
`strict-spec-cli roadmap-status`.

**Stop rather than edit YAML directly.** When a required command, argument, or
artifact kind is unavailable, stop and report the missing capability. Editing
the YAML directly, writing a raw payload, or scripting around the CLI is never
an available fallback, and an unavailable command is a reason to stop rather
than a reason to improvise.

## Preferred Human Language

Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` —
the user's common human language, not a programming language — for all
user-facing and generated operator-facing text, unless that file is absent or
the active user message asks otherwise.

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
    Restructuring that consolidates or drops planned work removes artifacts with:
    ```bash
    strict-spec-cli roadmap-delete-planned-change <planned-change-id> [--allow-complete] [--detach-dependents]
    ```
    Deletion refuses by default when other planned changes depend on the target;
    `--detach-dependents` drops those `depends_on` edges in the same operation so
    the roadmap is never written through a dangling-reference state. Never remove
    a planned-change file by hand — reducing the planned-change count is a CLI
    operation like every other roadmap mutation.

4. **Offer deferral when a milestone cannot be detailed yet** — a milestone the
   user is committed to but genuinely cannot elaborate — because an interface is
   still moving, a dependency has not landed, or a decision belongs to someone
   else — should not be padded with invented content, and should not be left out
   of the roadmap either. Record the unmatured precondition as an
   `--intake-question`, then declare the state:
   ```bash
   strict-spec-cli roadmap-defer <milestone-id> --reason "<the unmatured precondition>"
   ```
   This keeps the milestone at its planned-change-derived status rather than
   forcing `blocked`, and makes `roadmap-recommend` return a refine action for it
   instead of recommending its placeholder work. Recommendation follows strict
   roadmap order, so tell the user that a deferred milestone suppresses later
   milestones' work until `/strict-roadmap-transition` with the `refine`
   operation clears it, or its `pause` operation releases it. Never defer a
   milestone merely because its detail is unwritten — that is authoring work,
   not a deferred precondition — and never relax a required milestone field to
   create one.

5. **Normalize roadmap state** — run:
   ```bash
   strict-spec-cli roadmap-sync
   ```
   Use this to regenerate canonical index state and reconcile roadmap status
   with active and archived strict changes.

6. **Review the roadmap plan before handoff** — run `roadmap-status` after
   sync, then review the edited roadmap files directly. Check for placeholders,
   overbroad milestones, unclear dependencies, unverifiable done criteria, weak
   planned-change detail, excessive planned change count, stale status values,
   and current roadmap diagnostics. Fix safe structural or wording issues
   immediately. If the review finds a product scope decision, dependency
   decision, milestone split, or prioritization decision that requires the user,
   stop and report the specific question instead of guessing.

7. **Summarize the result** — report the milestone set, the next planned change
   candidates, and any roadmap diagnostics that still need human attention.

## Rules

- Keep all roadmap state under `.strict-spec-driven/roadmap/`
- Keep planned changes owned by exactly one milestone
- Keep milestone ids slug-only and stable once created; ordering comes from
  the optional integer `order` field (use `/strict-roadmap-transition` with the
  `reorder` operation), never from id prefixes or filenames. Legacy `NNNN-`
  prefixed ids remain valid but do not mint new ones
- Keep each milestone to ten planned changes or fewer
- Use `roadmap-generate milestone` for milestone YAML shape and
  `roadmap-generate planned-change` for standalone planned-change artifacts;
  never hand-pick planned-change filenames — the CLI owns the canonical
  `<milestone-id>-<planned-change-id>.yaml` naming and `roadmap-sync
  --fix-names` repairs misnamed files
