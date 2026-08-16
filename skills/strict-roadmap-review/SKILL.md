---
name: strict-roadmap-review
description: Review all incomplete strict roadmap milestones and directly apply fixes that make their definitions concrete and executable.
metadata:
  skill_id: strict_roadmap_review
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are reviewing all incomplete strict roadmap milestones and directly
applying fixes to their definitions.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
roadmap-generate-milestone: strict-spec-cli roadmap-generate milestone --<named-args>
roadmap-generate-planned-change: strict-spec-cli roadmap-generate planned-change --milestone <milestone-id> --id <planned-change-id> --summary "..." --details "..." [--depends-on <planned-change-id>] [--status <planned|complete>] [--remove-depends-on <planned-change-id>]
roadmap-status: strict-spec-cli roadmap-status
roadmap-overview: strict-spec-cli roadmap-overview
roadmap-sync: strict-spec-cli roadmap-sync [--fix-names]
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

## Review Scope

- This skill reviews all milestones whose status is not complete. Completed
  milestones are historical record and out of review scope; do not edit them.
- Milestone ownership for standalone work items is defined by
  `planned_change.milestone`. Use `roadmap-status` output to locate
  planned-change source files; each `plannedChanges[]` entry reports its
  `path`. The file basename is enforced to the canonical form
  `<milestone-id>-<planned-change-id>.yaml` (milestone prefix not duplicated
  when the id already starts with it); a misnamed active planned-change file
  is a blocking diagnostic that `roadmap-sync --fix-names` repairs.
- Milestone sequencing comes from the order reported by `roadmap-status` or
  `roadmap-overview`, which derives from the optional integer `order` field.
  Never infer review order from the milestone id prefix; review does not set
  or repair order values.
- Milestone `intake_questions` are part of definition quality. Review them as
  planning checks whose answers must be recoverable from milestone fields or
  owned planned-change detail before the milestone is treated as executable.
- **A milestone declaring `awaiting_refinement` is out of scope for filling in
  detail.** That mapping is an operator's explicit statement that the milestone
  is planned but cannot be elaborated yet, because a precondition named in its
  `reason` has not matured. Its thin goal, sparse scope, or absent planned
  changes are the declared state, not a defect. Report such a milestone as
  deliberately deferred, quote the recorded reason, and move on — never invent
  a goal, done criterion, or planned change for it, and never clear the
  declaration. Only `/strict-roadmap-refine` clears it, and only a human can
  judge that the precondition has matured. Reviewing its structural validity
  (schema shape, canonical filenames, dependency references) is still in scope.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `roadmap-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli roadmap-generate --help --json`, `strict-spec-cli roadmap-sync --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show roadmap-index`, `strict-spec-cli schema-show roadmap-milestone`, `strict-spec-cli schema-show planned-change`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show roadmap-index`, `strict-spec-cli sample-show roadmap-milestone`, `strict-spec-cli sample-show planned-change`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli roadmap-generate`, `strict-spec-cli roadmap-sync`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
6. **Inspect the structured result and changed paths** — read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.
7. **Run the artifact's validation command** — `strict-spec-cli roadmap-status`

**Stop rather than edit YAML directly.**

When a required command, argument, or artifact kind is unavailable, stop and
report the missing capability. Editing the YAML directly, writing a raw
payload, or scripting around the CLI is never an available fallback, and an
unavailable command is a reason to stop rather than a reason to improvise.

When you stop, report:

- the operation that could not be completed
- the artifact kind and target artifact it would have written
- the command or argument that is missing
- the discovery commands already consulted

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

1. **Load roadmap context** — read `.strict-spec-driven/config.yaml`,
   `.strict-spec-driven/roadmap/INDEX.yaml`, every milestone YAML file under
   `.strict-spec-driven/roadmap/milestones/`, and the strict specs the
   incomplete milestones are likely to affect.

2. **Check current roadmap state** — run:
   ```bash
   strict-spec-cli roadmap-status
   ```
   and, when wider context helps, `roadmap-overview`. Use each milestone's
   declared status, derived status, planned change state, planned-change
   paths, and any diagnostics as the deterministic facts for the review.
   Identify every milestone whose status is not complete and process them in
   roadmap order from the command output, not id-prefix order. If every milestone is complete, stop here and report that
   there are no incomplete milestones in review scope.

3. **Assess definition quality** — for each incomplete milestone, review the
   milestone for goal clarity, verifiable `done_criteria`, coherent `scope`,
   `dependencies`, and `risks`, and planned-change coverage of the milestone
   goal. Also check milestone `intake_questions` for answer evidence in
   `goal`, `scope`, `done_criteria`, `dependencies`, `risks`, `details`,
   `notes`, and owned planned-change `summary`, `details`,
   `depends_on`, and metadata. Treat an intake question as answered only when
   the answer is explicit enough to guide proposal scope, implementation
   boundaries, tests, dependencies, risks, or technical standards. Review each
   owned planned change for missing or vague `details` that would block turning
   it into an executable strict change proposal.

4. **Assess delivery state** — for each incomplete milestone, compare its
   declared status with the derived status and per-planned-change state
   reported by `roadmap-status`, including archived strict change evidence,
   and identify gaps between definition and delivery.

5. **Apply fixes directly** — use roadmap-generate milestone for milestone YAML
   shape and milestone-field fixes under `.strict-spec-driven/roadmap/`:
   ```bash
   strict-spec-cli roadmap-generate milestone --id <milestone-id> --title "..." --goal "..." --scope-in "..." --scope-out "..." --done "..." --dependency "..." --risk "..." --note "..." --details "..."
   ```
   A supplied scalar field replaces the recorded value with no extra flag, and list fields always append, so editing one field never discards unrelated recorded content. `--intake-question` values merge by id, and restating an id replaces just that question. Remove a recorded entry by naming it: `--remove-scope-in`, `--remove-scope-out`, `--remove-done`, `--remove-dependency`, `--remove-risk` and `--remove-note` take a substring that must match exactly one entry, and `--remove-intake-question` takes an id. Fix standalone planned-change `summary`, `details`,
   `depends_on`, and `status` through the planned-change authoring command:
   ```bash
   strict-spec-cli roadmap-generate planned-change --milestone <milestone-id> --id <planned-change-id> --summary "..." --details "..."
   ```
   The CLI owns the canonical `<milestone-id>-<planned-change-id>.yaml`
   filename; never create or rename planned-change files by hand. Tighten
   vague wording into verifiable statements; elaborate planned-change details
   until each one carries enough executable planning context to propose
   without re-deriving intent. When an
   intake answer is missing but can be safely derived from existing roadmap,
   spec or planned-change evidence, update the relevant milestone
   field or planned-change detail so the answer evidence is explicit. When an
   intake answer needs a human product, compatibility, risk, dependency, or
   technical-standard decision, report the unresolved decision and impact in
   the final summary instead of inventing an answer or writing a change-level
   `questions.yaml` blocker. Never hand-edit completion status: milestone and
   planned-change completion flows only from roadmap sync reconciliation
   against active and archived strict changes.

6. **Resync the roadmap** — after edits, run:
   ```bash
   strict-spec-cli roadmap-sync
   ```
   Confirm every reviewed milestone still participates in a canonical
   `.strict-spec-driven/roadmap/` index and that planned change state is
   consistent with active and archived strict changes.

7. **Report findings and applied fixes** — summarize in conversation the
   definition-quality and delivery-state findings for each incomplete
   milestone, the fixes applied to each edited file, the planned-change paths
   involved, and any follow-up work that needs a human decision. Do not persist
   a separate review-report artifact.

## Rules

- Keep all roadmap state under `.strict-spec-driven/roadmap/`
- Review all milestones whose status is not complete; refuse completed
  milestones as out of review scope
- Apply milestone definition fixes through `roadmap-generate milestone` and
  planned-change detail fixes through `roadmap-generate planned-change`, then
  resync the roadmap; never leave the roadmap unsynced after edits
- Use `roadmap-generate milestone` for milestone YAML shape and
  `roadmap-generate planned-change` for standalone planned-change artifacts;
  never hand-pick planned-change filenames — the canonical
  `<milestone-id>-<planned-change-id>.yaml` naming is CLI-owned and
  `roadmap-sync --fix-names` repairs misnamed files
- check milestone intake_questions for answer evidence during definition
  review, using milestone fields and owned planned-change details before
  asking the human for missing decisions
- Never mark planned changes or milestones complete by hand; completion state
  is owned by roadmap sync reconciliation
- Do not record milestone-level intake gaps in change-level `questions.yaml`
- Do not invent planned change state that conflicts with the strict workflow
- Keep milestone scope focused; surface boundary changes to the user instead
  of silently moving work across milestones
