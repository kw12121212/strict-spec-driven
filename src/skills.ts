import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { parseYamlDocument } from "./yaml.js";

export type SkillPackagingDiagnostic = {
  code: string;
  path: string;
  message: string;
  expected?: string;
  actual?: string;
};

export type SkillPackagingValidationResult = {
  valid: boolean;
  diagnostics: SkillPackagingDiagnostic[];
  summary: {
    skillCount: number;
    marketplaceCount: number;
    diagnosticsCount: number;
  };
};

type SkillFrontmatter = {
  name?: unknown;
  description?: unknown;
  metadata?: {
    skill_id?: unknown;
    author?: unknown;
    type?: unknown;
    version?: unknown;
  };
};

const REQUIRED_METADATA_FIELDS = ["skill_id", "author", "type", "version"] as const;
const EXPECTED_SCRIPT_SYMLINK = "../../dist/scripts";
const EXPECTED_TEMPLATE_SYMLINK = "../../dist/templates";
const COMMAND_PREFIX = "node {{SKILL_DIR}}/scripts/strict-spec-driven.js";
const GENERIC_COMMAND_PLACEHOLDER = `${COMMAND_PREFIX} <command>`;

type SkillContentExpectation = {
  requiredCommands: Record<string, string>;
  requiredHeadings: string[];
  requiredSnippets: string[];
  forbiddenSnippets?: string[];
};

const CORE_STRICT_SKILL_EXPECTATIONS: Record<string, SkillContentExpectation> = {
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
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/"],
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
      apply: `${COMMAND_PREFIX} apply <change-name>`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
      review: `${COMMAND_PREFIX} review <change-name>`,
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
      archive: `${COMMAND_PREFIX} archive <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/"],
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

const ROADMAP_STRICT_SKILL_EXPECTATIONS: Record<string, SkillContentExpectation> = {
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
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/roadmap/"],
  },
  "strict-roadmap-propose": {
    requiredCommands: {
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      propose: `${COMMAND_PREFIX} propose <change-name>`,
      verify: `${COMMAND_PREFIX} verify <change-name>`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".strict-spec-driven/roadmap/"],
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

const PLANNING_STRICT_SKILL_EXPECTATIONS: Record<string, SkillContentExpectation> = {
  "strict-spec-brainstorm": {
    requiredCommands: {
      propose: `${COMMAND_PREFIX} propose <change-name>`,
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

const MIGRATION_STRICT_SKILL_EXPECTATIONS: Record<string, SkillContentExpectation> = {
  "strict-spec-migrate": {
    requiredCommands: {
      migrate: `${COMMAND_PREFIX} migrate [--force|-f]`,
      "roadmap-status": `${COMMAND_PREFIX} roadmap-status`,
      "verify-spec-mappings": `${COMMAND_PREFIX} verify-spec-mappings`,
    },
    requiredHeadings: ["## Steps", "## Rules"],
    requiredSnippets: [".spec-driven/", ".strict-spec-driven/"],
  },
};

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function makeDiagnostic(
  code: string,
  diagPath: string,
  message: string,
  expected?: string,
  actual?: string,
): SkillPackagingDiagnostic {
  return { code, path: toPosix(diagPath), message, expected, actual };
}

function parseFrontmatter(content: string, skillPath: string, diagnostics: SkillPackagingDiagnostic[]): SkillFrontmatter | null {
  const normalized = content.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") {
    diagnostics.push(
      makeDiagnostic(
        "skill.frontmatter.missing",
        skillPath,
        "SKILL.md must start with YAML frontmatter",
      ),
    );
    return null;
  }

  const closeIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closeIndex === -1) {
    diagnostics.push(
      makeDiagnostic(
        "skill.frontmatter.unterminated",
        skillPath,
        "SKILL.md frontmatter must be terminated with a closing --- line",
      ),
    );
    return null;
  }

  const rawFrontmatter = lines.slice(1, closeIndex).join("\n");
  try {
    const parsed = parseYamlDocument<unknown>(rawFrontmatter);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      diagnostics.push(
        makeDiagnostic(
          "skill.frontmatter.invalid_shape",
          skillPath,
          "SKILL.md frontmatter must parse to a YAML mapping",
          "mapping",
          typeof parsed,
        ),
      );
      return null;
    }
    return parsed as SkillFrontmatter;
  } catch (error) {
    diagnostics.push(
      makeDiagnostic(
        "skill.frontmatter.parse_error",
        skillPath,
        "SKILL.md frontmatter is not valid YAML",
        "parseable YAML mapping",
        error instanceof Error ? error.message : String(error),
      ),
    );
    return null;
  }
}

function validateFrontmatterFields(
  frontmatter: SkillFrontmatter,
  skillName: string,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  if (typeof frontmatter.name !== "string" || frontmatter.name.trim().length === 0) {
    diagnostics.push(
      makeDiagnostic(
        "skill.frontmatter.name.missing",
        skillPath,
        "frontmatter.name must be a non-empty string",
      ),
    );
  } else if (frontmatter.name !== skillName) {
    diagnostics.push(
      makeDiagnostic(
        "skill.frontmatter.name.mismatch",
        skillPath,
        "frontmatter.name must match the skill directory name",
        skillName,
        frontmatter.name,
      ),
    );
  }

  if (typeof frontmatter.description !== "string" || frontmatter.description.trim().length === 0) {
    diagnostics.push(
      makeDiagnostic(
        "skill.frontmatter.description.missing",
        skillPath,
        "frontmatter.description must be a non-empty string",
      ),
    );
  }

  if (!frontmatter.metadata || typeof frontmatter.metadata !== "object" || Array.isArray(frontmatter.metadata)) {
    diagnostics.push(
      makeDiagnostic(
        "skill.frontmatter.metadata.missing",
        skillPath,
        "frontmatter.metadata must be a mapping",
      ),
    );
    return;
  }

  for (const field of REQUIRED_METADATA_FIELDS) {
    const value = frontmatter.metadata[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      diagnostics.push(
        makeDiagnostic(
          "skill.frontmatter.metadata.required",
          `${skillPath}#metadata.${field}`,
          `frontmatter.metadata.${field} must be a non-empty string`,
        ),
      );
    }
  }

  if (frontmatter.metadata.type !== "agent_skill") {
    diagnostics.push(
      makeDiagnostic(
        "skill.frontmatter.metadata.type.invalid",
        `${skillPath}#metadata.type`,
        "frontmatter.metadata.type must be 'agent_skill'",
        "agent_skill",
        typeof frontmatter.metadata.type === "string" ? frontmatter.metadata.type : String(frontmatter.metadata.type),
      ),
    );
  }
}

function validateLegacyReferences(
  skillName: string,
  content: string,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  const contentWithoutStrictRoadmapCommands = content.replace(
    /node \{\{SKILL_DIR\}\}\/scripts\/strict-spec-driven\.js\s+roadmap-(?:status|sync|plan|milestone|recommend|propose)\b/g,
    "node {{SKILL_DIR}}/scripts/strict-spec-driven.js <roadmap-command>",
  );
  const checks: Array<{ code: string; regex: RegExp; message: string }> = [
    {
      code: "skill.reference.legacy_spec_prefix",
      regex: /(?<!strict-)spec-driven-/g,
      message: "stale legacy spec skill prefix found; use strict-spec-* names",
    },
    {
      code: "skill.reference.legacy_roadmap_prefix",
      regex: /(?<!strict-)roadmap-(?:plan|milestone|recommend|propose|sync)\b(?![-:])/g,
      message: "stale legacy roadmap skill prefix found; use strict-roadmap-* names",
    },
  ];
  if (skillName !== "strict-spec-migrate") {
    checks.unshift({
      code: "skill.reference.legacy_workflow_dir",
      regex: /\.spec-driven\//g,
      message: "stale legacy workflow directory reference found; use .strict-spec-driven/",
    });
  }

  for (const check of checks) {
    const sourceContent = check.code === "skill.reference.legacy_roadmap_prefix"
      ? contentWithoutStrictRoadmapCommands
      : content;
    const match = check.regex.exec(sourceContent);
    check.regex.lastIndex = 0;
    if (!match) continue;
    diagnostics.push(
      makeDiagnostic(
        check.code,
        skillPath,
        check.message,
      ),
    );
  }
}

function validateSkillContentAgainstExpectation(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
  expectationMap: Record<string, SkillContentExpectation>,
  diagnosticPrefix: "skill.core" | "skill.roadmap" | "skill.planning" | "skill.migration",
  label: string,
): void {
  const expectation = expectationMap[skillName];
  if (!expectation) return;

  if (content.includes(GENERIC_COMMAND_PLACEHOLDER)) {
    diagnostics.push(
      makeDiagnostic(
        `${diagnosticPrefix}.placeholder_command`,
        skillPath,
        `${label} must replace the generic placeholder command mapping with explicit commands`,
        "explicit command mapping",
        GENERIC_COMMAND_PLACEHOLDER,
      ),
    );
  }

  for (const heading of expectation.requiredHeadings) {
    if (!content.includes(heading)) {
      diagnostics.push(
        makeDiagnostic(
          `${diagnosticPrefix}.required_heading.missing`,
          skillPath,
          `${label} is missing required section heading '${heading}'`,
          heading,
        ),
      );
    }
  }

  for (const snippet of expectation.requiredSnippets) {
    if (!content.includes(snippet)) {
      diagnostics.push(
        makeDiagnostic(
          `${diagnosticPrefix}.required_snippet.missing`,
          skillPath,
          `${label} must reference '${snippet}'`,
          snippet,
        ),
      );
    }
  }

  for (const snippet of expectation.forbiddenSnippets ?? []) {
    if (content.includes(snippet)) {
      diagnostics.push(
        makeDiagnostic(
          `${diagnosticPrefix}.forbidden_snippet.present`,
          skillPath,
          `${label} contains misleading prompt text '${snippet}'`,
          "prompt text aligned with implemented CLI behavior",
          snippet,
        ),
      );
    }
  }

  for (const [commandName, expectedValue] of Object.entries(expectation.requiredCommands)) {
    const actualValue = commands[commandName];
    if (!actualValue) {
      diagnostics.push(
        makeDiagnostic(
          `${diagnosticPrefix}.command.missing`,
          `${skillPath}#commands.${commandName}`,
          `${label} is missing required command entry '${commandName}'`,
          expectedValue,
        ),
      );
      continue;
    }

    if (!actualValue.includes(expectedValue)) {
      diagnostics.push(
        makeDiagnostic(
          `${diagnosticPrefix}.command.invalid`,
          `${skillPath}#commands.${commandName}`,
          `${label} command '${commandName}' must reference the expected strict CLI subcommand`,
          expectedValue,
          actualValue,
        ),
      );
    }
  }
}

function validateCoreSkillContent(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  validateSkillContentAgainstExpectation(
    skillName,
    content,
    commands,
    skillPath,
    diagnostics,
    CORE_STRICT_SKILL_EXPECTATIONS,
    "skill.core",
    "core strict skill",
  );
}

function validateRoadmapSkillContent(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  validateSkillContentAgainstExpectation(
    skillName,
    content,
    commands,
    skillPath,
    diagnostics,
    ROADMAP_STRICT_SKILL_EXPECTATIONS,
    "skill.roadmap",
    "strict roadmap skill",
  );
}

function validatePlanningSkillContent(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  validateSkillContentAgainstExpectation(
    skillName,
    content,
    commands,
    skillPath,
    diagnostics,
    PLANNING_STRICT_SKILL_EXPECTATIONS,
    "skill.planning",
    "strict planning skill",
  );
}

function validateMigrationSkillContent(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  validateSkillContentAgainstExpectation(
    skillName,
    content,
    commands,
    skillPath,
    diagnostics,
    MIGRATION_STRICT_SKILL_EXPECTATIONS,
    "skill.migration",
    "strict migration skill",
  );
}

function validateCommandSection(
  skillName: string,
  content: string,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  const sectionMatch = content.match(/## This Skill's Commands[\s\S]*?```yaml\s*([\s\S]*?)```/m);
  if (!sectionMatch) {
    diagnostics.push(
      makeDiagnostic(
        "skill.commands_section.missing",
        skillPath,
        "skills that use the CLI must include a '## This Skill's Commands' section with a yaml command mapping",
      ),
    );
    return;
  }

  const yamlBlock = sectionMatch[1].trim();
  if (!yamlBlock) {
    diagnostics.push(
      makeDiagnostic(
        "skill.commands_section.empty",
        skillPath,
        "command mapping block cannot be empty",
      ),
    );
    return;
  }

  let commands: unknown;
  try {
    commands = parseYamlDocument<unknown>(yamlBlock);
  } catch (error) {
    diagnostics.push(
      makeDiagnostic(
        "skill.commands_section.parse_error",
        skillPath,
        "command mapping block is not valid YAML",
        "parseable YAML mapping",
        error instanceof Error ? error.message : String(error),
      ),
    );
    return;
  }

  if (!commands || typeof commands !== "object" || Array.isArray(commands)) {
    diagnostics.push(
      makeDiagnostic(
        "skill.commands_section.invalid_shape",
        skillPath,
        "command mapping block must be a YAML mapping",
      ),
    );
    return;
  }

  const entries = Object.entries(commands as Record<string, unknown>);
  if (entries.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        "skill.commands_section.no_commands",
        skillPath,
        "command mapping must declare at least one command entry",
      ),
    );
    return;
  }

  const normalizedCommands: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (typeof value !== "string" || value.trim().length === 0) {
      diagnostics.push(
        makeDiagnostic(
          "skill.commands_section.command.invalid",
          `${skillPath}#commands.${name}`,
          "command mapping values must be non-empty strings",
        ),
      );
      continue;
    }
    normalizedCommands[name] = value;
    if (!value.includes(COMMAND_PREFIX)) {
      diagnostics.push(
        makeDiagnostic(
          "skill.commands_section.command.reference",
          `${skillPath}#commands.${name}`,
          "command entries must reference the strict bundled script",
          COMMAND_PREFIX,
          value,
        ),
      );
      continue;
    }

    const commandSuffix = value.slice(value.indexOf(COMMAND_PREFIX) + COMMAND_PREFIX.length).trim();
    if (commandSuffix.length === 0 || commandSuffix === "<command>" || value.includes(GENERIC_COMMAND_PLACEHOLDER)) {
      diagnostics.push(
        makeDiagnostic(
          "skill.commands_section.command.placeholder",
          `${skillPath}#commands.${name}`,
          "command entries must replace the generic strict CLI placeholder with an explicit subcommand and parameters",
          `${COMMAND_PREFIX} <explicit-subcommand>`,
          value,
        ),
      );
    }
  }

  validateCoreSkillContent(skillName, content, normalizedCommands, skillPath, diagnostics);
  validateRoadmapSkillContent(skillName, content, normalizedCommands, skillPath, diagnostics);
  validatePlanningSkillContent(skillName, content, normalizedCommands, skillPath, diagnostics);
  validateMigrationSkillContent(skillName, content, normalizedCommands, skillPath, diagnostics);
}

function validateRequiredSymlink(
  skillDir: string,
  skillName: string,
  entryName: "scripts" | "templates",
  expectedTarget: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  const entryPath = path.join(skillDir, entryName);
  const relativeSkillPath = path.join("skills", skillName, entryName);
  if (!existsSync(entryPath)) {
    diagnostics.push(
      makeDiagnostic(
        `skill.${entryName}_symlink.missing`,
        relativeSkillPath,
        `skill '${skillName}' is missing required ${entryName} symlink`,
      ),
    );
    return;
  }

  const stats = lstatSync(entryPath);
  if (!stats.isSymbolicLink()) {
    diagnostics.push(
      makeDiagnostic(
        `skill.${entryName}_symlink.invalid_type`,
        relativeSkillPath,
        `skill '${skillName}' ${entryName} entry must be a symlink`,
      ),
    );
    return;
  }

  const target = toPosix(readlinkSync(entryPath));
  const normalizedExpected = toPosix(expectedTarget);
  if (target !== normalizedExpected) {
    diagnostics.push(
      makeDiagnostic(
        `skill.${entryName}_symlink.invalid_target`,
        relativeSkillPath,
        `skill '${skillName}' ${entryName} symlink must point to '${normalizedExpected}'`,
        normalizedExpected,
        target,
      ),
    );
    return;
  }

  const resolved = path.resolve(skillDir, target);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    diagnostics.push(
      makeDiagnostic(
        `skill.${entryName}_symlink.broken`,
        relativeSkillPath,
        `skill '${skillName}' ${entryName} symlink target does not resolve to a directory`,
      ),
    );
  }
}

function validateMarketplaceMetadata(
  rootDir: string,
  skillNames: string[],
  diagnostics: SkillPackagingDiagnostic[],
): number {
  const metadataPath = path.join(rootDir, "skills", "marketplace.json");
  const relativeMetadataPath = path.join("skills", "marketplace.json");
  if (!existsSync(metadataPath)) {
    diagnostics.push(
      makeDiagnostic(
        "skills.marketplace.missing",
        relativeMetadataPath,
        "skills marketplace metadata file is missing",
      ),
    );
    return 0;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(metadataPath, "utf8"));
  } catch (error) {
    diagnostics.push(
      makeDiagnostic(
        "skills.marketplace.parse_error",
        relativeMetadataPath,
        "skills marketplace metadata must be valid JSON",
        "valid JSON",
        error instanceof Error ? error.message : String(error),
      ),
    );
    return 0;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    diagnostics.push(
      makeDiagnostic(
        "skills.marketplace.invalid_shape",
        relativeMetadataPath,
        "skills marketplace metadata must be a JSON object",
      ),
    );
    return 0;
  }

  const manifest = parsed as { skills?: Array<{ name?: unknown }> };
  if (!Array.isArray(manifest.skills)) {
    diagnostics.push(
      makeDiagnostic(
        "skills.marketplace.skills.missing",
        relativeMetadataPath,
        "skills marketplace metadata must include a skills array",
      ),
    );
    return 0;
  }

  const marketplaceNames: string[] = [];
  for (let index = 0; index < manifest.skills.length; index += 1) {
    const entry = manifest.skills[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      diagnostics.push(
        makeDiagnostic(
          "skills.marketplace.skills.entry.invalid",
          `${relativeMetadataPath}#skills[${index}]`,
          "skills marketplace entries must be objects",
        ),
      );
      continue;
    }
    if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
      diagnostics.push(
        makeDiagnostic(
          "skills.marketplace.skills.entry.name.missing",
          `${relativeMetadataPath}#skills[${index}].name`,
          "skills marketplace entry names must be non-empty strings",
        ),
      );
      continue;
    }
    marketplaceNames.push(entry.name);
    if (!entry.name.startsWith("strict-spec-") && !entry.name.startsWith("strict-roadmap-")) {
      diagnostics.push(
        makeDiagnostic(
          "skills.marketplace.skills.entry.name.legacy",
          `${relativeMetadataPath}#skills[${index}].name`,
          "skills marketplace entries must use strict skill name prefixes",
          "strict-spec-* or strict-roadmap-*",
          entry.name,
        ),
      );
    }
  }

  const normalizeList = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));
  const expected = normalizeList(skillNames);
  const actual = normalizeList(marketplaceNames);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    diagnostics.push(
      makeDiagnostic(
        "skills.marketplace.skills.mismatch",
        relativeMetadataPath,
        "skills marketplace names must match skill directories exactly",
        JSON.stringify(expected),
        JSON.stringify(actual),
      ),
    );
  }

  return actual.length;
}

function sortDiagnostics(diagnostics: SkillPackagingDiagnostic[]): SkillPackagingDiagnostic[] {
  return diagnostics.sort((left, right) => {
    const leftKey = [left.code, left.path, left.message, left.expected ?? "", left.actual ?? ""].join("|");
    const rightKey = [right.code, right.path, right.message, right.expected ?? "", right.actual ?? ""].join("|");
    return leftKey.localeCompare(rightKey);
  });
}

export function validateStrictSkillPackaging(rootDir: string): SkillPackagingValidationResult {
  const diagnostics: SkillPackagingDiagnostic[] = [];
  const skillsRoot = path.join(rootDir, "skills");
  const relativeSkillsRoot = "skills";
  if (!existsSync(skillsRoot) || !statSync(skillsRoot).isDirectory()) {
    diagnostics.push(
      makeDiagnostic(
        "skills.directory.missing",
        relativeSkillsRoot,
        "skills directory is missing",
      ),
    );
    return {
      valid: false,
      diagnostics,
      summary: {
        skillCount: 0,
        marketplaceCount: 0,
        diagnosticsCount: diagnostics.length,
      },
    };
  }

  const skillNames = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const skillName of skillNames) {
    const skillDir = path.join(skillsRoot, skillName);
    const skillPath = path.join("skills", skillName, "SKILL.md");
    if (!skillName.startsWith("strict-spec-") && !skillName.startsWith("strict-roadmap-")) {
      diagnostics.push(
        makeDiagnostic(
          "skill.directory.legacy_name",
          path.join("skills", skillName),
          "skill directory must use strict prefix",
          "strict-spec-* or strict-roadmap-*",
          skillName,
        ),
      );
    }

    const skillFilePath = path.join(skillDir, "SKILL.md");
    if (!existsSync(skillFilePath)) {
      diagnostics.push(
        makeDiagnostic(
          "skill.file.missing",
          skillPath,
          "skill directory must include SKILL.md",
        ),
      );
      continue;
    }

    const content = readFileSync(skillFilePath, "utf8");
    const frontmatter = parseFrontmatter(content, skillPath, diagnostics);
    if (frontmatter) {
      validateFrontmatterFields(frontmatter, skillName, skillPath, diagnostics);
    }
    validateLegacyReferences(skillName, content, skillPath, diagnostics);
    validateCommandSection(skillName, content, skillPath, diagnostics);
    validateRequiredSymlink(skillDir, skillName, "scripts", EXPECTED_SCRIPT_SYMLINK, diagnostics);
    validateRequiredSymlink(skillDir, skillName, "templates", EXPECTED_TEMPLATE_SYMLINK, diagnostics);
  }

  const marketplaceCount = validateMarketplaceMetadata(rootDir, skillNames, diagnostics);
  const sorted = sortDiagnostics(diagnostics);
  return {
    valid: sorted.length === 0,
    diagnostics: sorted,
    summary: {
      skillCount: skillNames.length,
      marketplaceCount,
      diagnosticsCount: sorted.length,
    },
  };
}
