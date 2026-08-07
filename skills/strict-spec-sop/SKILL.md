---
name: strict-spec-sop
description: Author a strict YAML standard operating procedure (SOP) through a category-driven interview, then let the strict SOP CLI generate and validate the compliant YAML. Use when the user wants to capture a repeatable operational procedure (deployment, incident response, release, or a generic process) as a schema-validated SOP.
metadata:
  skill_id: strict_spec_sop
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are helping the user author a strict YAML standard operating procedure
(SOP). An SOP is a categorized, operator-facing procedure: ordered steps with a
single responsible role each, a trigger, scope, prerequisites, exception
handling, and success criteria. The SOP's category drives both the interview
questions you ask and the process constraints the CLI enforces. You conduct the
interview and exercise judgment; the CLI owns id generation, file writing, index
maintenance, and validation. Never hand-write SOP YAML — always go through the
CLI.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
sop-category-list: strict-spec-cli sop-category-list
sop-category-show: strict-spec-cli sop-category-show <category-id>
sop-create: strict-spec-cli sop-create --title <text> --category <id> --purpose <text> --trigger <text> --scope-in <text>... [--scope-out <text>]... --success <text>... --step-id <id> --step-actor <text> --step-action <text> --step-expected <text> [--prerequisite <text>]... [--classification <text>] [--role-id <id> --role-name <text> --role-responsibility <text>]... [--branch-step <id> --branch-condition <text> --branch-goto <id>]... [--escalation-trigger <text> --escalation-to <text> [--escalation-action <text>]]... [--exception-condition <text> --exception-handling <text>]... [--output <text>]... [--reference-label <text> --reference-target <text>]... [--link-kind <spec|change|roadmap> --link-target <text>]...
sop-list: strict-spec-cli sop-list
sop-show: strict-spec-cli sop-show <sop-id>
sop-validate: strict-spec-cli sop-validate [<sop-id>]
sop-edit: strict-spec-cli sop-edit <sop-id> [--title <text>] [--purpose <text>] [--trigger <text>] [--scope-in <text>]... [--scope-out <text>]... [--success <text>]...
```

## Prerequisites

Run `strict-spec-cli check-workflow-state` before any workflow work. If
`.strict-spec-driven/` is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

## CLI-Only YAML Authoring Protocol

Every mutation of repository-owned YAML in this skill goes through the strict
CLI. Run `strict-spec-cli yaml-authoring-protocol <artifact-kind>` for the
live, artifact-bound form of these steps; it reports the owning commands, the
bundled schema and example keys with their cache-resolved paths, and the
validation command for that family.

This skill writes `sop-state`.

1. **Read the owning command's machine-readable help** — `strict-spec-cli sop-create --help --json`, `strict-spec-cli sop-edit --help --json`
2. **Resolve the target artifact's schema** — `strict-spec-cli schema-list`, then `strict-spec-cli schema-show sops-index`, `strict-spec-cli schema-show sop-category`, `strict-spec-cli schema-show sop`
3. **Inspect the registered minimal example** — `strict-spec-cli sample-list`, then `strict-spec-cli sample-show sops-index`, `strict-spec-cli sample-show sop-category`, `strict-spec-cli sample-show sop`. The example is read-only reference; never copy it into place as a starting file.
4. **Translate confirmed facts into documented named arguments** — every value must trace to the request, the schema, or repository evidence; an unconfirmed field is an open question, not a default.
5. **Execute the owning command with those arguments** — `strict-spec-cli sop-create`, `strict-spec-cli sop-edit`. Raw YAML payloads, heredocs, temporary artifact files, arbitrary output paths, and direct file edits are not part of this protocol.
6. **Inspect the structured result and changed paths** — read the returned result rather than assuming success. A result reporting incompleteness is a successful write with more work to do, not a failure to retry; diagnostics name what is missing.
7. **Run the artifact's validation command** — `strict-spec-cli sop-validate`

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
Use the `preferred_human_language` field as the user's common human language for
natural-language responses, questions, summaries, and generated operator-facing
text. This field is a human-language preference, not a programming language.
Comply with that configured common human language unless the active user message
explicitly asks for a different language. Bundled category question prompts are
stored in English; render them into the configured human language when you ask
them.

## Steps

Before any other step, run `strict-spec-cli check-workflow-state`. If
`.strict-spec-driven/` is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

1. **Choose the category** — run `sop-category-list` and present the available
   categories. Ask the user which one fits their procedure, or infer it from
   their description and confirm. The category determines the interview
   questions and the constraints the CLI will enforce, so settle it first.

2. **Load the category's question list** — run
   `sop-category-show <category-id>` and read its `questions` and `constraints`.
   The `questions` list is the interview script; the `constraints`
   (`required_sections`, `min_steps`, `required_step_fields`,
   `allowed_classifications`, and `rules`) are the hard requirements the SOP must
   satisfy. Treat every section named in `required_sections` as mandatory, and
   only offer classifications drawn from `allowed_classifications` when present.

3. **Interview the user** — ask the category's questions in order, rendered in
   the configured human language. Converge on:
   - a short **title** and a one-line **purpose**
   - the **trigger** that starts the procedure
   - **scope** (in scope and explicitly out of scope)
   - the **roles** involved and each role's responsibility
   - any **prerequisites** (access, tools, inputs, approvals)
   - the ordered **steps** — for each step capture who performs it (the actor),
     the action, and the expected result; capture any decision **branches** as a
     condition plus the step to go to
   - **exception** handling and, for incident procedures, the **escalation**
     path and severity **classification**
   - the **success criteria** that mark the procedure complete
   When an answer is ambiguous, ask the user rather than guessing. Do not invent
   roles, steps, or outcomes the user did not describe.

4. **Confirm before writing** — restate the captured procedure in plain language
   and confirm it is complete and correct, especially that every step has a
   single responsible role and an expected result, every required section is
   present, and any branch points to a real step.

5. **Generate the SOP through the CLI** — run a single `sop-create` invocation
   that passes every captured field as parameters (one `--step-*` group per
   step, one `--role-*` group per role, one `--branch-*` group per branch, and so
   on). Do not write YAML by hand and do not create payload files. The CLI
   derives a conflict-resistant id, writes the SOP in draft status, maintains the
   index, and validates the result. If `sop-create` reports diagnostics, read
   them, return to the relevant interview answer, and rerun — the same content
   resolves to the same id, so corrected reruns do not create duplicates.

6. **Validate and hand off** — run `sop-validate <sop-id>` to confirm the SOP
   satisfies its category's constraints, then summarize the created SOP (id,
   category, step count, draft status) and its file path. Mention that the SOP
   is in `draft` status and that `sop-edit` can refine its core fields (title,
   purpose, trigger, scope, success criteria) later.

## Rules

- Always select and confirm the category before interviewing; the category
  drives the questions and the enforced constraints
- Never hand-write or hand-edit SOP YAML — create and modify SOPs only through
  the strict SOP CLI
- Treat the category's `required_sections` and `allowed_classifications` as hard
  requirements; do not omit a required section or invent a classification
- Every step must name a single responsible role (actor) and an expected result,
  and every branch must point to an existing step
- When an SOP links to a spec, change, or roadmap target, use the real target id
  or path; the CLI rejects links that do not resolve
- Record ambiguity by asking the user, not by guessing
