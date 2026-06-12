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
export const COMMAND_PREFIX = "node {{SKILL_DIR}}/scripts/strict-spec-driven.js";
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
const ROADMAP_ACTIVE_CONFLICT_SNIPPET = "active strict change conflicts";
const ROADMAP_PLAN_EXECUTABLE_DETAIL_SNIPPET = "executable planning context";
const ROADMAP_REVIEW_INCOMPLETE_SCOPE_SNIPPET = "only milestones whose status is not complete";
const ROADMAP_REVIEW_DIRECT_FIX_SNIPPET =
  "directly edit the milestone and its planned-change YAML files";
const ROADMAP_REVIEW_DETAIL_ELABORATION_SNIPPET = "concrete and executable";
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
const REVIEW_AUTO_FIX_SNIPPET = "Automatically fix safe in-scope review findings";
const REVIEW_POST_FIX_REGRESSION_SNIPPET =
  "rerun strict verification plus the configured complete regression command after review-time changes";
const SHARED_SCHEMA_CACHE_ROOT_SNIPPET = "~/.strict-spec-schemas/";
const SHARED_SCHEMA_FILE_LOOKUP_SNIPPET =
  "When a YAML artifact already declares `schema_file`, resolve that relative path under the shared cache root";

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
      SHARED_SCHEMA_CACHE_ROOT_SNIPPET,
      SHARED_SCHEMA_FILE_LOOKUP_SNIPPET,
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
      SHARED_SCHEMA_CACHE_ROOT_SNIPPET,
      SHARED_SCHEMA_FILE_LOOKUP_SNIPPET,
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
      "Do not call or rely on a `strict-spec-driven review` command",
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
    requiredSnippets: [".strict-spec-driven/"],
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
      "harness-plan",
      "direct code review evidence",
      REVIEW_AUTO_FIX_SNIPPET,
      REVIEW_POST_FIX_REGRESSION_SNIPPET,
      "Do not call or rely on a `strict-spec-driven review` command",
      SHARED_SCHEMA_CACHE_ROOT_SNIPPET,
      SHARED_SCHEMA_FILE_LOOKUP_SNIPPET,
    ],
    forbiddenSnippets: [
      "empty-spec-impact decisions block progress",
      "empty-spec-impact decision has been explicitly confirmed",
      `${COMMAND_PREFIX} review <change-name>`,
      "proposal review",
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
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-sync": `${COMMAND_PREFIX} roadmap-sync`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
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
      "/strict-spec-auto",
    ],
    forbiddenSnippets: ["proposal review"],
  },
  "strict-roadmap-review": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-sync": `${COMMAND_PREFIX} roadmap-sync`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
      ROADMAP_REVIEW_INCOMPLETE_SCOPE_SNIPPET,
      ROADMAP_REVIEW_DIRECT_FIX_SNIPPET,
      ROADMAP_REVIEW_DETAIL_ELABORATION_SNIPPET,
    ],
  },
  "strict-roadmap-sync": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-sync": `${COMMAND_PREFIX} roadmap-sync`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/roadmap/"],
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
