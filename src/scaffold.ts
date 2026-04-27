import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
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
  "specs/INDEX.yaml",
  "roadmap/INDEX.yaml",
  "changes/STATE.yaml",
  "specs/README.md",
] as const;
const REQUIRED_CHANGE_TEMPLATE_ASSETS = [
  "changes/proposal.yaml",
  "changes/design.yaml",
  "changes/tasks.yaml",
  "changes/questions.yaml",
] as const;
const CHANGE_TEMPLATE_NAME_PLACEHOLDER = "{{change_name}}";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const LEGACY_WORKFLOW_DIR = ".spec-driven";

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

export function initializeStrictChangeScaffold(rootDir: string, changeName: string): StrictChangeScaffoldResult {
  const strictChangesRootDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes");
  const changeDir = path.join(strictChangesRootDir, changeName);
  const repoRelativeChangeDir = toRepoRelativePath(rootDir, changeDir);
  if (existsSync(changeDir)) {
    throw new Error(`change '${changeName}' already exists at ${repoRelativeChangeDir}`);
  }

  mkdirSync(changeDir, { recursive: true });
  const planningArtifacts: string[] = [];
  for (const templateAssetPath of getRequiredBundledChangeTemplateAssets()) {
    const outputFileName = path.basename(templateAssetPath);
    const outputPath = path.join(changeDir, outputFileName);
    const templateContent = readBundledScaffoldTemplate(templateAssetPath);
    const outputContent = templateContent.replaceAll(CHANGE_TEMPLATE_NAME_PLACEHOLDER, changeName);
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
