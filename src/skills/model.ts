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
  `${COMMAND_PREFIX} generate <change-name> <proposal|design|questions|delta-spec> --<named-args>`;

export type SkillContentExpectation = {
  requiredCommands: Record<string, string>;
  requiredHeadings: string[];
  requiredSnippets: string[];
  forbiddenSnippets?: string[];
};

const ROADMAP_DETAILS_GUIDANCE_SNIPPET = "`details` field";
const ROADMAP_SPLIT_PLANNED_CHANGE_SNIPPET = "standalone planned-change";
const ROADMAP_ACTIVE_CONFLICT_SNIPPET = "active strict change conflicts";

export const CORE_STRICT_SKILL_EXPECTATIONS: Record<string, SkillContentExpectation> = {
  "strict-spec-init": {
    requiredCommands: {
      init: `${COMMAND_PREFIX} init`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/"],
  },
  "strict-spec-propose": {
    requiredCommands: {
      propose: `${COMMAND_PREFIX} propose <change-name>`,
      generate: GENERATE_NAMED_ARGS_COMMAND,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/", "/strict-spec-auto"],
    forbiddenSnippets: [
      "Scaffolds proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and strict YAML delta specs under .strict-spec-driven/changes/<name>/.",
    ],
  },
  "strict-spec-apply": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      apply: `${COMMAND_PREFIX} apply <change-name>`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/"],
  },
  "strict-spec-verify": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/"],
  },
  "strict-spec-review": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
      review: `${COMMAND_PREFIX} review <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/"],
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
      review: `${COMMAND_PREFIX} review <change-name>`,
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
      archive: `${COMMAND_PREFIX} archive <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/", "/strict-spec-ship <change-name>"],
    forbiddenSnippets: [
      "empty-spec-impact decisions block progress",
      "empty-spec-impact decision has been explicitly confirmed",
    ],
  },
  "strict-spec-modify": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/"],
  },
  "strict-spec-cancel": {
    requiredCommands: {
      modify: `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      cancel: `${COMMAND_PREFIX} cancel <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/"],
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
      init: `${COMMAND_PREFIX} init`,
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-sync": `${COMMAND_PREFIX} roadmap-sync`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/roadmap/"],
  },
  "strict-roadmap-milestone": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "roadmap-sync": `${COMMAND_PREFIX} roadmap-sync`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/roadmap/"],
  },
  "strict-roadmap-recommend": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      propose: `${COMMAND_PREFIX} propose <change-name>`,
      generate: GENERATE_NAMED_ARGS_COMMAND,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
      ROADMAP_DETAILS_GUIDANCE_SNIPPET,
      ROADMAP_SPLIT_PLANNED_CHANGE_SNIPPET,
      ROADMAP_ACTIVE_CONFLICT_SNIPPET,
      "/strict-spec-auto",
    ],
  },
  "strict-roadmap-propose": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      propose: `${COMMAND_PREFIX} propose <change-name>`,
      generate: GENERATE_NAMED_ARGS_COMMAND,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [
      ".strict-spec-driven/roadmap/",
      ROADMAP_DETAILS_GUIDANCE_SNIPPET,
      ROADMAP_SPLIT_PLANNED_CHANGE_SNIPPET,
      ROADMAP_ACTIVE_CONFLICT_SNIPPET,
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
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/", "proposal.yaml", "questions.yaml"],
  },
  "strict-spec-simple-task": {
    requiredCommands: {
      "list-changes": `${COMMAND_PREFIX} list`,
      "inspect-change": `${COMMAND_PREFIX} modify [change-name|archive-dir]`,
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/", ".strict-spec-driven/changes/"],
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
