import type { YamlDiagnosticDetails } from "../yaml.js";
import { toPosix } from "../diagnostics.js";

export type SkillPackagingDiagnostic = {
  code: string;
  path: string;
  message: string;
  expected?: string;
  actual?: string;
} & YamlDiagnosticDetails;

export type SkillPackagingValidationResult = {
  valid: boolean;
  diagnostics: SkillPackagingDiagnostic[];
  summary: {
    skillCount: number;
    marketplaceCount: number;
    retiredCount: number;
    diagnosticsCount: number;
  };
};

export type SkillFrontmatter = {
  name?: unknown;
  description?: unknown;
  metadata?: {
    skill_id?: unknown;
    author?: unknown;
    type?: unknown;
    version?: unknown;
  };
};

export const REQUIRED_METADATA_FIELDS = ["skill_id", "author", "type", "version"] as const;
export const EXPECTED_SCRIPT_SYMLINK = "../../dist/scripts";
export const COMMAND_PREFIX = "strict-spec-cli";
export const GENERIC_COMMAND_PLACEHOLDER = `${COMMAND_PREFIX} <command>`;
export const GENERATE_NAMED_ARGS_COMMAND =
  `${COMMAND_PREFIX} generate <change-name> <proposal|design|questions|tasks|delta-spec|delta-tech> --<named-args>`;
export const READY_COMMAND = `${COMMAND_PREFIX} ready <change-name>`;
export const NEXT_COMMAND = `${COMMAND_PREFIX} next <change-name>`;
export const CHECK_WORKFLOW_STATE_COMMAND = `${COMMAND_PREFIX} check-workflow-state`;
export const STRICT_WORKFLOW_EXISTENCE_STEP_SNIPPET =
  `Before any other step, run \`${CHECK_WORKFLOW_STATE_COMMAND}\``;
export const STRICT_WORKFLOW_INIT_GUIDANCE_SNIPPET =
  "stop immediately and tell the user to run `/strict-spec-init`";
export const STRICT_WORKFLOW_NO_INIT_SNIPPET = "Do not run `init` from this skill.";

/**
 * The name prefixes a bundled strict skill family may use.
 *
 * Four checks decide whether a strict skill name is recognized — the skill directory scan, the
 * marketplace entry scan, the workflow-state guidance scope, and the delegated-procedure owner
 * pattern below — and each one used to carry its own copy of this list. A family added to three of
 * the four is accepted by three checks and reported as a legacy name by the fourth, which is a
 * packaging failure that reads as a typo. The list lives here so adding a family is one edit and
 * every check sees it at once.
 */
export const STRICT_SKILL_NAME_PREFIXES = [
  "strict-spec-",
  "strict-roadmap-",
  "strict-tech-",
  "strict-scene-",
] as const;

/** The registered family prefixes as an operator-facing expectation, e.g. `strict-spec-*, ...`. */
export const STRICT_SKILL_NAME_PREFIX_EXPECTATION = STRICT_SKILL_NAME_PREFIXES
  .map((prefix) => `${prefix}*`)
  .join(", ");

/** Whether a skill or marketplace entry name carries a registered strict family prefix. */
export function hasStrictSkillNamePrefix(name: string): boolean {
  return STRICT_SKILL_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export type SkillContentExpectation = {
  requiredCommands: Record<string, string>;
  requiredHeadings: string[];
  requiredSnippets: string[];
  forbiddenSnippets?: string[];
};

const ROADMAP_DETAILS_GUIDANCE_SNIPPET = "`details` field";
const ROADMAP_SPLIT_PLANNED_CHANGE_SNIPPET = "standalone planned-change";
const ROADMAP_GENERATE_MILESTONE_SNIPPET = "roadmap-generate milestone";
const ROADMAP_PLANNED_CHANGE_CLI_AUTHORING_SNIPPET = "roadmap-generate planned-change";
const ROADMAP_CANONICAL_FILENAME_SNIPPET = "<milestone-id>-<planned-change-id>.yaml";
const ROADMAP_FIX_NAMES_SNIPPET = "roadmap-sync --fix-names";
const ROADMAP_ACTIVE_CONFLICT_SNIPPET = "active strict change conflicts";
const ROADMAP_PLAN_EXECUTABLE_DETAIL_SNIPPET = "executable planning context";
const ROADMAP_REVIEW_INCOMPLETE_SCOPE_SNIPPET = "all milestones whose status is not complete";
const ROADMAP_REVIEW_DIRECT_FIX_SNIPPET =
  "use roadmap-generate milestone for milestone YAML shape";
const ROADMAP_REVIEW_DETAIL_ELABORATION_SNIPPET = "concrete and executable";
const ROADMAP_REVIEW_INTAKE_ANSWER_SNIPPET = "check milestone intake_questions for answer evidence";
const ROADMAP_ARCHIVE_DEFAULT_ALL_SNIPPET = "default to all unarchived milestones";
const ROADMAP_ARCHIVE_COMPLETE_ONLY_SNIPPET = "only milestones whose derived status is complete";
const ROADMAP_ARCHIVE_PLANNED_CHANGE_SNIPPET = "completed standalone planned-change";
const ROADMAP_ORDER_SOURCE_SNIPPET = "Use `roadmap-status` or `roadmap-overview` order, never id-prefix order";
const ROADMAP_REORDER_PLACEMENT_FLAGS_SNIPPET =
  "Pass exactly one of `--before`, `--after`, or `--order`";
const ROADMAP_REORDER_RENUMBER_FALLBACK_SNIPPET =
  "If no integer gap exists between the requested neighbours, run\n`roadmap-renumber` first, then rerun the reorder.";
/**
 * The merged roadmap state-transition skill replaces eight single-command skills, and only three of
 * those — move, sync, and archive — ever had expectations. These snippets are chosen so
 * that every one of the eight operations has at least one element of its own judgment asserted, not
 * merely its command name, which the requiredCommands map already covers. A skill that dropped
 * pause's recommendation effect or reopen's frozen-history rule would otherwise still validate.
 *
 * Reorder is not among them. It left this skill for its own package, whose expectation below
 * carries the reorder snippets on the same terms.
 */
const ROADMAP_TRANSITION_EXPLICIT_OPERATION_SNIPPET = "**The operation must be explicit.**";
const ROADMAP_TRANSITION_STOP_WITHOUT_OPERATION_SNIPPET =
  "stop and ask the user which of the eight is intended";
const ROADMAP_TRANSITION_INVERSE_PAIRS_SNIPPET =
  "`pause` and `resume` undo each other, `defer` and `refine` undo each other";
const ROADMAP_TRANSITION_ARCHIVED_FROZEN_SNIPPET =
  "Archived milestones and archived planned changes are frozen history";
/**
 * The reorder skill states the same rule over the only artifact it can reach. Reorder never
 * touches a planned change, so requiring the transition skill's wider literal would force the
 * reorder guidance to claim a scope the command does not have.
 */
const ROADMAP_REORDER_ARCHIVED_FROZEN_SNIPPET = "Archived milestones are frozen history";
const ROADMAP_TRANSITION_PAUSE_SKIP_REASON_SNIPPET = "milestone-paused";
const ROADMAP_TRANSITION_RESUME_CLEARS_PAUSE_SNIPPET = "Resume deletes the `paused` field";
const ROADMAP_TRANSITION_DEFER_IS_NOT_PAUSE_SNIPPET = "**Deferral is not a pause.**";
const ROADMAP_TRANSITION_DEFER_SKIP_REASON_SNIPPET = "milestone-awaiting-refinement";
const ROADMAP_TRANSITION_REFINE_ASKS_THE_HUMAN_SNIPPET =
  "whether the recorded precondition is now true";
const ROADMAP_TRANSITION_REOPEN_FROZEN_SNIPPET = "frozenPlannedChanges";
const ROADMAP_TRANSITION_REOPEN_SEEDS_FOLLOW_UP_SNIPPET = "seededFollowUp";
const ROADMAP_TRANSITION_SYNC_INVENTS_NOTHING_SNIPPET =
  "Do not invent planned changes during a sync";
const ROADMAP_TRANSITION_SINGLE_COMMAND_SNIPPET =
  "Perform exactly one operation per invocation, through its one owning command";
const ROADMAP_MOVE_ALLOW_COMPLETE_SNIPPET = "--allow-complete";
const ROADMAP_MOVE_NO_CHANGE_WRITES_SNIPPET = "never writes under `.strict-spec-driven/changes/`";
const ROADMAP_PLAN_REVIEW_SNIPPET = "Review the roadmap plan before handoff";
const ROADMAP_SCRIPTED_RECOMMEND_SNIPPET = "treat the command's selected planned change as authoritative";
const ROADMAP_RECOMMEND_BEFORE_CONTEXT_SNIPPET = "before reading broad roadmap context";
const ROADMAP_READY_HANDOFF_SNIPPET = "Use `ready` as the proposal handoff validation";
const ROADMAP_AUTO_POPULATED_HANDOFF_SNIPPET = "populated change scaffold";
const ROADMAP_PROPOSAL_ONLY_SNIPPET = "Do not auto-invoke `/strict-spec-auto` during strict-spec-propose";
/**
 * The milestone-scoped proposal path. strict-spec-propose used to refuse a roadmap-sourced request
 * and redirect to strict-roadmap-recommend, which contradicted the requirement that it carry a
 * roadmap-backed mode. These snippets pin the parts an agent cannot infer: that the selector is
 * resolved to exactly one milestone before anything runs, that the selection comes from
 * roadmap-recommend --milestone, that the roadmap link is recorded on the proposal, and that an
 * unusable milestone is reported with its own blockers rather than worked around.
 */
const PROPOSE_MILESTONE_SELECTOR_SNIPPET = "Resolve the selector to exactly one milestone id";
const PROPOSE_MILESTONE_RECOMMEND_SNIPPET = "roadmap-recommend --milestone";
const PROPOSE_MILESTONE_ROADMAP_LINK_SNIPPET = "--milestone <milestone-id> --planned-change <planned-change-id>";
const PROPOSE_MILESTONE_BLOCKER_SNIPPET = "When no planned change comes back, report the reason and stop.";
const PROPOSE_MILESTONE_NO_ALLOW_UNREFINED_SNIPPET = "do not add `--allow-unrefined`";
const AUTO_TARGETED_CONTEXT_RESET_SNIPPET = "Reset context from targeted files";
const AUTO_RESUME_POPULATED_SCAFFOLD_SNIPPET = "resume the existing populated strict change scaffold without regenerating planning artifacts";
const AUTO_REUSE_REGRESSION_EVIDENCE_SNIPPET =
  "exactly matches the configured complete project regression command";
const PROPOSAL_CHECKPOINT_SNIPPET = "proposal checkpoint";
const PROPOSAL_CHECKPOINT_DECISION_READY_SNIPPET = "decision-ready detail";
const PROPOSAL_CHECKPOINT_DETAIL_CRITERIA_SNIPPET =
  "scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, and delta tech use when applicable";
const PROPOSAL_CHECKPOINT_DOCUMENTATION_FIX_SNIPPET = "fix safe, in-scope documentation gaps";
const REVIEW_AUTO_FIX_SNIPPET = "Automatically fix safe in-scope review findings";
const REVIEW_POST_FIX_REGRESSION_SNIPPET =
  "rerun strict verification plus the configured complete regression command after review-time changes";
const CURRENT_CHANGE_TECH_SYNC_SNIPPET = "final current-change tech sync";
const CURRENT_CHANGE_SCOPE_SNIPPET = "attributable tracked and untracked files";
const CURRENT_CHANGE_DELTA_TECH_SNIPPET = "current-change delta tech";
const NO_POST_ARCHIVE_DEFERRAL_SNIPPET = "confirmed as reusable";
/**
 * The archive-time checkpoint decides rather than asks. Both branches are pinned, not just the
 * capture one: a skill that stated only "apply the recommendation" would satisfy a check while
 * leaving an agent no sanctioned way to close a finding it judged change-local, and the pressure
 * would be to manufacture a standard out of it. The reporting duty is pinned for the opposite
 * reason — dropping the confirmation drops the operator's only view of what was decided, so the
 * summary line is what replaces it rather than an optional courtesy.
 */
const ARCHIVE_APPLIES_RECOMMENDATION_SNIPPET =
  "apply the recommendation the bounded evidence supports without pausing for operator confirmation";
const NOT_REUSABLE_CLASSIFICATION_SNIPPET = "record the classification that the pattern is not reusable";
const ARCHIVE_DECISION_REPORT_SNIPPET = "report the applied decision in the archive summary";
/**
 * Review's reflection is where a convention is first seen, and it used to hand the operator a
 * two-option choice that the archive checkpoint no longer needs answered. The snippet pins the
 * replacement — state the recommendation — in the skill that reviews and in the skill that
 * orchestrates review, neither of which delegates this reflection to the other.
 */
const REVIEW_REFLECTION_RECOMMENDATION_SNIPPET = "report the finding with the recommendation you derived";
/**
 * The carve-out is stated as a criterion with the artifact kinds that currently satisfy it, rather
 * than as a bare list. A list alone leaves an agent no way to judge an artifact kind nobody
 * enumerated, and a criterion alone gives it no anchor in a project whose suite does read one of
 * these files. Every package that directs such a write after the regression evidence step restates
 * this sentence, so the rerun decision is made from the rule rather than from the agent's sense of
 * whether a rerun could matter.
 */
const REGRESSION_EVIDENCE_CARVE_OUT_SNIPPET =
  "a write the configured regression command neither compiles nor reads — currently a change-local"
  + " delta-tech artifact or a lesson — does not invalidate passing complete project regression evidence";
const SHARED_SCHEMA_CACHE_ROOT_SNIPPET = "~/.strict-spec-schemas/";
const SHARED_SCHEMA_FILE_LOOKUP_SNIPPET =
  "When a YAML artifact already declares `schema_file`, resolve that relative path under the shared cache root";
const SAMPLE_SHOW_LOOKUP_SNIPPET = "sample-show";
const LOCAL_EXAMPLES_DIRECTORY_SNIPPET = "do not rely on a local `examples` directory";
const BUGFIX_KNOWN_BUG_SNIPPET = "known bug";
const BUGFIX_REPRODUCE_BEFORE_FIXING_SNIPPET = "Reproduce before fixing";
const BUGFIX_REGRESSION_TEST_SNIPPET = "failing regression";
const BUGFIX_MINIMAL_FIX_SNIPPET = "minimal fix";
const BUGFIX_UNCLEAR_ISSUE_HANDOFF_SNIPPET = "strict-spec-brainstorm";

/**
 * Skills that start a change from a human request. Each must interrogate the need before the
 * change-intake checklist interrogates the solution, so the guidance below is enforced rather than
 * left to the agent's diligence.
 */
export const REQUIREMENT_INTERROGATION_SKILLS = [
  "strict-spec-brainstorm",
  "strict-spec-propose",
  "strict-spec-bugfix",
  "strict-spec-auto",
] as const;

/**
 * The command a mutation-capable skill points at instead of restating the protocol. The skill is
 * static text loaded before any command runs, so the pointer is what turns a reader into a caller;
 * a skill that omits it leaves the protocol unreachable from the only text the agent has read.
 */
export const AUTHORING_PROTOCOL_POINTER_COMMAND = `${COMMAND_PREFIX} yaml-authoring-protocol`;

export const REQUIREMENT_INTERROGATION_HEADING = "## Requirement Interrogation";

export const PREFERRED_HUMAN_LANGUAGE_HEADING = "## Preferred Human Language";
export const SKILL_COMMANDS_HEADING = "## This Skill's Commands";
export const PREREQUISITES_HEADING = "## Prerequisites";

/**
 * The elements the preferred-human-language guidance must name, checked per skill.
 *
 * The guidance was a nine-line paragraph copied into every skill and asserted only by this
 * repository's test suite, so a project running validate-skills got no check at all even though the
 * spec scenario claimed one. Collapsing it to a sentence is safe only because the elements move
 * here: what an agent must know is which file, which field, that the field is not a programming
 * language, that compliance is required, and what overrides it — none of which needs a paragraph.
 */
export const PREFERRED_HUMAN_LANGUAGE_SNIPPETS: ReadonlyArray<{ snippet: string; element: string }> = [
  { snippet: "`.strict-spec-driven/config.yaml`", element: "the config file the language preference is read from" },
  { snippet: "`preferred_human_language`", element: "the config field name" },
  { snippet: "common human language", element: "the field's meaning as the user's common human language" },
  { snippet: "not a programming language", element: "the distinction from a programming language" },
  { snippet: "comply", element: "the requirement to comply with the configured language" },
  { snippet: "the active user message", element: "the active-user-message override" },
];

/**
 * The elements shared by both statements of the strict workflow state precondition.
 *
 * `STRICT_WORKFLOW_EXISTENCE_STEP_SNIPPET` cannot serve as the repetition signal: the Steps copy
 * opens with "Before any other step" while the Prerequisites copy opened with "before any workflow
 * work", so matching the enforced snippet alone would have found no duplicate in any of the 35
 * skills that carried one. These two phrases appeared verbatim in both copies, which is what makes
 * them the evidence that two sections are stating the same instruction.
 *
 * `CHECK_WORKFLOW_STATE_COMMAND` is deliberately excluded. A command name is a reference, not an
 * instruction: skills name that command wherever they invoke it — one policy fixture names it as
 * its artifact validation command inside the protocol section — so matching it reported repetition
 * for a file that stated the precondition exactly once.
 */
export const STRICT_WORKFLOW_SHARED_ELEMENTS: ReadonlyArray<{ snippet: string; element: string }> = [
  { snippet: STRICT_WORKFLOW_INIT_GUIDANCE_SNIPPET, element: "the init guidance" },
  { snippet: STRICT_WORKFLOW_NO_INIT_SNIPPET, element: "the do-not-run-init statement" },
];

const TASK_GENERATOR_PATTERNS: readonly RegExp[] = [
  /generate\s+<change(?:-name)?>\s+tasks/,
  /tasks\s+--(?:implementation|testing|verification)\b/,
];

const TASK_SECTION_NAMES_IN_PROSE: readonly string[] = ["Implementation", "Testing", "Verification"];

/**
 * Reports whether a skill directs change task-list authoring, and is therefore governed by the
 * task-ordering requirement.
 *
 * The governed set is derived from what a skill's content actually does rather than enumerated, so
 * a task-authoring skill added later inherits the requirement instead of escaping it by being
 * absent from a list. Two independent signals are recognized, because a skill may direct authoring
 * either by naming the tasks generator or by prescribing the artifact's section content: matching
 * only one of them would let a reworded skill drop out of the governed set silently.
 */
export function directsTaskListAuthoring(content: string): boolean {
  if (TASK_GENERATOR_PATTERNS.some((pattern) => pattern.test(content))) return true;
  return content.includes("tasks.yaml")
    && TASK_SECTION_NAMES_IN_PROSE.every((sectionName) => content.includes(sectionName));
}

/** The apply skill carries the out-of-order completion guidance rather than the placement guidance. */
export const TASK_ORDER_APPLY_SKILL = "strict-spec-apply";

/** Placement guidance every task-authoring skill must carry, matched on normalized whitespace. */
export const TASK_ORDER_PLACEMENT_SNIPPETS: ReadonlyArray<{ snippet: string; element: string }> = [
  {
    snippet: "`--before <task-id>` or `--after <task-id>`",
    element: "the positional arguments that place a task within its section",
  },
  {
    snippet: "task order is the order `apply` walks",
    element: "why task order matters, namely that it is the order apply walks",
  },
  {
    snippet: "must run before existing pending work is anchored rather than appended",
    element: "the rule that work which must run before existing pending tasks is anchored, not appended",
  },
];

/** Out-of-order completion guidance the apply skill must carry. */
export const TASK_ORDER_APPLY_SNIPPETS: ReadonlyArray<{ snippet: string; element: string }> = [
  {
    snippet: "`apply` is positional, not addressed",
    element: "that apply completes whichever task is next in list order rather than one named by id",
  },
  {
    snippet: "--status complete",
    element: "addressing a task by id to record work finished out of list order",
  },
  {
    snippet: "`--before <task-id>` or `--after <task-id>`",
    element: "repositioning the remaining tasks when the list order itself is wrong",
  },
];

export type RequirementInterrogationExpectation = {
  /** Text the skill must carry verbatim. */
  snippet: string;
  /** What the snippet enforces, named in the diagnostic so the fix is obvious. */
  element: string;
};

export const REQUIREMENT_INTERROGATION_SNIPPETS: ReadonlyArray<RequirementInterrogationExpectation> = [
  { snippet: "never answered from repository evidence", element: "the rule that requirement items are never answered from repository evidence" },
  { snippet: "requirement-problem", element: "the canonical requirement id 'requirement-problem'" },
  { snippet: "requirement-outcome", element: "the canonical requirement id 'requirement-outcome'" },
  { snippet: "requirement-trigger", element: "the canonical requirement id 'requirement-trigger'" },
  { snippet: "requirement-non-goals", element: "the canonical requirement id 'requirement-non-goals'" },
  { snippet: "requirement-interpretation", element: "the canonical requirement id 'requirement-interpretation'" },
  { snippet: "one question at a time", element: "the asking-technique rule of one question at a time" },
  { snippet: "concrete guess", element: "the asking-technique rule that a question carries a concrete guess rather than a blank prompt" },
  { snippet: "names a solution", element: "the asking-technique rule that rejects an answer naming a solution instead of a problem" },
  { snippet: "explain why the question matters", element: "the duty to explain a question before posing it" },
  { snippet: "state the reason for the pushback", element: "the duty to state the reason for pushback instead of silently re-asking" },
];

/**
 * Skills that review a change the same agent implemented. Each must carry the review-independence
 * contract, because the reviewer's bias here is structural rather than occasional: the agent that
 * wrote the code is the agent grading it, and a gate staffed by the author cannot fail.
 */
export const REVIEW_INDEPENDENCE_SKILLS = [
  "strict-spec-review",
  "strict-spec-auto",
] as const;

export const REVIEW_INDEPENDENCE_HEADING = "## Review Independence";

/**
 * The elements the review-independence guidance must carry, checked per review-capable skill.
 *
 * Every snippet is a phrase the guidance states rather than a command name it references, because a
 * command name occurs wherever the skill merely mentions that command. The elements live here rather
 * than being derived from the guidance text so the check cannot be satisfied by the very section it
 * governs, and each carries the element name a diagnostic reports, so a skill missing one is told
 * which contract it dropped rather than which string failed to match.
 */
export const REVIEW_INDEPENDENCE_SNIPPETS: ReadonlyArray<RequirementInterrogationExpectation> = [
  {
    snippet: "Read only `proposal.yaml`, `design.yaml`, `questions.yaml`, and the delta specs",
    element: "the planning artifacts and delta specs the requirement is reconstructed from",
  },
  {
    snippet: "before any implementation file, diff, or test file is read",
    element: "the rule that requirement reconstruction completes before the implementation is read",
  },
  {
    snippet: "a numbered list of acceptance items",
    element: "the duty to write down a numbered list of acceptance items during reconstruction",
  },
  {
    snippet: "Never derive the requirement from the implementation",
    element: "the prohibition on deriving the requirement from the implementation",
  },
  {
    snippet: "an outside reviewer who did not write them",
    element: "the outside-reviewer stance the changed files are read in",
  },
  {
    snippet: "`satisfied`, `not satisfied`, or `unprovable from evidence`",
    element: "the three verdict values every acceptance item resolves to",
  },
  {
    snippet: "an implementation reference and a test reference",
    element: "the duty to attach an implementation reference and a test reference to each verdict",
  },
  {
    snippet: "is not a substitute for per-item verdicts",
    element: "the rule that a blanket claim of matching the proposal is not a substitute for per-item verdicts",
  },
  {
    snippet: "blocks the archive recommendation",
    element: "the rule that an unprovable verdict on a MUST-strength requirement blocks the archive recommendation",
  },
];

export const SCENE_FIRST_ROUTING_HEADING = "## Scene-First Requirement Routing";

/**
 * The gate a scene-aware lifecycle skill must name, rather than restate.
 *
 * The rule itself lives in the verify implementation, which already emits the remedy command, so a
 * skill that reproduced the rule would go stale the moment the diagnostic's wording changed. What
 * these pin is that the skill sends its reader to the diagnostic rather than to a copy of it.
 */
export const SCENE_COVERAGE_DIAGNOSTIC_SNIPPET =
  "naming neither a covering requirement nor an explicit no-coverage reason";
export const SCENE_COVERAGE_REMEDY_SNIPPET = "diagnostic names the runnable command";

/** The read-only command every scene-aware skill reaches coverage state through. */
export const SCENE_STATUS_COMMAND = `${COMMAND_PREFIX} scene-status`;

/** The change-scoped scene authoring command, declared separately from the generate usage line. */
export const SCENE_DELTA_GENERATE_COMMAND =
  `${COMMAND_PREFIX} generate <change-name> delta-scene --<named-args>`;

/**
 * What the scene-first routing procedure must state, checked on the skill that owns it.
 *
 * The milestone this came from exists because an author asked for requirements immediately skips
 * who acts, what must already hold, and what happens when the main flow fails. Each element below
 * is one of those skipped questions or one of the two rules that keep the routing honest — author
 * the scene first, and never fill the artifact with an invented flow — so a skill that kept the
 * heading while dropping the substance fails rather than passes.
 */
export const SCENE_FIRST_ROUTING_SNIPPETS: ReadonlyArray<{ snippet: string; element: string }> = [
  { snippet: "before any requirement is drafted", element: "that the scene questions come before any requirement" },
  { snippet: "who acts", element: "the actor question" },
  { snippet: "what must already be true", element: "the precondition question" },
  { snippet: "step by ordered step", element: "the ordered main-flow question" },
  { snippet: "what triggers each exception flow", element: "the exception-flow question" },
  { snippet: "Author the scene before the delta spec", element: "the scene-before-requirement authoring order" },
  { snippet: "`scene-state`", element: "the scene artifact kind the routing writes" },
  { snippet: "record why no scene applies", element: "what a purely technical change records instead of a scene" },
  {
    snippet: "triggered by the presence of a scene, never by the presence of a spec",
    element: "that scene checking is triggered by a scene rather than by a spec",
  },
  {
    snippet: "Do not invent an actor flow to fill the artifact",
    element: "the ban on inventing a flow to satisfy the artifact",
  },
];

export const DELEGATED_PROCEDURES_HEADING = "## Delegated Procedures";

/**
 * One line of a Delegated Procedures section: an obligation id and the skill that owns it.
 *
 * The owning skill is backticked so the packaged-skill reference check already recognizes it and
 * fails when the named skill has no package, which means a delegation can never point at a skill
 * that was deleted. The obligation id is matched as a whole segment list rather than one character
 * class so a typo produces no match — and therefore an unrecognized-obligation diagnostic — instead
 * of silently resolving to a neighbouring id.
 */
export const DELEGATION_DECLARATION_PATTERN = new RegExp(
  String.raw`^[-*]\s*([a-z0-9]+(?:-[a-z0-9]+)*):\s*owned by\s+\`((?:`
  + STRICT_SKILL_NAME_PREFIXES.join("|")
  + String.raw`)[a-z0-9]+(?:-[a-z0-9]+)*)\``,
  "gm",
);

/**
 * The literal line a skill writes to declare one delegation, so a delegating skill can pin its own
 * declarations as required content.
 *
 * A declared delegation is what replaces an inline statement as the enforcement point, which means
 * deleting the declaration deletes the obligation rather than relocating it: the restatement check
 * only fires on a delegation that is declared, and most obligations have no per-skill content check
 * to fall back on. Requiring the declaration closes that direction, and the restatement check
 * already closes the other, so the pair leaves no way to end up with the procedure stated nowhere.
 */
export const delegationDeclaration = (obligation: string, owner: string): string =>
  `${obligation}: owned by \`${owner}\``;

/**
 * A procedure a skill may hand to the skill that owns it instead of restating it.
 *
 * `ownerSnippets` is what the *owning* skill must state, written in the owner's own wording rather
 * than the delegating skill's. The two diverge in practice — the archive obligation reads "explicitly
 * classify" in an orchestrating skill and "explicitly classifies" in the skill that performs it — so
 * a check comparing the owner against the delegating skill's literal would reject a delegation whose
 * obligation is fully covered, and the only way to satisfy it would be to edit the owning skill.
 *
 * `waivedSnippets` names the delegating skill's own required snippets that this delegation covers.
 * Waiving is listed per obligation rather than inferred by string equality for the same reason: the
 * two wordings are not equal, and inferring the link would drop exactly the snippets that differ.
 */
export type DelegableObligation = {
  /** What the obligation is, named in diagnostics so a failure says which contract went unmet. */
  element: string;
  /** A section heading the owning skill must carry, when the obligation is section-shaped. */
  ownerHeading?: string;
  /** Content the owning skill must state for a delegation of this obligation to be accepted. */
  ownerSnippets: ReadonlyArray<{ snippet: string; element: string }>;
  /** Required snippets the delegating skill no longer states inline once this is delegated. */
  waivedSnippets: readonly string[];
};

export const DELEGABLE_OBLIGATIONS: Record<string, DelegableObligation> = {
  "requirement-interrogation": {
    element: "the requirement-interrogation guidance",
    ownerHeading: REQUIREMENT_INTERROGATION_HEADING,
    ownerSnippets: REQUIREMENT_INTERROGATION_SNIPPETS,
    waivedSnippets: [],
  },
  "scene-first-routing": {
    element: "the scene-first requirement-routing guidance",
    ownerHeading: SCENE_FIRST_ROUTING_HEADING,
    ownerSnippets: SCENE_FIRST_ROUTING_SNIPPETS,
    waivedSnippets: [],
  },
  "review-independence": {
    element: "the review-independence contract",
    ownerHeading: REVIEW_INDEPENDENCE_HEADING,
    ownerSnippets: REVIEW_INDEPENDENCE_SNIPPETS,
    waivedSnippets: [],
  },
  "archive-tech-sync": {
    element: "the final current-change tech sync performed before archive",
    ownerSnippets: [
      { snippet: CURRENT_CHANGE_TECH_SYNC_SNIPPET, element: "the final current-change tech sync" },
      { snippet: CURRENT_CHANGE_SCOPE_SNIPPET, element: "the scan scope the sync is bounded to" },
      { snippet: CURRENT_CHANGE_DELTA_TECH_SNIPPET, element: "capturing a confirmed convention as current-change delta tech" },
      { snippet: ARCHIVE_APPLIES_RECOMMENDATION_SNIPPET, element: "applying the recommendation instead of pausing for an operator answer" },
      { snippet: NOT_REUSABLE_CLASSIFICATION_SNIPPET, element: "the recorded not-reusable classification that closes a finding" },
      { snippet: ARCHIVE_DECISION_REPORT_SNIPPET, element: "reporting the applied decision in the archive summary" },
      { snippet: NO_POST_ARCHIVE_DEFERRAL_SNIPPET, element: "the ban on deferring a confirmed reusable convention past archive" },
    ],
    // The regression-evidence carve-out is deliberately not part of this obligation. It governs the
    // rerun decision rather than the sync, and the archive requirement separately obliges every
    // surface that directs a lesson or delta-tech write after regression evidence passed to state it
    // at the step where that decision is made — which for an orchestrating skill is its own
    // regression step, not the sync it delegates.
    waivedSnippets: [
      CURRENT_CHANGE_TECH_SYNC_SNIPPET,
      CURRENT_CHANGE_SCOPE_SNIPPET,
      CURRENT_CHANGE_DELTA_TECH_SNIPPET,
      ARCHIVE_APPLIES_RECOMMENDATION_SNIPPET,
      NOT_REUSABLE_CLASSIFICATION_SNIPPET,
      ARCHIVE_DECISION_REPORT_SNIPPET,
      NO_POST_ARCHIVE_DEFERRAL_SNIPPET,
    ],
  },
  "code-review-evidence": {
    element: "the requirement for direct code review evidence before archive",
    ownerSnippets: [
      { snippet: "direct code review evidence", element: "the requirement for direct code review evidence before archive" },
    ],
    waivedSnippets: ["direct code review evidence"],
  },
  "blocking-coverage": {
    element: "the rule that a declared coverage contract is blocking review evidence",
    ownerSnippets: [
      { snippet: "is the coverage gate", element: "that the configured regression command is the coverage gate" },
      { snippet: "never advisory output", element: "that a coverage failure is never advisory output" },
    ],
    waivedSnippets: [],
  },
  "spec-artifact-routing": {
    element: "the routing that decides whether a change needs a delta spec or delta tech",
    ownerSnippets: [
      { snippet: "A strict change may legitimately have no delta spec", element: "that a change may legitimately have no delta spec" },
      { snippet: "Create `delta-spec` artifacts only when the change modifies user-observable", element: "when a delta spec is created" },
      { snippet: "If a technical-only change alters, adds, or retires an engineering rule", element: "when a technical-only change needs delta tech" },
    ],
    waivedSnippets: [],
  },
  "change-intake-gate": {
    element: "the change-intake question gate",
    ownerSnippets: [
      { snippet: "change-intake checklist", element: "the change-intake checklist" },
      { snippet: "Do not ask the human for information already recoverable", element: "the rule against asking for recoverable information" },
      { snippet: "Stop before implementation while `questions.yaml.open` is non-empty", element: "the rule that an open question stops implementation" },
    ],
    waivedSnippets: [],
  },
  "task-list-authoring": {
    element: "the task-list authoring procedure",
    ownerSnippets: [
      { snippet: "one CLI invocation per task", element: "that each task is authored by its own CLI invocation" },
      { snippet: "upserts by `(section, task-id)` and is idempotent", element: "the upsert-by-section-and-id semantics" },
      { snippet: "`--validation-task <task-id>` and `--unit-test-task <task-id>`", element: "setting the testing gates" },
    ],
    waivedSnippets: [],
  },
  "delta-artifact-authoring": {
    element: "the incremental delta-spec and delta-tech authoring procedure",
    ownerSnippets: [
      { snippet: "One requirement can include multiple scenario groups by repeating `--scenario`", element: "repeating a scenario group under one requirement" },
      { snippet: "Scenarios append on their own, so nothing needs rebuilding or hand-editing to add one", element: "that scenarios append without a rebuild" },
      { snippet: "Drop a single scenario with `--remove-scenario <requirement-id>:<scenario-id>`", element: "removing one scenario without touching its siblings" },
    ],
    waivedSnippets: [],
  },
  "gitignore-hygiene": {
    element: "the gitignore hygiene pass over generated artifacts",
    ownerSnippets: [
      { snippet: "run `git status --short` to find newly created untracked files", element: "finding newly created untracked files" },
      { snippet: "add matching entries to `.gitignore`", element: "adding the matching ignore entries" },
      { snippet: "do not ignore source code, configuration", element: "the rule that source and configuration are never ignored" },
    ],
    waivedSnippets: [],
  },
  "implementation-order": {
    element: "the task implementation and completion procedure",
    ownerSnippets: [
      { snippet: "read relevant code before editing", element: "reading the relevant code before editing it" },
      { snippet: "implement the next pending task", element: "implementing tasks in list order" },
      { snippet: "never violate a MUST rule", element: "the ban on violating a MUST rule to finish a task" },
      { snippet: "`apply` is positional, not addressed", element: "that apply completes the next task in list order rather than one named by id" },
    ],
    waivedSnippets: [],
  },
  "lesson-outcome": {
    element: "the required lesson-outcome declaration before archive",
    ownerSnippets: [
      { snippet: "state explicitly either that a lesson was recorded or that none applies", element: "the duty to declare the lesson outcome either way" },
      { snippet: "padded with filler", element: "the reason a manufactured lesson is worse than none" },
    ],
    waivedSnippets: [],
  },
  "archive-execution": {
    element: "the archive execution procedure",
    ownerSnippets: [
      {
        snippet: "if it is empty, treat the change as having no delta specs to merge",
        element: "that an empty specs directory is merged as no delta specs rather than blocking",
      },
    ],
    waivedSnippets: [],
  },
};

/** Every delegation `content` declares, as an obligation id with the skill named as its owner. */
export function parseDelegations(content: string): Array<{ obligation: string; owner: string }> {
  const section = content.split(DELEGATED_PROCEDURES_HEADING)[1];
  if (section === undefined) return [];
  const body = section.split(/^## /m)[0] ?? "";
  return [...body.matchAll(DELEGATION_DECLARATION_PATTERN)].map((match) => ({
    obligation: match[1] as string,
    owner: match[2] as string,
  }));
}

/** Whether `content` delegates `obligation` to another skill rather than stating it inline. */
export function delegatesObligation(content: string, obligation: string): boolean {
  return parseDelegations(content).some((entry) => entry.obligation === obligation);
}

export const CORE_STRICT_SKILL_EXPECTATIONS: Record<string, SkillContentExpectation> = {
  "strict-spec-init": {
    requiredCommands: {
      init: `${COMMAND_PREFIX} init`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/",
      "generate a concise `AGENTS.md`",
      "never overwrite an existing `AGENTS.md`",
    ],
  },
  "strict-spec-propose": {
    requiredCommands: {
      "roadmap-recommend": `${COMMAND_PREFIX} roadmap-recommend`,
      propose: `${COMMAND_PREFIX} propose <change-name>`,
      generate: GENERATE_NAMED_ARGS_COMMAND,
      "generate-delta-scene": SCENE_DELTA_GENERATE_COMMAND,
      "scene-status": SCENE_STATUS_COMMAND,
      ready: READY_COMMAND,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules", SCENE_FIRST_ROUTING_HEADING],
    requiredSnippets: [
      ".strict-spec-driven/",
      "/strict-spec-auto",
      // Propose owns scene-first routing, so its substance is pinned here rather than only through
      // the owner check, which fires only while some other skill still declares the delegation.
      ...SCENE_FIRST_ROUTING_SNIPPETS.map((expectation) => expectation.snippet),
      ROADMAP_PROPOSAL_ONLY_SNIPPET,
      "strict-roadmap-recommend",
      PROPOSE_MILESTONE_SELECTOR_SNIPPET,
      PROPOSE_MILESTONE_RECOMMEND_SNIPPET,
      ROADMAP_SCRIPTED_RECOMMEND_SNIPPET,
      ROADMAP_RECOMMEND_BEFORE_CONTEXT_SNIPPET,
      PROPOSE_MILESTONE_ROADMAP_LINK_SNIPPET,
      PROPOSE_MILESTONE_BLOCKER_SNIPPET,
      PROPOSE_MILESTONE_NO_ALLOW_UNREFINED_SNIPPET,
      PROPOSAL_CHECKPOINT_SNIPPET,
      PROPOSAL_CHECKPOINT_DECISION_READY_SNIPPET,
      PROPOSAL_CHECKPOINT_DETAIL_CRITERIA_SNIPPET,
      PROPOSAL_CHECKPOINT_DOCUMENTATION_FIX_SNIPPET,
      SHARED_SCHEMA_CACHE_ROOT_SNIPPET,
      SHARED_SCHEMA_FILE_LOOKUP_SNIPPET,
      SAMPLE_SHOW_LOOKUP_SNIPPET,
      LOCAL_EXAMPLES_DIRECTORY_SNIPPET,
    ],
    forbiddenSnippets: [
      "Scaffolds proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and strict YAML delta specs under .strict-spec-driven/changes/<name>/.",
      "proposal review",
      "If the user asks to source a change from the roadmap, stop and tell them to use",
    ],
  },
  "strict-spec-apply": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      apply: `${COMMAND_PREFIX} apply <change-name>`,
      "scene-status": SCENE_STATUS_COMMAND,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules", "## Harness Guidance"],
    requiredSnippets: [
      ".strict-spec-driven/",
      "harness-plan",
      SCENE_COVERAGE_DIAGNOSTIC_SNIPPET,
      SCENE_COVERAGE_REMEDY_SNIPPET,
      "never a waiver to invent",
      SHARED_SCHEMA_CACHE_ROOT_SNIPPET,
      SHARED_SCHEMA_FILE_LOOKUP_SNIPPET,
      SAMPLE_SHOW_LOOKUP_SNIPPET,
      LOCAL_EXAMPLES_DIRECTORY_SNIPPET,
    ],
  },
  "strict-spec-verify": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules", "## Harness Guidance"],
    requiredSnippets: [".strict-spec-driven/", "harness-plan"],
  },
  "strict-spec-review": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      "scene-status": SCENE_STATUS_COMMAND,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules", "## Harness Guidance"],
    requiredSnippets: [
      ".strict-spec-driven/",
      "harness-plan",
      "direct code review evidence",
      SCENE_COVERAGE_DIAGNOSTIC_SNIPPET,
      // Review's scene obligation is the judgment the gate cannot make, so what is pinned is the
      // hollow-waiver check rather than the gate rule the gate already enforces.
      "a way to silence a gap",
      REVIEW_AUTO_FIX_SNIPPET,
      REVIEW_POST_FIX_REGRESSION_SNIPPET,
      CURRENT_CHANGE_TECH_SYNC_SNIPPET,
      CURRENT_CHANGE_DELTA_TECH_SNIPPET,
      NO_POST_ARCHIVE_DEFERRAL_SNIPPET,
      REVIEW_REFLECTION_RECOMMENDATION_SNIPPET,
      REGRESSION_EVIDENCE_CARVE_OUT_SNIPPET,
      `Do not call or rely on a \`${COMMAND_PREFIX} review\` command`,
    ],
    forbiddenSnippets: [
      `${COMMAND_PREFIX} review <change-name>`,
    ],
  },
  "strict-spec-archive": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
      archive: `${COMMAND_PREFIX} archive <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/",
      CURRENT_CHANGE_TECH_SYNC_SNIPPET,
      CURRENT_CHANGE_SCOPE_SNIPPET,
      CURRENT_CHANGE_DELTA_TECH_SNIPPET,
      ARCHIVE_APPLIES_RECOMMENDATION_SNIPPET,
      NOT_REUSABLE_CLASSIFICATION_SNIPPET,
      ARCHIVE_DECISION_REPORT_SNIPPET,
      NO_POST_ARCHIVE_DEFERRAL_SNIPPET,
      REGRESSION_EVIDENCE_CARVE_OUT_SNIPPET,
      // Archive's scene obligation is to say the merge happens and that an absent scenes directory
      // is not a blocker, which is the same shape as the delta-spec statement beside it.
      "merge strict YAML delta scenes into",
      "the change merges no scene and the recorded scenes are left untouched",
    ],
    forbiddenSnippets: [
      "any change to roadmap state caused by archive",
      "ask the user to confirm the change truly has no observable",
    ],
  },
  "strict-spec-auto": {
    requiredCommands: {
      propose: `${COMMAND_PREFIX} propose <change-name>`,
      generate: GENERATE_NAMED_ARGS_COMMAND,
      "generate-delta-scene": SCENE_DELTA_GENERATE_COMMAND,
      "scene-status": SCENE_STATUS_COMMAND,
      apply: `${COMMAND_PREFIX} apply <change-name>`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
      ready: READY_COMMAND,
      next: NEXT_COMMAND,
      archive: `${COMMAND_PREFIX} archive <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules", "## Harness Guidance"],
    requiredSnippets: [
      ".strict-spec-driven/",
      "/strict-spec-ship <change-name>",
      delegationDeclaration("scene-first-routing", "strict-spec-propose"),
      SCENE_COVERAGE_DIAGNOSTIC_SNIPPET,
      SCENE_COVERAGE_REMEDY_SNIPPET,
      // Auto fixes safe blockers unattended, so it is the one skill that must be told which
      // blocker fix is not safe: writing a waiver to clear the diagnostic.
      "not a safe blocker fix",
      AUTO_TARGETED_CONTEXT_RESET_SNIPPET,
      AUTO_RESUME_POPULATED_SCAFFOLD_SNIPPET,
      AUTO_REUSE_REGRESSION_EVIDENCE_SNIPPET,
      PROPOSAL_CHECKPOINT_SNIPPET,
      PROPOSAL_CHECKPOINT_DECISION_READY_SNIPPET,
      PROPOSAL_CHECKPOINT_DETAIL_CRITERIA_SNIPPET,
      PROPOSAL_CHECKPOINT_DOCUMENTATION_FIX_SNIPPET,
      "harness-plan",
      "direct code review evidence",
      REVIEW_AUTO_FIX_SNIPPET,
      REVIEW_POST_FIX_REGRESSION_SNIPPET,
      CURRENT_CHANGE_TECH_SYNC_SNIPPET,
      CURRENT_CHANGE_SCOPE_SNIPPET,
      CURRENT_CHANGE_DELTA_TECH_SNIPPET,
      ARCHIVE_APPLIES_RECOMMENDATION_SNIPPET,
      NOT_REUSABLE_CLASSIFICATION_SNIPPET,
      ARCHIVE_DECISION_REPORT_SNIPPET,
      NO_POST_ARCHIVE_DEFERRAL_SNIPPET,
      REVIEW_REFLECTION_RECOMMENDATION_SNIPPET,
      REGRESSION_EVIDENCE_CARVE_OUT_SNIPPET,
      `Do not call or rely on a \`${COMMAND_PREFIX} review\` command`,
      SHARED_SCHEMA_CACHE_ROOT_SNIPPET,
      SHARED_SCHEMA_FILE_LOOKUP_SNIPPET,
      SAMPLE_SHOW_LOOKUP_SNIPPET,
      LOCAL_EXAMPLES_DIRECTORY_SNIPPET,
    ],
    forbiddenSnippets: [
      "empty-spec-impact decisions block progress",
      "empty-spec-impact decision has been explicitly confirmed",
      `${COMMAND_PREFIX} review <change-name>`,
      "proposal review",
    ],
  },
  "strict-spec-bugfix": {
    requiredCommands: {
      propose: `${COMMAND_PREFIX} propose <change-name>`,
      generate: GENERATE_NAMED_ARGS_COMMAND,
      ready: READY_COMMAND,
      next: NEXT_COMMAND,
      apply: `${COMMAND_PREFIX} apply <change-name>`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
      archive: `${COMMAND_PREFIX} archive <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules", "## Harness Guidance"],
    requiredSnippets: [
      ".strict-spec-driven/",
      BUGFIX_KNOWN_BUG_SNIPPET,
      BUGFIX_REPRODUCE_BEFORE_FIXING_SNIPPET,
      BUGFIX_REGRESSION_TEST_SNIPPET,
      BUGFIX_MINIMAL_FIX_SNIPPET,
      BUGFIX_UNCLEAR_ISSUE_HANDOFF_SNIPPET,
      // The lifecycle procedures bugfix reaches through its owner rather than restating. Requiring
      // the declarations keeps each obligation enforced at exactly one place: drop a line and this
      // check fails, restore the text without dropping the line and the restatement check fails.
      delegationDeclaration("requirement-interrogation", "strict-spec-propose"),
      delegationDeclaration("change-intake-gate", "strict-spec-propose"),
      delegationDeclaration("spec-artifact-routing", "strict-spec-propose"),
      delegationDeclaration("delta-artifact-authoring", "strict-spec-propose"),
      delegationDeclaration("implementation-order", "strict-spec-apply"),
      delegationDeclaration("lesson-outcome", "strict-spec-review"),
      PROPOSAL_CHECKPOINT_SNIPPET,
      PROPOSAL_CHECKPOINT_DOCUMENTATION_FIX_SNIPPET,
      "direct review",
      REVIEW_AUTO_FIX_SNIPPET,
      REVIEW_POST_FIX_REGRESSION_SNIPPET,
      REGRESSION_EVIDENCE_CARVE_OUT_SNIPPET,
      SHARED_SCHEMA_CACHE_ROOT_SNIPPET,
      SHARED_SCHEMA_FILE_LOOKUP_SNIPPET,
      SAMPLE_SHOW_LOOKUP_SNIPPET,
      LOCAL_EXAMPLES_DIRECTORY_SNIPPET,
    ],
    forbiddenSnippets: [
      `${COMMAND_PREFIX} review <change-name>`,
      "proposal review",
    ],
  },
  "strict-tech-sync": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      generate: `${COMMAND_PREFIX} generate <change-name> delta-tech --<named-args>`,
      "tech-edit": `${COMMAND_PREFIX} tech-edit <standard-id> [--tech-path <path>] --<named-args>`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/",
      "active-change sync",
      "selected change's proposal, design, tasks, questions, delta specs, delta tech",
      CURRENT_CHANGE_SCOPE_SNIPPET,
      "explicitly approves both the normative content and its strength",
      // The confirmation step is kept for standalone maintenance and waived for the pre-archive
      // checkpoint that applies these same steps. Pinning the qualified heading keeps the two modes
      // from collapsing back into one unqualified "do not proceed until the operator approves",
      // which would contradict the archive skill that owns that checkpoint.
      "Get operator confirmation, except at archive time",
      "explicitly classified as not reusable",
      "may not be deferred until after its active change is archived",
      "never edit a live main standard directly",
      REGRESSION_EVIDENCE_CARVE_OUT_SNIPPET,
    ],
  },
  "strict-tech-edit": {
    requiredCommands: {
      "tech-edit": `${COMMAND_PREFIX} tech-edit <standard-id> [--tech-path <path>] --<named-args>`,
      "tech-status": `${COMMAND_PREFIX} tech-status`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/tech/",
      "Never hand-edit main-tech or tech-index YAML",
    ],
  },
  "strict-spec-modify": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/",
      SHARED_SCHEMA_CACHE_ROOT_SNIPPET,
      SHARED_SCHEMA_FILE_LOOKUP_SNIPPET,
      SAMPLE_SHOW_LOOKUP_SNIPPET,
      LOCAL_EXAMPLES_DIRECTORY_SNIPPET,
    ],
  },
  "strict-spec-ship": {
    requiredCommands: {
      ship: `${COMMAND_PREFIX} ship <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/"],
  },
};

export const ROADMAP_STRICT_SKILL_EXPECTATIONS: Record<string, SkillContentExpectation> = {
  "strict-roadmap-plan": {
    requiredCommands: {
      "roadmap-generate-milestone": `${COMMAND_PREFIX} roadmap-generate milestone --<named-args>`,
      "roadmap-generate-planned-change": `${COMMAND_PREFIX} roadmap-generate planned-change`,
      "roadmap-delete-planned-change":
        `${COMMAND_PREFIX} roadmap-delete-planned-change <planned-change-id> [--allow-complete] [--detach-dependents]`,
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-sync": `${COMMAND_PREFIX} roadmap-sync`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
      ROADMAP_GENERATE_MILESTONE_SNIPPET,
      ROADMAP_PLANNED_CHANGE_CLI_AUTHORING_SNIPPET,
      ROADMAP_CANONICAL_FILENAME_SNIPPET,
      ROADMAP_FIX_NAMES_SNIPPET,
      ROADMAP_PLAN_EXECUTABLE_DETAIL_SNIPPET,
      ROADMAP_PLAN_REVIEW_SNIPPET,
    ],
  },
  "strict-roadmap-recommend": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-recommend": `${COMMAND_PREFIX} roadmap-recommend`,
      propose: `${COMMAND_PREFIX} propose <change-name>`,
      generate: GENERATE_NAMED_ARGS_COMMAND,
      ready: READY_COMMAND,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
      ROADMAP_DETAILS_GUIDANCE_SNIPPET,
      ROADMAP_SPLIT_PLANNED_CHANGE_SNIPPET,
      ROADMAP_ACTIVE_CONFLICT_SNIPPET,
      ROADMAP_SCRIPTED_RECOMMEND_SNIPPET,
      ROADMAP_RECOMMEND_BEFORE_CONTEXT_SNIPPET,
      ROADMAP_READY_HANDOFF_SNIPPET,
      ROADMAP_AUTO_POPULATED_HANDOFF_SNIPPET,
      PROPOSAL_CHECKPOINT_SNIPPET,
      PROPOSAL_CHECKPOINT_DECISION_READY_SNIPPET,
      PROPOSAL_CHECKPOINT_DETAIL_CRITERIA_SNIPPET,
      PROPOSAL_CHECKPOINT_DOCUMENTATION_FIX_SNIPPET,
      "/strict-spec-auto",
    ],
    forbiddenSnippets: ["proposal review"],
  },
  "strict-roadmap-review": {
    requiredCommands: {
      "roadmap-generate-milestone": `${COMMAND_PREFIX} roadmap-generate milestone --<named-args>`,
      "roadmap-generate-planned-change": `${COMMAND_PREFIX} roadmap-generate planned-change`,
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-sync": `${COMMAND_PREFIX} roadmap-sync`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
      ROADMAP_GENERATE_MILESTONE_SNIPPET,
      ROADMAP_PLANNED_CHANGE_CLI_AUTHORING_SNIPPET,
      ROADMAP_CANONICAL_FILENAME_SNIPPET,
      ROADMAP_FIX_NAMES_SNIPPET,
      ROADMAP_REVIEW_INCOMPLETE_SCOPE_SNIPPET,
      ROADMAP_REVIEW_DIRECT_FIX_SNIPPET,
      ROADMAP_REVIEW_DETAIL_ELABORATION_SNIPPET,
      ROADMAP_REVIEW_INTAKE_ANSWER_SNIPPET,
      "Never infer review order from the milestone id prefix",
    ],
  },
  /**
   * One entry covering all eight transitions the merged skill performs. Every operation contributes
   * both a command mapping and at least one content snippet, so the five that no expectation
   * reached before this entry existed — pause, resume, defer, refine, and reopen — are enforced on
   * the same terms as the three that did.
   *
   * Reorder is deliberately absent: it is the one transition whose frequency earned its own skill
   * package, so its command mappings and guidance snippets live in the reorder entry below rather
   * than here, and no operation is asserted against two packages.
   */
  "strict-roadmap-transition": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-overview": `${COMMAND_PREFIX} roadmap-overview`,
      "roadmap-pause": `${COMMAND_PREFIX} roadmap-pause <milestone-id>`,
      "roadmap-resume": `${COMMAND_PREFIX} roadmap-resume <milestone-id>`,
      "roadmap-defer": `${COMMAND_PREFIX} roadmap-defer <milestone-id>`,
      "roadmap-refine": `${COMMAND_PREFIX} roadmap-refine <milestone-id>`,
      "roadmap-move-planned-change":
        `${COMMAND_PREFIX} roadmap-move-planned-change <planned-change-id> --milestone <milestone-id> [--allow-complete]`,
      "roadmap-reopen": `${COMMAND_PREFIX} roadmap-reopen <milestone-id>`,
      "roadmap-archive": `${COMMAND_PREFIX} roadmap-archive [milestone-id]`,
      "roadmap-sync": `${COMMAND_PREFIX} roadmap-sync`,
      "roadmap-sync-fix-names": `${COMMAND_PREFIX} roadmap-sync --fix-names`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
      ROADMAP_SPLIT_PLANNED_CHANGE_SNIPPET,
      ROADMAP_CANONICAL_FILENAME_SNIPPET,
      ROADMAP_FIX_NAMES_SNIPPET,
      ROADMAP_ORDER_SOURCE_SNIPPET,
      ROADMAP_TRANSITION_EXPLICIT_OPERATION_SNIPPET,
      ROADMAP_TRANSITION_STOP_WITHOUT_OPERATION_SNIPPET,
      ROADMAP_TRANSITION_SINGLE_COMMAND_SNIPPET,
      ROADMAP_TRANSITION_INVERSE_PAIRS_SNIPPET,
      ROADMAP_TRANSITION_ARCHIVED_FROZEN_SNIPPET,
      ROADMAP_TRANSITION_PAUSE_SKIP_REASON_SNIPPET,
      ROADMAP_TRANSITION_RESUME_CLEARS_PAUSE_SNIPPET,
      ROADMAP_TRANSITION_DEFER_IS_NOT_PAUSE_SNIPPET,
      ROADMAP_TRANSITION_DEFER_SKIP_REASON_SNIPPET,
      ROADMAP_TRANSITION_REFINE_ASKS_THE_HUMAN_SNIPPET,
      "dependency-order concern",
      ROADMAP_MOVE_ALLOW_COMPLETE_SNIPPET,
      ROADMAP_MOVE_NO_CHANGE_WRITES_SNIPPET,
      ROADMAP_TRANSITION_REOPEN_FROZEN_SNIPPET,
      ROADMAP_TRANSITION_REOPEN_SEEDS_FOLLOW_UP_SNIPPET,
      ROADMAP_ARCHIVE_DEFAULT_ALL_SNIPPET,
      ROADMAP_ARCHIVE_COMPLETE_ONLY_SNIPPET,
      ROADMAP_ARCHIVE_PLANNED_CHANGE_SNIPPET,
      ROADMAP_TRANSITION_SYNC_INVENTS_NOTHING_SNIPPET,
    ],
  },
  "strict-roadmap-reorder": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-overview": `${COMMAND_PREFIX} roadmap-overview`,
      "roadmap-reorder": `${COMMAND_PREFIX} roadmap-reorder <milestone-id> (--before <milestone-id> | --after <milestone-id> | --order <integer>)`,
      "roadmap-renumber": `${COMMAND_PREFIX} roadmap-renumber`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
      ROADMAP_SPLIT_PLANNED_CHANGE_SNIPPET,
      ROADMAP_CANONICAL_FILENAME_SNIPPET,
      ROADMAP_FIX_NAMES_SNIPPET,
      ROADMAP_ORDER_SOURCE_SNIPPET,
      "optional integer `order` field",
      ROADMAP_REORDER_PLACEMENT_FLAGS_SNIPPET,
      ROADMAP_REORDER_RENUMBER_FALLBACK_SNIPPET,
      "dependency-order concern",
      ROADMAP_REORDER_ARCHIVED_FROZEN_SNIPPET,
    ],
  },
};

export const PLANNING_STRICT_SKILL_EXPECTATIONS: Record<string, SkillContentExpectation> = {
  "strict-spec-brainstorm": {
    requiredCommands: {
      propose: `${COMMAND_PREFIX} propose <change-name>`,
      generate: GENERATE_NAMED_ARGS_COMMAND,
      "generate-delta-scene": SCENE_DELTA_GENERATE_COMMAND,
      "scene-status": SCENE_STATUS_COMMAND,
      ready: READY_COMMAND,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/",
      "proposal.yaml",
      "questions.yaml",
      // The shared procedures brainstorm reaches through strict-spec-propose. Pinning the
      // declarations keeps each obligation enforced at one place: drop a line and this check fails,
      // restore the text without dropping the line and the restatement check fails. The task-order
      // pin matters most, because that check excuses a delegating skill entirely.
      delegationDeclaration("requirement-interrogation", "strict-spec-propose"),
      delegationDeclaration("scene-first-routing", "strict-spec-propose"),
      delegationDeclaration("change-intake-gate", "strict-spec-propose"),
      delegationDeclaration("spec-artifact-routing", "strict-spec-propose"),
      delegationDeclaration("delta-artifact-authoring", "strict-spec-propose"),
      delegationDeclaration("task-list-authoring", "strict-spec-propose"),
      PROPOSAL_CHECKPOINT_SNIPPET,
      PROPOSAL_CHECKPOINT_DECISION_READY_SNIPPET,
      PROPOSAL_CHECKPOINT_DETAIL_CRITERIA_SNIPPET,
      PROPOSAL_CHECKPOINT_DOCUMENTATION_FIX_SNIPPET,
    ],
    forbiddenSnippets: ["proposal review"],
  },
  "strict-spec-spec-edit": {
    requiredCommands: {
      "spec-edit": `${COMMAND_PREFIX} spec-edit <spec-id> [--spec-path <path>] --<named-args>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/specs/"],
  },
  "strict-spec-sync-specs": {
    requiredCommands: {
      "spec-edit": `${COMMAND_PREFIX} spec-edit <spec-id> [--spec-path <path>] --<named-args>`,
      "scene-status": SCENE_STATUS_COMMAND,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/specs/",
      "INDEX.yaml",
      // A recorded scene turns a drift question into a located comparison, and a project with no
      // scene must be told the scan is unchanged rather than left to infer it.
      "A step reported as covered names the requirement that is supposed to describe it",
      "A project recording no scene produces nothing here",
    ],
  },
  "strict-scene-edit": {
    requiredCommands: {
      "scene-edit": `${COMMAND_PREFIX} scene-edit <scene-id>`,
      "scene-status": SCENE_STATUS_COMMAND,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/scenes/",
      // The interrogation is why this package exists rather than a thin wrapper over one command,
      // and the two coverage rules are what stop a scene being filled in to look complete.
      "who acts",
      "what must already be true",
      "step by ordered step",
      "what triggers each exception flow",
      "Never invent a covering reference to silence a coverage gap",
      "Never hand-edit scene or scene-index YAML",
    ],
  },
};

export function makeDiagnostic(
  code: string,
  diagPath: string,
  message: string,
  expected?: string,
  actual?: string,
): SkillPackagingDiagnostic {
  return { code, path: toPosix(diagPath), message, expected, actual };
}
