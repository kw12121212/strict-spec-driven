import { existsSync, readFileSync } from "fs";
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
