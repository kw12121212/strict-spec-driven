import { formatYamlParseSummary, getYamlDiagnosticDetails, getYamlParseDetails, parseYamlDocument } from "../yaml.js";
import {
  makeDiagnostic,
  REQUIRED_METADATA_FIELDS,
  type SkillFrontmatter,
  type SkillPackagingDiagnostic,
} from "./model.js";

export function parseFrontmatter(
  content: string,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): SkillFrontmatter | null {
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
    const parsed = parseYamlDocument<unknown>(rawFrontmatter, { source: skillPath });
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
    const yamlDetails = getYamlParseDetails(error);
    const yamlDiagnosticDetails = getYamlDiagnosticDetails(error);
    diagnostics.push(
      {
        ...makeDiagnostic(
          "skill.frontmatter.parse_error",
          skillPath,
          "SKILL.md frontmatter is not valid YAML",
          "parseable YAML mapping",
          yamlDetails ? formatYamlParseSummary(yamlDetails) : error instanceof Error ? error.message : String(error),
        ),
        ...yamlDiagnosticDetails,
      },
    );
    return null;
  }
}

export function validateFrontmatterFields(
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

export function validateLegacyReferences(
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
