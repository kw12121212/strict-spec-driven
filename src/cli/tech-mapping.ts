import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import { parseYamlDocument } from "../yaml.js";
import { listFilesRecursive, normalizeRepoRelativePath } from "./fs.js";

const STRICT_TECH_DIR = path.join(".strict-spec-driven", "tech");
const EXCLUDED_TECH_BASENAMES = new Set(["INDEX.yaml"]);

type MappingField = "implementation" | "enforcement";

export type TechMappingDiagnostic = {
  source: "mapping_input" | "mapping_coverage" | "enforcement_declaration";
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
};

// Rule enforcement methods that imply an automated mechanism rather than a human
// process; declaring one obliges the standard to map at least one enforcing file.
const MECHANICAL_ENFORCEMENT_METHODS = new Set(["lint", "ci", "test"]);

export type VerifyTechMappingsResult = {
  valid: boolean;
  diagnostics: TechMappingDiagnostic[];
  summary: {
    standardCount: number;
    mappedImplementationCount: number;
    mappedEnforcementCount: number;
  };
};

function makeDiagnostic(
  source: TechMappingDiagnostic["source"],
  artifactPath: string,
  fieldPath: string,
  message: string,
  expected?: string,
  actual?: string,
): TechMappingDiagnostic {
  return { source, artifactPath, fieldPath, message, expected, actual };
}

function validateMappedPath(
  rootDir: string,
  artifactPath: string,
  field: MappingField,
  index: number,
  rawPath: unknown,
  diagnostics: TechMappingDiagnostic[],
): string | null {
  const fieldPath = `$.mapping.${field}[${index}]`;
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    diagnostics.push(
      makeDiagnostic("mapping_coverage", artifactPath, fieldPath, "mapping entry must be a non-empty string", "non-empty repo-relative path", String(rawPath)),
    );
    return null;
  }

  const normalizedInput = rawPath.trim().replaceAll("\\", "/");
  if (path.isAbsolute(normalizedInput)) {
    diagnostics.push(
      makeDiagnostic("mapping_coverage", artifactPath, fieldPath, "mapping entry must be repo-relative", "repo-relative path", normalizedInput),
    );
    return null;
  }

  const resolved = path.resolve(rootDir, normalizedInput);
  const repoRelative = normalizeRepoRelativePath(rootDir, resolved);
  if (repoRelative === ".." || repoRelative.startsWith("../")) {
    diagnostics.push(
      makeDiagnostic("mapping_coverage", artifactPath, fieldPath, "mapping entry cannot traverse outside repository", "path inside repository", normalizedInput),
    );
    return null;
  }

  if (repoRelative !== normalizedInput) {
    diagnostics.push(
      makeDiagnostic("mapping_coverage", artifactPath, fieldPath, "mapping entry must be normalized repo-relative path", repoRelative, normalizedInput),
    );
    return null;
  }

  if (!existsSync(path.join(rootDir, repoRelative))) {
    diagnostics.push(
      makeDiagnostic("mapping_coverage", artifactPath, fieldPath, "mapping entry points to a file that does not exist", "existing file path", normalizedInput),
    );
    return null;
  }

  return repoRelative;
}

function parseTechMapping(
  rootDir: string,
  techPath: string,
  diagnostics: TechMappingDiagnostic[],
): { implementation: string[]; enforcement: string[] } | null {
  const artifactPath = normalizeRepoRelativePath(rootDir, techPath);
  const content = readFileSync(techPath, "utf8");

  let doc: unknown;
  try {
    doc = parseYamlDocument<unknown>(content, { source: artifactPath });
  } catch (error) {
    diagnostics.push(
      makeDiagnostic("mapping_coverage", artifactPath, "$.mapping", "tech standard file is not valid YAML", "parseable YAML mapping", error instanceof Error ? error.message : String(error)),
    );
    return null;
  }

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    diagnostics.push(
      makeDiagnostic("mapping_coverage", artifactPath, "$.mapping", "tech standard file must contain a YAML mapping", "YAML mapping"),
    );
    return null;
  }

  const mappingValue = (doc as Record<string, unknown>).mapping;
  if (!mappingValue || typeof mappingValue !== "object" || Array.isArray(mappingValue)) {
    diagnostics.push(
      makeDiagnostic("mapping_coverage", artifactPath, "$.mapping", "tech standard must define mapping.implementation and mapping.enforcement arrays", "mapping object"),
    );
    return null;
  }

  const mapping = mappingValue as Record<string, unknown>;
  const normalized: { implementation: string[]; enforcement: string[] } = { implementation: [], enforcement: [] };

  for (const field of ["implementation", "enforcement"] as const) {
    const value = mapping[field];
    const fieldPath = `$.mapping.${field}`;
    if (!Array.isArray(value)) {
      diagnostics.push(
        makeDiagnostic("mapping_coverage", artifactPath, fieldPath, `mapping.${field} must be an array`, "array of repo-relative paths", String(value)),
      );
      continue;
    }
    // Empty arrays are allowed: a manual-only standard may govern no specific file.
    value.forEach((entry, index) => {
      const mappedPath = validateMappedPath(rootDir, artifactPath, field, index, entry, diagnostics);
      if (mappedPath) {
        normalized[field].push(mappedPath);
      }
    });
  }

  return normalized;
}

function checkEnforcementDeclaration(
  rootDir: string,
  techPath: string,
  diagnostics: TechMappingDiagnostic[],
): void {
  const artifactPath = normalizeRepoRelativePath(rootDir, techPath);
  let doc: unknown;
  try {
    doc = parseYamlDocument<unknown>(readFileSync(techPath, "utf8"), { source: artifactPath });
  } catch {
    // A parse failure is already reported by the mapping pass.
    return;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return;
  }

  const record = doc as Record<string, unknown>;
  const mappingValue = record.mapping;
  const enforcementPaths = mappingValue && typeof mappingValue === "object" && !Array.isArray(mappingValue)
    && Array.isArray((mappingValue as Record<string, unknown>).enforcement)
    ? ((mappingValue as Record<string, unknown>).enforcement as unknown[])
    : [];

  const rulesValue = record.rules;
  if (!rulesValue || typeof rulesValue !== "object" || Array.isArray(rulesValue)) {
    return;
  }

  const mechanicalRuleIds: string[] = [];
  for (const [ruleId, ruleValueRaw] of Object.entries(rulesValue as Record<string, unknown>)) {
    const ruleValue = ruleValueRaw && typeof ruleValueRaw === "object" && !Array.isArray(ruleValueRaw)
      ? ruleValueRaw as Record<string, unknown>
      : undefined;
    const enforcement = ruleValue?.enforcement && typeof ruleValue.enforcement === "object" && !Array.isArray(ruleValue.enforcement)
      ? ruleValue.enforcement as Record<string, unknown>
      : undefined;
    const method = typeof enforcement?.method === "string" ? enforcement.method : undefined;
    if (method && MECHANICAL_ENFORCEMENT_METHODS.has(method)) {
      mechanicalRuleIds.push(ruleId);
    }
  }

  if (mechanicalRuleIds.length > 0 && enforcementPaths.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        "enforcement_declaration",
        artifactPath,
        "$.mapping.enforcement",
        `standard declares mechanical enforcement (lint, ci, or test) for rule(s) ${mechanicalRuleIds.sort().join(", ")} but maps no enforcement files`,
        "at least one mapping.enforcement path",
        "empty mapping.enforcement",
      ),
    );
  }
}

function sortDiagnostics(diagnostics: TechMappingDiagnostic[]): TechMappingDiagnostic[] {
  return diagnostics.sort((left, right) => {
    const leftKey = [left.source, left.artifactPath, left.fieldPath, left.message, left.expected ?? "", left.actual ?? ""].join("|");
    const rightKey = [right.source, right.artifactPath, right.fieldPath, right.message, right.expected ?? "", right.actual ?? ""].join("|");
    return leftKey.localeCompare(rightKey);
  });
}

function listTechFiles(techDir: string): string[] {
  return listFilesRecursive(techDir).filter((filePath) => {
    const basename = path.basename(filePath);
    return basename.endsWith(".yaml") && !EXCLUDED_TECH_BASENAMES.has(basename);
  });
}

export function verifyTechMappings(rootDir: string): VerifyTechMappingsResult {
  const diagnostics: TechMappingDiagnostic[] = [];
  const techDir = path.join(rootDir, STRICT_TECH_DIR);

  const mapped = { implementation: new Set<string>(), enforcement: new Set<string>() };

  if (!existsSync(techDir) || !statSync(techDir).isDirectory()) {
    diagnostics.push(
      makeDiagnostic("mapping_input", STRICT_TECH_DIR, "$", "tech mapping inputs are unavailable because .strict-spec-driven/tech/ does not exist", "existing .strict-spec-driven/tech/ directory"),
    );
    return {
      valid: false,
      diagnostics,
      summary: { standardCount: 0, mappedImplementationCount: 0, mappedEnforcementCount: 0 },
    };
  }

  const techFiles = listTechFiles(techDir);
  for (const techFile of techFiles) {
    checkEnforcementDeclaration(rootDir, techFile, diagnostics);
    const mapping = parseTechMapping(rootDir, techFile, diagnostics);
    if (!mapping) continue;
    mapping.implementation.forEach((value) => mapped.implementation.add(value));
    mapping.enforcement.forEach((value) => mapped.enforcement.add(value));
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics: sortDiagnostics(diagnostics),
    summary: {
      standardCount: techFiles.length,
      mappedImplementationCount: mapped.implementation.size,
      mappedEnforcementCount: mapped.enforcement.size,
    },
  };
}

export type TechRuleSummary = {
  id: string;
  strength: string;
  statement: string;
};

export type TechStandardSummary = {
  id: string;
  title: string;
  category: string;
  path: string;
  ruleCount: number;
  strengthCounts: { MUST: number; SHOULD: number; MAY: number };
  rules: TechRuleSummary[];
};

export type TechStatusResult = {
  techDirExists: boolean;
  standardCount: number;
  ruleCount: number;
  strengthCounts: { MUST: number; SHOULD: number; MAY: number };
  standards: TechStandardSummary[];
};

export function getTechStatus(rootDir: string): TechStatusResult {
  const techDir = path.join(rootDir, STRICT_TECH_DIR);
  const empty: TechStatusResult = {
    techDirExists: false,
    standardCount: 0,
    ruleCount: 0,
    strengthCounts: { MUST: 0, SHOULD: 0, MAY: 0 },
    standards: [],
  };

  if (!existsSync(techDir) || !statSync(techDir).isDirectory()) {
    return empty;
  }

  const standards: TechStandardSummary[] = [];
  const totals = { MUST: 0, SHOULD: 0, MAY: 0 };

  for (const techFile of listTechFiles(techDir).sort()) {
    const artifactPath = normalizeRepoRelativePath(rootDir, techFile);
    let doc: Record<string, unknown>;
    try {
      doc = parseYamlDocument<Record<string, unknown>>(readFileSync(techFile, "utf8"), { source: artifactPath });
    } catch {
      continue;
    }
    if (!doc || typeof doc !== "object") continue;

    const standardMeta = (doc.standard ?? {}) as Record<string, unknown>;
    const rulesValue = (doc.rules ?? {}) as Record<string, unknown>;
    const strengthCounts = { MUST: 0, SHOULD: 0, MAY: 0 };
    const rules: TechRuleSummary[] = [];

    if (rulesValue && typeof rulesValue === "object" && !Array.isArray(rulesValue)) {
      for (const [ruleId, ruleValueRaw] of Object.entries(rulesValue)) {
        const ruleValue = (ruleValueRaw ?? {}) as Record<string, unknown>;
        const strength = typeof ruleValue.strength === "string" ? ruleValue.strength : "";
        const statement = typeof ruleValue.statement === "string" ? ruleValue.statement : "";
        if (strength === "MUST" || strength === "SHOULD" || strength === "MAY") {
          strengthCounts[strength] += 1;
          totals[strength] += 1;
        }
        rules.push({ id: ruleId, strength, statement });
      }
    }

    standards.push({
      id: typeof standardMeta.id === "string" ? standardMeta.id : "",
      title: typeof standardMeta.title === "string" ? standardMeta.title : "",
      category: typeof standardMeta.category === "string" ? standardMeta.category : "",
      path: artifactPath,
      ruleCount: rules.length,
      strengthCounts,
      rules,
    });
  }

  return {
    techDirExists: true,
    standardCount: standards.length,
    ruleCount: totals.MUST + totals.SHOULD + totals.MAY,
    strengthCounts: totals,
    standards,
  };
}
