import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getEmbeddedTemplateKeys, readEmbeddedTemplate } from "./embedded-templates.js";
import { parseYamlDocument } from "./yaml.js";
import type { ValidationDiagnostic } from "./validation.js";

const CATEGORY_TEMPLATE_PREFIX = "strict-spec-driven/sop-categories/";

export type SopCategoryQuestion = {
  id: string;
  prompt: string;
  maps_to: string;
  required?: boolean;
};

export type SopCategoryRule = {
  id: string;
  strength: "MUST" | "SHOULD" | "MAY";
  statement: string;
};

export type SopCategoryConstraints = {
  required_sections: string[];
  min_steps?: number;
  required_step_fields?: string[];
  allowed_classifications?: string[];
  rules?: SopCategoryRule[];
};

export type SopCategoryDefinition = {
  schema: string;
  schema_version: number;
  artifact_type: string;
  schema_file: string;
  category: { id: string; title: string; description: string };
  questions: SopCategoryQuestion[];
  constraints: SopCategoryConstraints;
};

export type SopCategorySummary = { id: string; title: string; description: string };

export type ListSopCategoriesResult = {
  valid: boolean;
  categories: SopCategorySummary[];
  diagnostics: ValidationDiagnostic[];
};

export type ShowSopCategoryResult = {
  valid: boolean;
  categoryId: string;
  category: SopCategoryDefinition | null;
  diagnostics: ValidationDiagnostic[];
};

function getBundledCategoryDir(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(thisDir, "templates", "strict-spec-driven", "sop-categories");
  if (existsSync(distPath)) return distPath;
  return path.join(thisDir, "..", "templates", "strict-spec-driven", "sop-categories");
}

function categoryDiagnostic(message: string, fieldPath = "$"): ValidationDiagnostic {
  return { source: "schema", artifactPath: CATEGORY_TEMPLATE_PREFIX, fieldPath, message };
}

/**
 * Lists every bundled SOP category id. Categories are bundled data, so the set is
 * the union of embedded template keys and on-disk category files, keeping
 * discovery stable whether the CLI runs from source or a packaged bundle.
 */
export function listSopCategoryIds(): string[] {
  const ids = new Set<string>();
  for (const key of getEmbeddedTemplateKeys()) {
    if (key.startsWith(CATEGORY_TEMPLATE_PREFIX) && key.endsWith(".yaml")) {
      ids.add(key.slice(CATEGORY_TEMPLATE_PREFIX.length, -".yaml".length));
    }
  }
  const dir = getBundledCategoryDir();
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".yaml")) {
        ids.add(name.slice(0, -".yaml".length));
      }
    }
  }
  return [...ids].sort();
}

/** Loads a single bundled category definition by id, or null when it does not exist. */
export function loadSopCategoryDefinition(categoryId: string): SopCategoryDefinition | null {
  const embedded = readEmbeddedTemplate(`${CATEGORY_TEMPLATE_PREFIX}${categoryId}.yaml`);
  let content = embedded;
  if (content === undefined) {
    const diskPath = path.join(getBundledCategoryDir(), `${categoryId}.yaml`);
    if (!existsSync(diskPath)) {
      return null;
    }
    content = readFileSync(diskPath, "utf8");
  }
  return parseYamlDocument<SopCategoryDefinition>(content);
}

export function listSopCategories(): ListSopCategoriesResult {
  const categories: SopCategorySummary[] = [];
  for (const id of listSopCategoryIds()) {
    const definition = loadSopCategoryDefinition(id);
    if (!definition?.category) {
      continue;
    }
    categories.push({
      id: definition.category.id,
      title: definition.category.title,
      description: definition.category.description,
    });
  }
  categories.sort((left, right) => left.id.localeCompare(right.id));
  return { valid: true, categories, diagnostics: [] };
}

export function showSopCategory(categoryId: string): ShowSopCategoryResult {
  const definition = loadSopCategoryDefinition(categoryId);
  if (!definition) {
    return {
      valid: false,
      categoryId,
      category: null,
      diagnostics: [categoryDiagnostic(`sop category '${categoryId}' not found`, "$.category.id")],
    };
  }
  return { valid: true, categoryId, category: definition, diagnostics: [] };
}

export { CATEGORY_TEMPLATE_PREFIX };
