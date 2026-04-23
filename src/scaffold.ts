import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseYamlFile } from "./yaml.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLED_SCAFFOLD_DIR = path.join(PROJECT_ROOT, "templates", "strict-spec-driven", "scaffold");

const REQUIRED_SCAFFOLD_ASSETS = [
  "config.yaml",
  "specs/INDEX.yaml",
  "roadmap/INDEX.yaml",
  "changes/STATE.yaml",
  "specs/README.md",
] as const;

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const LEGACY_WORKFLOW_DIR = ".spec-driven";

export type StrictInitResult = {
  rootDir: string;
  created: string[];
  skipped: string[];
  warnings: string[];
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
  return readFileSync(getBundledScaffoldPath(relativePath), "utf8");
}

export function loadBundledScaffoldYaml<T>(relativePath: string): T {
  return parseYamlFile<T>(getBundledScaffoldPath(relativePath));
}

export function getRequiredBundledScaffoldAssets(): string[] {
  return [...REQUIRED_SCAFFOLD_ASSETS];
}

export function findMissingRequiredScaffoldAssets(): string[] {
  return getRequiredBundledScaffoldAssets().filter((relativePath) => !existsSync(getBundledScaffoldPath(relativePath)));
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
    copyFileSync(getBundledScaffoldPath(assetPath), targetPath);
    created.push(assetPath);
  }

  return {
    rootDir: strictRootDir,
    created,
    skipped,
    warnings,
  };
}
