---
name: strict-spec-auto
description: Run the strict workflow end to end. Propose, implement, verify, review, and archive a strict YAML change without extra confirmation unless open questions block progress.
metadata:
  skill_id: strict_spec_auto
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are running the strict workflow end to end for a single strict YAML change.

This skill is the orchestration spine. It owns the sequence, the gates between
phases, and the decisions that only the whole run can make; each phase procedure
is owned by the skill that performs it, listed under Delegated Procedures below.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
tech-status: strict-spec-cli tech-status
lesson-status: strict-spec-cli lesson-status [--category <category>]
lesson-create: strict-spec-cli lesson-create --title <text> --category <category> --context <text> --observation <text> --takeaway <text> --applies-when <text> --origin <text> --evidence <text>
lesson-edit: strict-spec-cli lesson-edit <lesson-id> --origin <text> --evidence <text>
propose: strict-spec-cli propose <change-name>
generate: strict-spec-cli generate <change-name> <proposal|design|questions|tasks|delta-spec|delta-tech> --<named-args>
apply: strict-spec-cli apply <change-name>
verify: strict-spec-cli verify <change-name>
ready: strict-spec-cli ready <change-name>
next: strict-spec-cli next <change-name>
archive: strict-spec-cli archive <change-name>
```

## Delegated Procedures

Each procedure below is owned by the skill named beside it. That skill's
guidance is authoritative for it, and this skill does not restate it. Follow the
owning skill's procedure at the step that needs it; how it is loaded is whatever
the running harness provides.

- requirement-interrogation: owned by `strict-spec-propose`
- change-intake-gate: owned by `strict-spec-propose`
- spec-artifact-routing: owned by `strict-spec-propose`
- task-list-authoring: owned by `strict-spec-propose`
- delta-artifact-authoring: owned by `strict-spec-propose`
- implementation-order: owned by `strict-spec-apply`
- gitignore-hygiene: owned by `strict-spec-apply`
- review-independence: owned by `strict-spec-review`
- lesson-outcome: owned by `strict-spec-review`
- archive-tech-sync: owned by `strict-spec-archive`
- archive-execution: owned by `strict-spec-archive`

Delegation moves where a procedure is stated, never whether it runs. Every gate
this skill declares below still binds, and a delegated procedure that cannot be
followed stops the run exactly as an inline one would.

## YAML Writing Rules

- Keep strict artifacts in valid YAML structures at every stage. Do not replace
  structured fields with Markdown prose.
- If artifact fields are unclear, use `strict-spec-cli schema-show <schema-name>`;
  installed skills do not carry a `templates` directory.
- Shared schema cache root: `~/.strict-spec-schemas/`. When a YAML artifact already declares `schema_file`, resolve that relative path under the shared cache root to inspect the concrete schema file without relying on a local templates directory.
- If a valid artifact example would clarify the shape, use
  `strict-spec-cli sample-show <sample-name>`; installed skills
  do not rely on a local `examples` directory.
- Use block scalars only for free-text content. Prefer `>-` for wrapped prose
  such as longer `summary`, `approach`, `decision`, `rationale`, `question`,
  `context`, `answer`, and spec `statement` values. Use `|` only when literal
  line breaks must be preserved.
- Quote short strings that may contain YAML-sensitive characters or ambiguous
  scalar values, including `command` strings, URLs, paths, text containing `:`
  or `#`, leading `-`, JSON-like fragments, boolean-like words, and timestamp-
  like values.
- Keep short structural fields as plain scalars unless quoting is needed for
  correctness. Do not force IDs, enums, schema identifiers, artifact types,
  task references, or similar fields into block scalars.
- Before moving between workflow stages, self-check indentation, list nesting,
  quote closure, and colon spacing, then use the documented verification
  commands to catch remaining schema or YAML issues.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. This skill writes `change-planning-state`, `change-delta-state`,
`spec-state`, `tech-state`, `lessons-state`. Before the first mutation run
`strict-spec-cli yaml-authoring-protocol <artifact-kind>` for each of them:
that command reports the ordered authoring steps, the owning command for each
operation, and the bundled schema and example keys with their cache-resolved
paths, bound to the artifact kind and current where a copy would go stale.
Validate the result with `strict-spec-cli verify <change-name>`,
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

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If `.strict-spec-driven/` is
missing, stop immediately and tell the user to run `/strict-spec-init`. Do not
run `init` from this skill.

1. **Reset context from targeted files** — treat prior chat context as stale
   unless it has been revalidated from the current change artifacts, relevant
   main specs, the applicable technical standards (run
   `strict-spec-cli tech-status` and read the
   relevant files under `.strict-spec-driven/tech/`), the implementation and
   test files the change touches, repository status, and regression
   configuration when needed. Do not reread unrelated roadmap, archive, or spec
   files just because they exist.
   Also select the lesson category matching the affected spec or technical area, run
   `strict-spec-cli lesson-status --category <category>`, and match its `applies_when`
   conditions against the work at hand. Repeat for another category when the change genuinely
   spans more than one; use the unfiltered command only when repository evidence cannot identify a
   relevant category. Lessons carry no MUST or SHOULD
   strength, so treat them as warnings worth checking rather than constraints to
   satisfy; weight a lesson with several occurrences, because the count means
   this project has hit it repeatedly.
   Use this evidence before asking the human anything or continuing into
   implementation.

2. **Assess complexity** — proceed automatically only when the change is clearly
   scoped inside this repository with a concrete definition of done. If the
   request is open-ended or cross-repository, stop and suggest
   `strict-spec-brainstorm`.

3. **Interrogate the need** — this is the one checkpoint where the automatic
   workflow stops: complete it before proposing, then continue unattended
   through archive. Follow the delegated requirement-interrogation procedure.
   Its answers come from the requester, so this skill cannot supply them from
   repository evidence and cannot proceed past an unanswered one.

4. **Propose or resume the change** — if the strict change does not exist yet,
   scaffold with `propose` and author its planning artifacts by following the
   delegated change-intake-gate, spec-artifact-routing, delta-artifact-authoring,
   and task-list-authoring procedures. Keep or add a
   dedicated lint Testing task before full unit or regression test tasks when the project has a runnable lint command. If a prior workflow step such as `/strict-roadmap-recommend`
   already created a populated change directory containing proposal, design,
   tasks, questions, and any needed delta spec or delta tech artifacts,
   resume the existing populated strict change scaffold without regenerating planning artifacts
   or running `propose` again.
   For roadmap-backed scaffolds, preserve selected planned-change provenance as intake evidence
   and inspect `questions.yaml.open` before implementation.
   When resuming a roadmap-backed scaffold, also read the proposal's roadmap links
   and use the selected standalone planned-change `summary`, `details`,
   `depends_on`, labels, and owning milestone `details` as valid intake evidence.
   Carry answers already present in that roadmap evidence forward instead of
   re-asking.
   For roadmap-backed scaffolds, make the context say whether the uncertainty
   affects proposal scope, spec delta, implementation files, tests,
   dependencies, or technical standards.
   For newly created or newly populated scaffolds, **run the proposal checkpoint
   over generated planning artifacts** before running handoff validation: a
   semantic self-check of every generated or edited file under
   `.strict-spec-driven/changes/<change-name>/` against the user request, the
   relevant main specs, technical standards, and the existing project
   constraints, looking for decision-ready detail in
   scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, and delta tech use when applicable.
   The checkpoint should fix safe, in-scope documentation gaps immediately by
   rerunning the supported `generate` commands for script-owned artifacts. Do
   not expand scope or answer unresolved human questions during this checkpoint;
   record ambiguity in `questions.yaml`.
   Run `ready <change-name>` or `next <change-name>` to surface deterministic
   blockers before implementation. If you use `verify` at proposal time, treat
   pending-task diagnostics as expected until implementation is complete. If
   `questions.yaml.open` is not empty, do not infer answers or continue
   automatically. For each open question, explain:
   - the unresolved decision or missing information
   - the impact on scope, implementation, testing, or spec behavior
   - the recommended answer or options, with the tradeoff for each
   Then stop and wait for an explicit human reply. Record the answers in
   `questions.yaml.resolved` and remove them from `open` before implementation.

5. **Implement and complete each task** — follow the delegated
   implementation-order procedure, preserving every `unchanged_behavior` item
   from `proposal.yaml` and honoring the technical standards under
   `.strict-spec-driven/tech/`. If a task can only be completed by breaking a
   MUST rule, stop and surface it as an open question instead of breaking the
   standard; if the standard itself must change as part of this change, carry it
   as a delta tech artifact under `changes/<change-name>/tech/` so it merges on
   archive, never by editing the live standard directly.
   Use `next <change-name>` when you need deterministic state, blockers, or
   script-owned next-step command suggestions; do not use it as a replacement
   for user answers or implementation judgment.

6. **Run testing commands from `tasks.yaml`** — complete every Testing task by
   actually running its `command` before marking it complete.

7. **Clean up generated artifacts** — once all tasks including Testing are
   complete, follow the delegated gitignore-hygiene procedure.

8. **Verify the finished change** — run:
   ```bash
   strict-spec-cli verify <change-name>
   ```
   Fix safe blockers automatically, then rerun verification.

9. **Review code quality** — this workflow implements and reviews the same
   change, so follow the delegated review-independence procedure rather than
   reviewing from the seat that wrote the code. Read every changed
   implementation and test file yourself, including the files named by delta
   specs, `git status --short`, the relevant tracked diff, and any untracked
   source, test, documentation, or strict workflow files that belong to the
   change. Do not call a `strict-spec-cli review` command and do not treat
   deterministic validation as code review evidence. Evaluate correctness, spec
   alignment, `unchanged_behavior`, test coverage and assertions, error
   handling, edge cases, security, performance, maintainability, user-visible
   behavior, documentation impact, generated artifacts, packaging impact, and
   technical-standard compliance against `.strict-spec-driven/tech/` (a MUST
   rule violation is a MUST FIX; an unjustified SHOULD violation is a SHOULD
   FIX; a deviation is acceptable only when `design.yaml` justifies it). When the
   change carries delta tech artifacts under `changes/<change-name>/tech/`,
   confirm each standard change is justified by the proposal and design and that
   its operations are correct; treat an unjustified or malformed standard change
   as a MUST FIX. Automatically fix safe in-scope review findings when they are
   MUST FIX and in scope. If review-time code or workflow artifact changes are
   made, rerun strict verification and the configured complete project
   regression command before continuing. Unsafe, ambiguous, blocked, or
   out-of-scope fixes must stop archive rather than being inferred or silently
   expanded, and an unresolved MUST-strength unprovable verdict stops archive on
   the same terms.
   After the review checklist, also reflect — non-blocking — on whether this
   change established a reusable engineering convention not yet captured under
   `.strict-spec-driven/tech/` (a coding, architecture, testing, tooling,
   security, performance, or API rule). When it did, surface two options: carry
   it now as a delta tech artifact under `changes/<change-name>/tech/` so
   archive merges it into the standards, or defer the decision only to the
   mandatory technical-standard checkpoint before archive.

10. **Declare the lesson outcome (required)** — before archive, follow the
   delegated lesson-outcome procedure and report its result as part of this
   run's summary.

11. **Re-check complete regression evidence** — inspect project workflow
   context, including `.strict-spec-driven/config.yaml` when available, for the
   complete project-level regression test method. Require evidence that the full
   project regression command has passed during review before archive execution,
   even when all Testing tasks are complete. A previously passed Testing task
   command may satisfy the archive gate only when it
   exactly matches the configured complete project regression command and no implementation, test,
   strict artifact, or configuration files relevant to the change have changed
   since that command passed. One class of write is carved out of that list:
   a write the configured regression command neither compiles nor reads — currently a change-local delta-tech artifact or a lesson — does not invalidate passing complete project regression evidence,
   because such a file is not compiled, is not imported by the suite, and
   reaches live workflow state only at archive. Decide an artifact kind neither
   list names by that same criterion, and rerun when the suite does compile or
   read it. Every other strict artifact, including a delta-spec and a planning
   artifact, still invalidates the evidence. When the config declares a
   coverage contract under `review_evidence.project_regression.coverage`,
   the regression command is the coverage gate: a non-zero exit because measured
   coverage fell below the declared threshold blocks archive exactly like
   failing tests and is
   never advisory output; you never measure coverage yourself or second-guess
   the declared threshold. If the regression command cannot run because
   dependencies, services, credentials, fixtures, or other test conditions are
   unavailable, stop before archive and give the human actionable setup or
   waiting guidance.

12. **Resolve the technical-standard checkpoint** — before invoking archive,
   follow the delegated archive-tech-sync procedure for the selected change. It
   either clears immediately or pauses for an operator decision; this skill does
   not archive until it has cleared. After any delta-tech edit it directs,
   review the artifact and rerun strict verification, and rerun the configured
   regression command only when that step also changed a file outside the
   carve-out named in step 11.

13. **Archive cleanly** — if the technical-standard checkpoint is resolved, the
   change verifies, reviews cleanly, and has passing complete project-level
   regression test evidence for the final artifact state, follow the delegated
   archive-execution procedure. Then summarize the result, including any roadmap
   files or milestone statuses the archive step reconciled, and recommend
   `/strict-spec-ship <change-name>` as an optional next step for creating a
   focused git commit.

## Harness Guidance

When `.strict-spec-driven/harness.yaml` exists in the project and
implementation or review requires starting declared components:

1. Run `harness-plan` first and explain the declared long-running commands
   before starting them.
2. Use `harness-start` to start declared executable components rather than
   guessing undeclared startup steps.
3. Use declared harness targets from the plan when exercising the running
   application.
4. Capture evidence consistently using declared evidence labels and harness
   session evidence identifiers.
5. Run `harness-stop` to stop all components you started before finishing.

**When NOT to use lifecycle commands:**
- No `.strict-spec-driven/harness.yaml` declaration exists.
- Required environment variable values are missing.
- The user has already provided a running service URL outside the harness
  declaration.

## Rules

- The context reset is mandatory
- The complexity check is mandatory
- The workflow is automatic except when open questions block progress
- Open questions require a problem explanation, impact analysis, recommendation,
  and explicit human answer before continuing; encode the impact and
  recommendation in `questions.yaml.open[*].context`
- A delegated procedure is followed, not summarized: read the owning skill's
  guidance at the step that needs it rather than acting from memory of it
- Honor applicable technical standards under `.strict-spec-driven/tech/` across
  proposal, implementation, and review: never break a MUST rule, follow SHOULD
  rules by default, and treat unjustified violations as review findings that
  block archive
- When a change must alter a standard, carry it as a delta tech artifact under
  the change's `tech/` directory so it merges on archive; never edit live
  standards directly during a change
- The final `/strict-spec-ship <change-name>` recommendation is advisory and
  must not be treated as required to complete `strict-spec-auto`
- Do not call or rely on a `strict-spec-cli review` command
- Do not run archive without direct code review evidence from changed
  implementation and test files
- Reconstruct the requirement before reading the implementation, and do not run
  archive while a MUST-strength acceptance item is unprovable from evidence
- Automatically fix safe in-scope review findings before archive, and
  rerun strict verification plus the configured complete regression command after review-time changes
- Do not run archive without passing complete project-level regression test
  evidence or explicit setup guidance explaining why that evidence is blocked
- Do not run archive before the delegated technical-standard checkpoint is
  resolved
- Do not commit or push automatically
