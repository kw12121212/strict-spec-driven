import { formatYamlParseSummary, getYamlDiagnosticDetails, getYamlParseDetails, parseYamlDocument } from "../yaml.js";
import {
  COMMAND_PREFIX,
  CORE_STRICT_SKILL_EXPECTATIONS,
  CHECK_WORKFLOW_STATE_COMMAND,
  GENERIC_COMMAND_PLACEHOLDER,
  MIGRATION_STRICT_SKILL_EXPECTATIONS,
  PLANNING_STRICT_SKILL_EXPECTATIONS,
  ROADMAP_STRICT_SKILL_EXPECTATIONS,
  STRICT_WORKFLOW_EXISTENCE_STEP_SNIPPET,
  STRICT_WORKFLOW_INIT_GUIDANCE_SNIPPET,
  STRICT_WORKFLOW_NO_INIT_SNIPPET,
  makeDiagnostic,
  type SkillContentExpectation,
  type SkillPackagingDiagnostic,
} from "./model.js";

function requiresExistingStrictWorkflowState(skillName: string): boolean {
  return (skillName.startsWith("strict-spec-") || skillName.startsWith("strict-roadmap-"))
    && skillName !== "strict-spec-init"
    && skillName !== "strict-spec-migrate";
}

function validateStrictWorkflowStateGuidance(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  if (!requiresExistingStrictWorkflowState(skillName)) return;
  const normalizedContent = content.replace(/\s+/g, " ");

  const checkWorkflowStateCommand = commands["check-workflow-state"];
  if (!checkWorkflowStateCommand) {
    diagnostics.push(
      makeDiagnostic(
        "skill.strict_workflow.check_command.missing",
        `${skillPath}#commands.check-workflow-state`,
        "non-init strict skills must expose the scripted strict workflow state check command",
        CHECK_WORKFLOW_STATE_COMMAND,
      ),
    );
  } else if (!checkWorkflowStateCommand.includes(CHECK_WORKFLOW_STATE_COMMAND)) {
    diagnostics.push(
      makeDiagnostic(
        "skill.strict_workflow.check_command.invalid",
        `${skillPath}#commands.check-workflow-state`,
        "non-init strict skills must run the scripted strict workflow state check command before workflow work",
        CHECK_WORKFLOW_STATE_COMMAND,
        checkWorkflowStateCommand,
      ),
    );
  }

  for (const snippet of [
    STRICT_WORKFLOW_EXISTENCE_STEP_SNIPPET,
    STRICT_WORKFLOW_INIT_GUIDANCE_SNIPPET,
    STRICT_WORKFLOW_NO_INIT_SNIPPET,
  ]) {
    if (normalizedContent.includes(snippet.replace(/\s+/g, " "))) continue;
    diagnostics.push(
      makeDiagnostic(
        "skill.strict_workflow.precheck.missing",
        skillPath,
        "non-init strict skills must check for existing .strict-spec-driven/ state before any other step and stop with init guidance when it is missing",
        snippet,
      ),
    );
  }

  if (commands.init) {
    diagnostics.push(
      makeDiagnostic(
        "skill.strict_workflow.init_command.forbidden",
        `${skillPath}#commands.init`,
        "non-init strict skills must not declare the bundled init command as a fallback",
        "no init command entry",
        commands.init,
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
  const normalizedContent = content.replace(/\s+/g, " ");

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
    if (!normalizedContent.includes(snippet.replace(/\s+/g, " "))) {
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
    if (normalizedContent.includes(snippet.replace(/\s+/g, " "))) {
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

export function validateCommandSection(
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
    commands = parseYamlDocument<unknown>(yamlBlock, { source: skillPath });
  } catch (error) {
    const yamlDetails = getYamlParseDetails(error);
    const yamlDiagnosticDetails = getYamlDiagnosticDetails(error);
    diagnostics.push(
      {
        ...makeDiagnostic(
          "skill.commands_section.parse_error",
          skillPath,
          "command mapping block is not valid YAML",
          "parseable YAML mapping",
          yamlDetails ? formatYamlParseSummary(yamlDetails) : error instanceof Error ? error.message : String(error),
        ),
        ...yamlDiagnosticDetails,
      },
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
  validateStrictWorkflowStateGuidance(skillName, content, normalizedCommands, skillPath, diagnostics);
}
