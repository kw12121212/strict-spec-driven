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
  `${COMMAND_PREFIX} generate <change-name> <proposal|design|questions|delta-spec|delta-tech> --<named-args>`;
export const READY_COMMAND = `${COMMAND_PREFIX} ready <change-name>`;
export const NEXT_COMMAND = `${COMMAND_PREFIX} next <change-name>`;
export const CHECK_WORKFLOW_STATE_COMMAND = `${COMMAND_PREFIX} check-workflow-state`;
export const STRICT_WORKFLOW_EXISTENCE_STEP_SNIPPET =
  `Before any other step, run \`${CHECK_WORKFLOW_STATE_COMMAND}\``;
export const STRICT_WORKFLOW_INIT_GUIDANCE_SNIPPET =
  "stop immediately and tell the user to run `/strict-spec-init`";
export const STRICT_WORKFLOW_NO_INIT_SNIPPET = "Do not run `init` from this skill.";

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
const ROADMAP_REORDER_SINGLE_COMMAND_SNIPPET = "Translate reorder intent into one CLI command";
const ROADMAP_MOVE_SINGLE_COMMAND_SNIPPET = "Translate move intent into one CLI command";
const ROADMAP_MOVE_ALLOW_COMPLETE_SNIPPET = "--allow-complete";
const ROADMAP_MOVE_NO_CHANGE_WRITES_SNIPPET = "never writes under `.strict-spec-driven/changes/`";
const ROADMAP_PLAN_REVIEW_SNIPPET = "Review the roadmap plan before handoff";
const ROADMAP_SCRIPTED_RECOMMEND_SNIPPET = "treat the command's selected planned change as authoritative";
const ROADMAP_RECOMMEND_BEFORE_CONTEXT_SNIPPET = "before reading broad roadmap context";
const ROADMAP_READY_HANDOFF_SNIPPET = "Use `ready` as the proposal handoff validation";
const ROADMAP_AUTO_POPULATED_HANDOFF_SNIPPET = "populated change scaffold";
const ROADMAP_PROPOSAL_ONLY_SNIPPET = "Do not auto-invoke `/strict-spec-auto` during strict-spec-propose";
const ROADMAP_PROPOSE_FROM_ROADMAP_PROPOSAL_ONLY_SNIPPET =
  "Do not auto-invoke `/strict-spec-auto` during strict-spec-propose-from-roadmap";
const AUTO_TARGETED_CONTEXT_RESET_SNIPPET = "Reset context from targeted files";
const AUTO_RESUME_POPULATED_SCAFFOLD_SNIPPET = "resume the existing populated strict change scaffold without regenerating planning artifacts";
const AUTO_REUSE_REGRESSION_EVIDENCE_SNIPPET =
  "exactly matches the configured complete project regression command";
const PROPOSAL_CHECKPOINT_SNIPPET = "proposal checkpoint";
const PROPOSAL_CHECKPOINT_DECISION_READY_SNIPPET = "decision-ready detail";
const PROPOSAL_CHECKPOINT_DETAIL_CRITERIA_SNIPPET =
  "scope, unchanged behavior, design decisions, task coverage, unresolved-question impact, delta spec scenarios, delta tech use when applicable, and structured mapping fields";
const PROPOSAL_CHECKPOINT_DOCUMENTATION_FIX_SNIPPET = "fix safe, in-scope documentation gaps";
const REVIEW_AUTO_FIX_SNIPPET = "Automatically fix safe in-scope review findings";
const REVIEW_POST_FIX_REGRESSION_SNIPPET =
  "rerun strict verification plus the configured complete regression command after review-time changes";
const CURRENT_CHANGE_TECH_SYNC_SNIPPET = "final current-change tech sync";
const CURRENT_CHANGE_SCOPE_SNIPPET = "attributable tracked and untracked files";
const CURRENT_CHANGE_DELTA_TECH_SNIPPET = "current-change delta tech";
const NO_POST_ARCHIVE_DEFERRAL_SNIPPET = "confirmed as reusable";
const POST_TECH_EDIT_EVIDENCE_SNIPPET = "complete project regression evidence";
const SHARED_SCHEMA_CACHE_ROOT_SNIPPET = "~/.strict-spec-schemas/";
const SHARED_SCHEMA_FILE_LOOKUP_SNIPPET =
  "When a YAML artifact already declares `schema_file`, resolve that relative path under the shared cache root";
const SAMPLE_SHOW_LOOKUP_SNIPPET = "sample-show";
const LOCAL_EXAMPLES_DIRECTORY_SNIPPET = "do not rely on a local `examples` directory";
const BUGFIX_KNOWN_BUG_SNIPPET = "known bug";
const BUGFIX_REPRODUCE_BEFORE_FIXING_SNIPPET = "Reproduce before fixing";
const BUGFIX_REGRESSION_TEST_SNIPPET = "failing regression";
const BUGFIX_MINIMAL_FIX_SNIPPET = "minimal fix";
const BUGFIX_DEBUG_SESSION_SNIPPET = "strict-spec-debug-session";

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

export const REQUIREMENT_INTERROGATION_HEADING = "## Requirement Interrogation";

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
      propose: `${COMMAND_PREFIX} propose <change-name>`,
      generate: GENERATE_NAMED_ARGS_COMMAND,
      ready: READY_COMMAND,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/",
      "/strict-spec-auto",
      ROADMAP_PROPOSAL_ONLY_SNIPPET,
      "strict-spec-propose-from-roadmap",
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
    ],
  },
  "strict-spec-propose-from-roadmap": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-recommend": `${COMMAND_PREFIX} roadmap-recommend`,
      propose: `${COMMAND_PREFIX} propose <change-name>`,
      generate: GENERATE_NAMED_ARGS_COMMAND,
      ready: READY_COMMAND,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
      "/strict-spec-auto",
      ROADMAP_DETAILS_GUIDANCE_SNIPPET,
      ROADMAP_SPLIT_PLANNED_CHANGE_SNIPPET,
      ROADMAP_ACTIVE_CONFLICT_SNIPPET,
      ROADMAP_SCRIPTED_RECOMMEND_SNIPPET,
      ROADMAP_RECOMMEND_BEFORE_CONTEXT_SNIPPET,
      ROADMAP_PROPOSE_FROM_ROADMAP_PROPOSAL_ONLY_SNIPPET,
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
      "proposal review",
      "immediately invoke the\n   `/strict-spec-auto <change-name>` skill",
    ],
  },
  "strict-spec-apply": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      apply: `${COMMAND_PREFIX} apply <change-name>`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules", "## Harness Guidance"],
    requiredSnippets: [
      ".strict-spec-driven/",
      "harness-plan",
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
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
    },
    requiredHeadings: ["## Steps", "## Rules", "## Harness Guidance"],
    requiredSnippets: [".strict-spec-driven/", "harness-plan"],
  },
  "strict-spec-review": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules", "## Harness Guidance"],
    requiredSnippets: [
      ".strict-spec-driven/",
      "harness-plan",
      "direct code review evidence",
      REVIEW_AUTO_FIX_SNIPPET,
      REVIEW_POST_FIX_REGRESSION_SNIPPET,
      CURRENT_CHANGE_TECH_SYNC_SNIPPET,
      CURRENT_CHANGE_DELTA_TECH_SNIPPET,
      NO_POST_ARCHIVE_DEFERRAL_SNIPPET,
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
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
      archive: `${COMMAND_PREFIX} archive <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/",
      CURRENT_CHANGE_TECH_SYNC_SNIPPET,
      CURRENT_CHANGE_SCOPE_SNIPPET,
      CURRENT_CHANGE_DELTA_TECH_SNIPPET,
      "explicitly classifies the pattern as not reusable",
      NO_POST_ARCHIVE_DEFERRAL_SNIPPET,
      POST_TECH_EDIT_EVIDENCE_SNIPPET,
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
      apply: `${COMMAND_PREFIX} apply <change-name>`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
      ready: READY_COMMAND,
      next: NEXT_COMMAND,
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
      archive: `${COMMAND_PREFIX} archive <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules", "## Harness Guidance"],
    requiredSnippets: [
      ".strict-spec-driven/",
      "/strict-spec-ship <change-name>",
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
      "explicitly classify the pattern as not reusable",
      NO_POST_ARCHIVE_DEFERRAL_SNIPPET,
      POST_TECH_EDIT_EVIDENCE_SNIPPET,
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
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
      archive: `${COMMAND_PREFIX} archive <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules", "## Harness Guidance"],
    requiredSnippets: [
      ".strict-spec-driven/",
      BUGFIX_KNOWN_BUG_SNIPPET,
      BUGFIX_REPRODUCE_BEFORE_FIXING_SNIPPET,
      BUGFIX_REGRESSION_TEST_SNIPPET,
      BUGFIX_MINIMAL_FIX_SNIPPET,
      BUGFIX_DEBUG_SESSION_SNIPPET,
      PROPOSAL_CHECKPOINT_SNIPPET,
      PROPOSAL_CHECKPOINT_DOCUMENTATION_FIX_SNIPPET,
      "direct review",
      REVIEW_AUTO_FIX_SNIPPET,
      REVIEW_POST_FIX_REGRESSION_SNIPPET,
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
      verify: `${COMMAND_PREFIX} verify <change-name>`,
      "verify-tech-mappings": `${COMMAND_PREFIX} verify-tech-mappings`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/",
      "active-change sync",
      "selected change's proposal, design, tasks, questions, delta specs, delta tech, structured mappings",
      CURRENT_CHANGE_SCOPE_SNIPPET,
      "explicitly approves both the normative content and its strength",
      "explicitly classified as not reusable",
      "may not be deferred until after its active change is archived",
      "never edit a live main standard directly",
      "rerun any complete regression evidence invalidated by the artifact edit",
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
      "optional integer `order` field",
      "roadmap-reorder",
      "roadmap-renumber",
      ROADMAP_ORDER_SOURCE_SNIPPET,
      ROADMAP_REORDER_SINGLE_COMMAND_SNIPPET,
      "dependency-order concern",
      "Archived milestones are frozen history",
    ],
  },
  "strict-roadmap-move": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-overview": `${COMMAND_PREFIX} roadmap-overview`,
      "roadmap-move-planned-change":
        `${COMMAND_PREFIX} roadmap-move-planned-change <planned-change-id> --milestone <milestone-id> [--allow-complete]`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
      ROADMAP_SPLIT_PLANNED_CHANGE_SNIPPET,
      ROADMAP_CANONICAL_FILENAME_SNIPPET,
      ROADMAP_MOVE_SINGLE_COMMAND_SNIPPET,
      ROADMAP_MOVE_ALLOW_COMPLETE_SNIPPET,
      ROADMAP_MOVE_NO_CHANGE_WRITES_SNIPPET,
      "dependency-order concern",
      "Archived milestones and archived planned changes are frozen history",
    ],
  },
  "strict-roadmap-sync": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-sync": `${COMMAND_PREFIX} roadmap-sync`,
      "roadmap-sync-fix-names": `${COMMAND_PREFIX} roadmap-sync --fix-names`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
      ROADMAP_CANONICAL_FILENAME_SNIPPET,
      ROADMAP_FIX_NAMES_SNIPPET,
    ],
  },
  "strict-roadmap-archive": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-archive": `${COMMAND_PREFIX} roadmap-archive [milestone-id]`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
      ROADMAP_ARCHIVE_DEFAULT_ALL_SNIPPET,
      ROADMAP_ARCHIVE_COMPLETE_ONLY_SNIPPET,
      ROADMAP_ARCHIVE_PLANNED_CHANGE_SNIPPET,
    ],
  },
};

export const PLANNING_STRICT_SKILL_EXPECTATIONS: Record<string, SkillContentExpectation> = {
  "strict-spec-brainstorm": {
    requiredCommands: {
      propose: `${COMMAND_PREFIX} propose <change-name>`,
      generate: GENERATE_NAMED_ARGS_COMMAND,
      ready: READY_COMMAND,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/",
      "proposal.yaml",
      "questions.yaml",
      PROPOSAL_CHECKPOINT_SNIPPET,
      PROPOSAL_CHECKPOINT_DECISION_READY_SNIPPET,
      PROPOSAL_CHECKPOINT_DETAIL_CRITERIA_SNIPPET,
      PROPOSAL_CHECKPOINT_DOCUMENTATION_FIX_SNIPPET,
    ],
    forbiddenSnippets: ["proposal review"],
  },
  "strict-spec-spec-edit": {
    requiredCommands: {
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/specs/", "mapping.implementation", "mapping.tests"],
  },
  "strict-spec-sync-specs": {
    requiredCommands: {
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/specs/", "INDEX.yaml"],
  },
  "strict-spec-resync-code-mapping": {
    requiredCommands: {
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/specs/", "mapping.implementation", "mapping.tests"],
  },
};

export const MIGRATION_STRICT_SKILL_EXPECTATIONS: Record<string, SkillContentExpectation> = {
  "strict-spec-migrate": {
    requiredCommands: {
      migrate: `${COMMAND_PREFIX} migrate`,
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".spec-driven/", ".strict-spec-driven/"],
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
