import { existsSync, lstatSync, readFileSync, readlinkSync, statSync } from "node:fs";
import path from "node:path";
import { toPosix } from "../diagnostics.js";
import {
  hasStrictSkillNamePrefix,
  makeDiagnostic,
  STRICT_SKILL_NAME_PREFIX_EXPECTATION,
  type SkillPackagingDiagnostic,
} from "./model.js";

export function validateRequiredSymlink(
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

export function validateMarketplaceMetadata(
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
    if (!hasStrictSkillNamePrefix(entry.name)) {
      diagnostics.push(
        makeDiagnostic(
          "skills.marketplace.skills.entry.name.legacy",
          `${relativeMetadataPath}#skills[${index}].name`,
          "skills marketplace entries must use strict skill name prefixes",
          STRICT_SKILL_NAME_PREFIX_EXPECTATION,
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
