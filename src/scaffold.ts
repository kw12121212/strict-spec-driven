import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { hasEmbeddedTemplate, readEmbeddedTemplate } from "./embedded-templates.js";
import { parseYamlDocument } from "./yaml.js";

function getBundledDir(...segments: string[]): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(thisDir, "templates", ...segments);
  if (existsSync(distPath)) return distPath;
  return path.join(thisDir, "..", "templates", ...segments);
}

const BUNDLED_SCAFFOLD_DIR = getBundledDir("strict-spec-driven", "scaffold");

function scaffoldTemplateKey(relativePath: string): string {
  return `strict-spec-driven/scaffold/${relativePath}`;
}

const REQUIRED_SCAFFOLD_ASSETS = [
  "config.yaml",
  "harness.yaml",
  "architecture.yaml",
  "specs/INDEX.yaml",
  "tech/INDEX.yaml",
  "roadmap/INDEX.yaml",
  "lessons/INDEX.yaml",
] as const;
const REQUIRED_CHANGE_TEMPLATE_ASSETS = [
  "changes/proposal.yaml",
  "changes/design.yaml",
  "changes/tasks.yaml",
  "changes/questions.yaml",
] as const;
const CHANGE_TEMPLATE_NAME_PLACEHOLDER = "{{change_name}}";
const CHANGE_TEMPLATE_REGRESSION_COMMAND_PLACEHOLDER = "{{project_regression_command}}";
const REGRESSION_COMMAND_FALLBACK =
  "REPLACE WITH the complete project regression command (build plus full test run)";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const LEGACY_WORKFLOW_DIR = ".spec-driven";
export const MAX_ACTIVE_CHANGE_COUNT = 2;

function readConfiguredRegressionCommand(rootDir: string): string | null {
  const configPath = path.join(rootDir, STRICT_WORKFLOW_DIR, "config.yaml");
  if (!existsSync(configPath)) return null;
  try {
    const parsed = parseYamlDocument<{
      review_evidence?: { project_regression?: { command?: unknown } };
    }>(readFileSync(configPath, "utf8"));
    const command = parsed?.review_evidence?.project_regression?.command;
    return typeof command === "string" && command.trim().length > 0 ? command : null;
  } catch {
    return null;
  }
}

export type ScaffoldTaskPlaceholders = {
  /** Task texts that only stand in for real work and must be replaced before a change verifies. */
  texts: string[];
  /** Task commands that only stand in for a real command. */
  commands: string[];
};

let cachedScaffoldTaskPlaceholders: ScaffoldTaskPlaceholders | undefined;

/**
 * Derives the placeholder task content from the bundled change scaffold so verify and the scaffold
 * itself never drift apart. The scaffold's regression task is a real task changes are expected to
 * keep, so only its unfilled command counts as a placeholder — every other scaffold task text does.
 */
export function getScaffoldTaskPlaceholders(): ScaffoldTaskPlaceholders {
  if (cachedScaffoldTaskPlaceholders) return cachedScaffoldTaskPlaceholders;

  const rendered = readBundledScaffoldTemplate("changes/tasks.yaml")
    .replaceAll(CHANGE_TEMPLATE_NAME_PLACEHOLDER, "scaffold")
    .replaceAll(CHANGE_TEMPLATE_REGRESSION_COMMAND_PLACEHOLDER, JSON.stringify(REGRESSION_COMMAND_FALLBACK));
  const parsed = parseYamlDocument<{
    sections?: Record<string, Record<string, { text?: unknown; command?: unknown }> | undefined>;
  }>(rendered);

  const texts: string[] = [];
  for (const sectionTasks of Object.values(parsed?.sections ?? {})) {
    for (const task of Object.values(sectionTasks ?? {})) {
      if (task?.command === REGRESSION_COMMAND_FALLBACK) continue;
      if (typeof task?.text === "string") texts.push(task.text);
    }
  }

  cachedScaffoldTaskPlaceholders = { texts, commands: [REGRESSION_COMMAND_FALLBACK] };
  return cachedScaffoldTaskPlaceholders;
}

/** The bundled proposal scaffold's placeholder content, by field. */
export type ScaffoldProposalPlaceholders = {
  what: string[];
  why: string[];
  scopeIn: string[];
  scopeOut: string[];
  unchangedBehavior: string[];
};

let cachedScaffoldProposalPlaceholders: ScaffoldProposalPlaceholders | undefined;

/**
 * Derives the placeholder proposal content from the bundled change scaffold. The proposal generator
 * merges into the recorded artifact rather than rebuilding it, so seeded placeholder entries now
 * survive every later write and must be reported before archive.
 */
export function getScaffoldProposalPlaceholders(): ScaffoldProposalPlaceholders {
  if (cachedScaffoldProposalPlaceholders) return cachedScaffoldProposalPlaceholders;

  const rendered = readBundledScaffoldTemplate("changes/proposal.yaml")
    .replaceAll(CHANGE_TEMPLATE_NAME_PLACEHOLDER, "scaffold");
  const parsed = parseYamlDocument<{
    summary?: { what?: unknown; why?: unknown };
    scope?: { in?: unknown; out?: unknown };
    unchanged_behavior?: unknown;
  }>(rendered);

  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

  cachedScaffoldProposalPlaceholders = {
    what: strings(parsed?.summary?.what),
    why: strings(parsed?.summary?.why),
    scopeIn: strings(parsed?.scope?.in),
    scopeOut: strings(parsed?.scope?.out),
    unchangedBehavior: strings(parsed?.unchanged_behavior),
  };
  return cachedScaffoldProposalPlaceholders;
}

/** The bundled design scaffold's placeholder content, by field. */
export type ScaffoldDesignPlaceholders = {
  approach: string[];
  decisionIds: string[];
  alternativeOptions: string[];
  risks: string[];
};

let cachedScaffoldDesignPlaceholders: ScaffoldDesignPlaceholders | undefined;

/**
 * Derives the placeholder design content from the bundled change scaffold, so verify and the
 * scaffold never drift apart. These entries used to be cleared as a side effect of rebuilding the
 * artifact; with every write merging instead, unreplaced placeholders would otherwise survive
 * silently into an archived change.
 */
export function getScaffoldDesignPlaceholders(): ScaffoldDesignPlaceholders {
  if (cachedScaffoldDesignPlaceholders) return cachedScaffoldDesignPlaceholders;

  const rendered = readBundledScaffoldTemplate("changes/design.yaml")
    .replaceAll(CHANGE_TEMPLATE_NAME_PLACEHOLDER, "scaffold");
  const parsed = parseYamlDocument<{
    approach?: unknown;
    decisions?: Record<string, unknown>;
    alternatives?: { option?: unknown }[];
    risks?: unknown;
  }>(rendered);

  cachedScaffoldDesignPlaceholders = {
    approach: Array.isArray(parsed?.approach) ? parsed.approach.filter((entry): entry is string => typeof entry === "string") : [],
    decisionIds: Object.keys(parsed?.decisions ?? {}),
    alternativeOptions: (parsed?.alternatives ?? [])
      .map((entry) => entry?.option)
      .filter((option): option is string => typeof option === "string"),
    risks: Array.isArray(parsed?.risks) ? parsed.risks.filter((entry): entry is string => typeof entry === "string") : [],
  };
  return cachedScaffoldDesignPlaceholders;
}

export type StrictInitResult = {
  rootDir: string;
  created: string[];
  skipped: string[];
  warnings: string[];
};

export type StrictChangeScaffoldResult = {
  changeDir: string;
  planningArtifacts: string[];
  specsDir: string;
};

function normalizeRelativeScaffoldPath(relativePath: string): string {
  const normalized = relativePath.split("\\").join("/");
  if (path.isAbsolute(normalized)) {
    throw new Error(`Scaffold asset path must be repo-relative, got '${relativePath}'`);
  }
  const parts = normalized.split("/");
  if (!normalized || parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`Scaffold asset path must be normalized, got '${relativePath}'`);
  }
  return normalized;
}

function toRepoRelativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function directoryTreeContainsFiles(directoryPath: string): boolean {
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (directoryTreeContainsFiles(path.join(directoryPath, entry.name))) {
        return true;
      }
      continue;
    }
    return true;
  }
  return false;
}

export function getBundledScaffoldPath(relativePath: string): string {
  const normalized = normalizeRelativeScaffoldPath(relativePath);
  const resolved = path.resolve(BUNDLED_SCAFFOLD_DIR, normalized);
  const relativeToRoot = path.relative(BUNDLED_SCAFFOLD_DIR, resolved);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Scaffold asset path escapes scaffold root: '${relativePath}'`);
  }
  return resolved;
}

export function readBundledScaffoldTemplate(relativePath: string): string {
  const embedded = readEmbeddedTemplate(scaffoldTemplateKey(relativePath));
  if (embedded !== undefined) return embedded;
  return readFileSync(getBundledScaffoldPath(relativePath), "utf8");
}

export function loadBundledScaffoldYaml<T>(relativePath: string): T {
  return parseYamlDocument<T>(readBundledScaffoldTemplate(relativePath));
}

export function getRequiredBundledScaffoldAssets(): string[] {
  return [...REQUIRED_SCAFFOLD_ASSETS];
}

export function findMissingRequiredScaffoldAssets(): string[] {
  return getRequiredBundledScaffoldAssets().filter(
    (relativePath) =>
      !hasEmbeddedTemplate(scaffoldTemplateKey(relativePath)) && !existsSync(getBundledScaffoldPath(relativePath)),
  );
}

export function getRequiredBundledChangeTemplateAssets(): string[] {
  return [...REQUIRED_CHANGE_TEMPLATE_ASSETS];
}

export function findMissingRequiredChangeTemplateAssets(): string[] {
  return getRequiredBundledChangeTemplateAssets().filter(
    (relativePath) =>
      !hasEmbeddedTemplate(scaffoldTemplateKey(relativePath)) && !existsSync(getBundledScaffoldPath(relativePath)),
  );
}

export function listActiveChangeNames(rootDir: string): string[] {
  const strictChangesRootDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes");
  if (!existsSync(strictChangesRootDir) || !statSync(strictChangesRootDir).isDirectory()) {
    return [];
  }
  return readdirSync(strictChangesRootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "archive")
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export function initializeStrictChangeScaffold(rootDir: string, changeName: string): StrictChangeScaffoldResult {
  const strictChangesRootDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes");
  const changeDir = path.join(strictChangesRootDir, changeName);
  const repoRelativeChangeDir = toRepoRelativePath(rootDir, changeDir);
  const blockingActiveChanges = listActiveChangeNames(rootDir).filter((name) => name !== changeName);
  if (blockingActiveChanges.length >= MAX_ACTIVE_CHANGE_COUNT) {
    const blockingList = blockingActiveChanges.map((name) => `'${name}'`).join(", ");
    throw new Error(
      `cannot create change '${changeName}': active changes ${blockingList} already fill the limit of two active changes; archive or cancel one first`,
    );
  }
  if (existsSync(changeDir)) {
    if (!statSync(changeDir).isDirectory()) {
      throw new Error(`change '${changeName}' already exists at ${repoRelativeChangeDir}`);
    }
    if (directoryTreeContainsFiles(changeDir)) {
      throw new Error(`change '${changeName}' already exists at ${repoRelativeChangeDir}`);
    }
  }

  mkdirSync(changeDir, { recursive: true });
  const planningArtifacts: string[] = [];
  const regressionCommand = readConfiguredRegressionCommand(rootDir) ?? REGRESSION_COMMAND_FALLBACK;
  for (const templateAssetPath of getRequiredBundledChangeTemplateAssets()) {
    const outputFileName = path.basename(templateAssetPath);
    const outputPath = path.join(changeDir, outputFileName);
    const templateContent = readBundledScaffoldTemplate(templateAssetPath);
    const outputContent = templateContent
      .replaceAll(CHANGE_TEMPLATE_NAME_PLACEHOLDER, changeName)
      .replaceAll(CHANGE_TEMPLATE_REGRESSION_COMMAND_PLACEHOLDER, JSON.stringify(regressionCommand));
    writeFileSync(outputPath, outputContent, "utf8");
    planningArtifacts.push(toRepoRelativePath(rootDir, outputPath));
  }

  const specsDir = path.join(changeDir, "specs");
  mkdirSync(specsDir, { recursive: true });

  return {
    changeDir: repoRelativeChangeDir,
    planningArtifacts,
    specsDir: `${toRepoRelativePath(rootDir, specsDir)}/`,
  };
}

export function initializeStrictScaffold(rootDir: string): StrictInitResult {
  const warnings: string[] = [];
  const created: string[] = [];
  const skipped: string[] = [];

  const strictRootDir = path.join(rootDir, STRICT_WORKFLOW_DIR);
  const legacyRootDir = path.join(rootDir, LEGACY_WORKFLOW_DIR);

  if (existsSync(legacyRootDir) && statSync(legacyRootDir).isDirectory()) {
    warnings.push("Warning: detected legacy '.spec-driven/' directory; strict init will continue using '.strict-spec-driven/'.");
  }

  for (const assetPath of getRequiredBundledScaffoldAssets()) {
    const targetPath = path.join(strictRootDir, assetPath);
    if (existsSync(targetPath)) {
      skipped.push(assetPath);
      continue;
    }
    mkdirSync(path.dirname(targetPath), { recursive: true });
    const embedded = readEmbeddedTemplate(scaffoldTemplateKey(assetPath));
    if (embedded !== undefined) {
      writeFileSync(targetPath, embedded, "utf8");
    } else {
      copyFileSync(getBundledScaffoldPath(assetPath), targetPath);
    }
    created.push(assetPath);
  }

  return {
    rootDir: strictRootDir,
    created,
    skipped,
    warnings,
  };
}
