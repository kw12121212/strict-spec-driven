import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import { parseYamlDocument } from "../yaml.js";
import { listFilesRecursive, normalizeRepoRelativePath } from "./fs.js";

const STRICT_TECH_DIR = path.join(".strict-spec-driven", "tech");
const EXCLUDED_TECH_BASENAMES = new Set(["INDEX.yaml"]);

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

function listTechFiles(techDir: string): string[] {
  return listFilesRecursive(techDir).filter((filePath) => {
    const basename = path.basename(filePath);
    return basename.endsWith(".yaml") && !EXCLUDED_TECH_BASENAMES.has(basename);
  });
}

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
