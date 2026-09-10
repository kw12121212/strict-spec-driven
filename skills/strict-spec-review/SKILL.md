---
name: strict-spec-review
description: Review the code quality of a completed strict YAML change through direct repository evidence, changed-file reading, and complete regression evidence.
metadata:
  skill_id: strict_spec_review
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are reviewing the code quality of a completed strict YAML change.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
tech-status: strict-spec-cli tech-status
modify: strict-spec-cli modify [change-name|archive-dir]
verify: strict-spec-cli verify <change-name>
lesson-status: strict-spec-cli lesson-status [--category <category>]
lesson-create: strict-spec-cli lesson-create --title <text> --category <category> --context <text> --observation <text> --takeaway <text> --applies-when <text> --origin <text> --evidence <text>
lesson-edit: strict-spec-cli lesson-edit <lesson-id> --origin <text> --evidence <text>
```

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `lessons-state`. Before the first mutation run
`strict-spec-cli yaml-authoring-protocol lessons-state`: that command reports
the ordered authoring steps, the owning command for each operation, and the
bundled schema and example keys with their cache-resolved paths, bound to the
artifact kind and current where a copy would go stale. Validate the result with
`strict-spec-cli lesson-status`.

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

## Review Independence

The agent that implemented a change is usually the agent reviewing it, so a
review written from the author's seat explains the implementation instead of
testing it, and reports clean. This section splits the review into two stances
and makes the boundary between them a written artifact rather than an intention.

**Stance one — reconstruct the requirement.**
Read only `proposal.yaml`, `design.yaml`, `questions.yaml`, and the delta specs,
and write the reconstruction down
before any implementation file, diff, or test file is read:

- the problem the change exists to solve, and the observable outcome that would
  prove it solved
- the non-goals, and every `unchanged_behavior` item the result must still honor
- a numbered list of acceptance items, each independently checkable from
  outside the system

Never derive the requirement from the implementation.
A requirement read off the diff is satisfied by whatever the diff happens to do,
which is exactly the failure this ordering exists to prevent. When the change
carries no delta spec, build the acceptance items from `proposal.yaml`'s
`summary.what`, `scope.in`, and `unchanged_behavior` plus the `design.yaml`
decisions, so the list is never empty.

**Stance two — verify from outside.** Now read the changed files as
an outside reviewer who did not write them.
Knowing why the code took its shape has no standing here: a justification that
exists only in your memory of writing it is not evidence, and the review reports
what the repository can be shown to do.

**Verdicts.** Answer every numbered acceptance item with exactly one of
`satisfied`, `not satisfied`, or `unprovable from evidence`,
and give each verdict
an implementation reference and a test reference
— file and line where the evidence exists, or a statement of what is missing
where it does not. A blanket claim that the implementation matches the proposal
is not a substitute for per-item verdicts,
and an acceptance item no test covers is not `satisfied`.

`unprovable from evidence` on a MUST-strength delta spec requirement is a MUST
FIX finding that
blocks the archive recommendation
until a test or an explicit human decision resolves it. On any other acceptance
item it is a SHOULD FIX finding that must be reported but does not block.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Select the change** — run `modify` without an argument to list active
   changes. If the change is already specified, use it.

2. **Confirm readiness** — run:
   ```bash
   strict-spec-cli verify <change-name>
   ```
   If verification reports blockers, stop and resolve them before review.

3. **Reconstruct the requirement** — stance one from Review Independence. Read
   only:
   - `proposal.yaml`
   - `design.yaml`
   - `questions.yaml`
   - every strict YAML delta spec in `changes/<name>/specs/`
   - every strict YAML delta tech artifact in `changes/<name>/tech/`, if present

   Write down the problem, the observable outcome, the non-goals and
   `unchanged_behavior` items, and the numbered acceptance items. Do not open a
   changed file, a diff, or a test in this step.

4. **Load the implementation context** — only now read:
   - `git status --short` and the relevant diff for changed tracked files
   - the implementation and test files mapped to the delta specs
   - any newly created untracked source, test, documentation, or strict workflow
     files that belong to the change
   - the technical standards that govern the changed files: run
     `strict-spec-cli tech-status` and read the
     relevant files under `.strict-spec-driven/tech/`

5. **Read every changed file yourself** — perform an author-agnostic code
   review from repository evidence. Do not call a `strict-spec-cli review`
   command and do not treat any deterministic script as a substitute for code
   review.

6. **Record a verdict for every acceptance item** — resolve each numbered item
   from step 3 to one of the three verdicts with its evidence, before writing any
   finding. A verdict reached by recalling what was implemented rather than by
   locating it in the repository is not a verdict.

7. **Apply the review checklist** — evaluate findings across:
   - correctness and behavioral regressions
   - strict spec alignment and `unchanged_behavior`
   - test coverage, test independence, and test assertions
   - error handling and edge cases
   - security and unsafe input handling
   - performance or scalability risks
   - maintainability, readability, and unnecessary abstraction
   - user-visible CLI or documentation behavior
   - generated artifacts, build output, and packaging impact
   - technical-standard compliance: every changed file must satisfy the
     applicable MUST and SHOULD rules under `.strict-spec-driven/tech/`. A MUST
     violation is a MUST FIX finding; an unjustified SHOULD violation is at
     least a SHOULD FIX finding. A deviation is acceptable only when the
     change's `design.yaml` records an explicit justification for it.
   - delta tech correctness: when the change carries delta tech artifacts under
     `changes/<name>/tech/`, confirm each standard change is justified by
     `proposal.yaml`/`design.yaml`, that the `operations` target the right rule
     ids, that `ADDED` rules do not duplicate existing rules, and that a new
     standard supplies a `standard` block with title and category. Flag an
     unjustified or incorrect standard change as a MUST FIX finding.

8. **Check spec alignment** — confirm the implementation and tests match the
   strict YAML delta specs and do not violate `unchanged_behavior`.

9. **Fix safe in-scope findings** — if review finds MUST FIX issues that are
   safe to repair within the current strict change scope, make those fixes
   automatically before reporting the review as complete. If any review-time
   code or workflow artifact changes are made, rerun strict verification and
   the configured complete project regression command before recommending
   archive. Unsafe, ambiguous, blocked, or out-of-scope fixes must remain
   reported as blockers instead of being inferred or silently expanded.

10. **Confirm complete regression evidence** — inspect project workflow context,
   including `.strict-spec-driven/config.yaml` when available, for the complete
   project-level regression test method. Require evidence that the full project
   regression command has passed before recommending archive. When the config
   declares a coverage contract under
   `review_evidence.project_regression.coverage`, the regression command is the
   coverage gate: a non-zero exit because measured coverage fell below the
   declared threshold is blocking review evidence exactly like failing tests,
   never advisory output. Do not measure coverage yourself or second-guess the
   threshold — the project's configured command owns measurement and
   enforcement. If the command cannot run because dependencies, services,
   credentials, fixtures, or other test conditions are unavailable, treat
   archive recommendation as blocked and give the human actionable setup or
   waiting guidance instead of inferring a clean result.

   The evidence collected here survives the two steps that follow it: a write
   the configured regression command neither compiles nor reads — currently a
   change-local delta-tech artifact or a lesson — does not invalidate passing
   complete project regression evidence, so recording the lesson in step 12 or
   capturing a convention as delta tech in step 11 costs no rerun. Every other
   write, including a delta-spec, a planning artifact, and any source or test
   file, does invalidate it and forces the command to be rerun before archive is
   recommended.

11. **Reflect on uncaptured engineering conventions (non-blocking)** — after the
   review checklist, consider whether this change established a reusable
   engineering convention not yet captured under `.strict-spec-driven/tech/` (a
   coding, architecture, testing, tooling, security, performance, or API rule).
   When it did, surface two options to the operator:
   - carry it now as a delta tech artifact under `changes/<name>/tech/` so
     archive merges it into the standards, or
   - defer the decision only to the mandatory final current-change tech sync in
     `strict-spec-archive` before archive is invoked.
   This early reflection does not by itself block strict verification or review
   completion. However, a convention confirmed as reusable may not be deferred
   until after archive: the final archive checkpoint must capture it as
   current-change delta tech or obtain an explicit operator classification that
   the surfaced pattern is not reusable.

12. **Declare the lesson outcome (required)** — before reporting, state
   explicitly either that a lesson was recorded or that none applies, with the
   reason. Judge this from the objective proposal-versus-implementation diff,
   not from a general sense of having learned something. Record a lesson when
   any of these is true:
   - a `design.yaml` decision or approach was overturned during implementation
   - a question surfaced that the proposal did not foresee
   - a task was added because of a discovery rather than a scope change
   - a regression failure exposed a trap that this change did not introduce

   When one applies, first check whether an existing lesson already covers the
   same `applies_when` condition:
   ```bash
   strict-spec-cli lesson-status --category <category>
   ```
   If it does, append the recurrence instead of creating a near-duplicate:
   ```bash
   strict-spec-cli lesson-edit <lesson-id> --origin <change-name> --evidence "..."
   ```
   Otherwise record a new one:
   ```bash
   strict-spec-cli lesson-create --title "..." --category <category> --context "..." \
     --observation "..." --takeaway "..." --applies-when "..." \
     --origin <change-name> --evidence "..."
   ```
   Spend the effort on `--applies-when`: it is the retrieval key that decides
   whether anyone ever sees the lesson again. When none of the four criteria
   applies, say "no lesson" and give the one-line reason. Do not manufacture an
   entry to fill the slot — a store padded with filler stops being read.

13. **Report the result** — include review evidence before findings:
   - changed implementation and test files read
   - strict artifacts and delta specs read
   - verification and regression commands executed, including post-fix reruns
     when review-time changes were made, with pass/fail status
   Then report the verdict table from step 6 — every acceptance item with its
   verdict and evidence — before any finding, so a reader can tell a review that
   verified nothing from one that found nothing. Then group findings into:
   - MUST FIX
   - SHOULD FIX
   - NITS
   Findings should include file and line references when available.
   Recommend `strict-spec-archive` only when review is clean enough to archive
   and complete project-level regression test evidence has passed, noting that
   archive guidance will still run its bounded final current-change tech sync.

## Harness Guidance

When `.strict-spec-driven/harness.yaml` exists in the project and harness
evidence was gathered during implementation:

1. Run `harness-plan` for the relevant environment and components, then compare
   the declared targets and evidence labels against the evidence that was
   reported.
2. Check that declared components were stopped after evidence collection when
   the harness started them.
3. Note any discrepancy between declared harness targets and the evidence
   actually captured.
4. Harness evidence supplements but does not replace the required project
   regression command.

## Rules

- Reconstruct the requirement from the change's planning artifacts before
  reading the implementation, and report a verdict with evidence for every
  acceptance item
- Read every changed file before commenting on it
- Do not call or rely on a `strict-spec-cli review` command
- Do not recommend archive without explicit direct code review evidence
- Automatically fix safe in-scope review findings before archive
  recommendation, and rerun strict verification plus the configured complete
  regression command after review-time changes
- Focus on real issues, not style churn already handled elsewhere
- Review code based on repository evidence, never on authorship
- Treat applicable technical standards under `.strict-spec-driven/tech/` as part
  of the review bar: MUST violations are MUST FIX, unjustified SHOULD violations
  are SHOULD FIX, and deviations are acceptable only when `design.yaml` justifies
  them
- When the change carries delta tech artifacts under `changes/<name>/tech/`,
  review each standard change for justification and correct merge operations; an
  unjustified or malformed standard change is a MUST FIX finding
- Do not recommend archive without passing complete project-level regression
  test evidence or explicit setup guidance explaining why that evidence is
  blocked
