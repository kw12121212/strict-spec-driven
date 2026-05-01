import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { validateCommandSection } from "./skills/content.js";
import { sortDiagnostics } from "./skills/diagnostics.js";
import { validateRequiredSymlink, validateMarketplaceMetadata } from "./skills/fs-checks.js";
import { parseFrontmatter, validateFrontmatterFields, validateLegacyReferences } from "./skills/frontmatter.js";
import {
  EXPECTED_SCRIPT_SYMLINK,
  makeDiagnostic,
  type SkillPackagingDiagnostic,
  type SkillPackagingValidationResult,
} from "./skills/model.js";

export type { SkillPackagingDiagnostic, SkillPackagingValidationResult };

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
