import { createHash, randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { getEmbeddedTemplateKeys, readEmbeddedTemplate } from "./embedded-templates.js";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";

const SHARED_SCHEMA_KEY_PREFIX = "strict-spec-driven/schemas/";
const SHARED_SAMPLE_KEY_PREFIX = "examples/strict-spec-driven/";
const SHARED_SCHEMA_CACHE_DIRNAME = ".strict-spec-schemas";
const SHARED_SCHEMA_MANIFEST_NAME = "manifest.yaml";
const SHARED_SCHEMA_CACHE_DIR_ENV = "STRICT_SPEC_SCHEMA_CACHE_DIR";

type SharedSchemaCacheManifest = {
  export_version?: unknown;
  exported_files?: unknown;
  last_sync_time?: unknown;
};

export type SharedSchemaCacheSyncResult = {
  action: "synced" | "skipped";
  rootDir: string;
  manifestPath: string;
  exportVersion: string;
  exportedFiles: string[];
};

type BundledSharedCacheAsset = {
  relativeCachePath: string;
  content: string;
};

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

function getBundledSharedCacheAssets(): BundledSharedCacheAsset[] {
  return getEmbeddedTemplateKeys()
    .filter((key) => key.startsWith(SHARED_SCHEMA_KEY_PREFIX) || key.startsWith(SHARED_SAMPLE_KEY_PREFIX))
    .map((key) => {
      const content = readEmbeddedTemplate(key);
      if (content === undefined) {
        throw new Error(`embedded shared cache asset '${key}' is not available`);
      }
      return {
        relativeCachePath: toPosix(key.startsWith(SHARED_SCHEMA_KEY_PREFIX) ? path.join("templates", key) : key),
        content,
      };
    })
    .sort((left, right) => left.relativeCachePath.localeCompare(right.relativeCachePath));
}

function computeExportVersion(assets: BundledSharedCacheAsset[]): string {
  const hash = createHash("sha256");
  for (const asset of assets) {
    hash.update(asset.relativeCachePath);
    hash.update("\0");
    hash.update(asset.content);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function stringListsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function readManifest(manifestPath: string): SharedSchemaCacheManifest | undefined {
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) return undefined;
  try {
    return parseYamlDocument<SharedSchemaCacheManifest>(readFileSync(manifestPath, "utf8"));
  } catch {
    return undefined;
  }
}

function cachedFileMatchesAsset(absolutePath: string, asset: BundledSharedCacheAsset): boolean {
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return false;
  try {
    return readFileSync(absolutePath, "utf8") === asset.content;
  } catch {
    return false;
  }
}

function cacheNeedsRefresh(
  rootDir: string,
  manifestPath: string,
  exportVersion: string,
  assets: BundledSharedCacheAsset[],
): boolean {
  const manifest = readManifest(manifestPath);
  const expectedFiles = assets.map((asset) => asset.relativeCachePath);
  if (
    !manifest
    || manifest.export_version !== exportVersion
    || !isStringArray(manifest.exported_files)
    || !stringListsEqual(manifest.exported_files, expectedFiles)
  ) {
    return true;
  }

  return assets.some((asset) => !cachedFileMatchesAsset(path.join(rootDir, asset.relativeCachePath), asset));
}

function uniqueSiblingPath(basePath: string, label: string): string {
  return `${basePath}.${label}-${process.pid}-${randomBytes(6).toString("hex")}`;
}

export function getSharedSchemaCacheRoot(): string {
  const overrideDir = process.env[SHARED_SCHEMA_CACHE_DIR_ENV];
  if (overrideDir !== undefined && overrideDir.trim() !== "") {
    return path.resolve(overrideDir);
  }
  return path.join(os.homedir(), SHARED_SCHEMA_CACHE_DIRNAME);
}

export function getSharedSchemaManifestPath(rootDir = getSharedSchemaCacheRoot()): string {
  return path.join(rootDir, SHARED_SCHEMA_MANIFEST_NAME);
}

export function getBundledSharedSchemaCacheVersion(): string {
  return computeExportVersion(getBundledSharedCacheAssets());
}

export function getBundledSharedSchemaCacheFiles(): string[] {
  return getBundledSharedCacheAssets().map((asset) => asset.relativeCachePath);
}

function swapInRefreshedAssets(rootDir: string, assets: BundledSharedCacheAsset[]): void {
  const stagingDir = uniqueSiblingPath(path.join(rootDir, "shared-assets"), "staging");
  const retiredDirs: string[] = [];
  try {
    for (const asset of assets) {
      const absolutePath = path.join(stagingDir, asset.relativeCachePath);
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, asset.content, "utf8");
    }

    mkdirSync(rootDir, { recursive: true });
    for (const topLevelDir of ["templates", "examples"]) {
      const targetDir = path.join(rootDir, topLevelDir);
      const stagingTopLevelDir = path.join(stagingDir, topLevelDir);
      const retiredDir = uniqueSiblingPath(targetDir, "retired");
      if (existsSync(targetDir)) {
        renameSync(targetDir, retiredDir);
        retiredDirs.push(retiredDir);
      }
      if (existsSync(stagingTopLevelDir)) {
        renameSync(stagingTopLevelDir, targetDir);
      }
    }
    for (const retiredDir of retiredDirs) {
      rmSync(retiredDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
    for (const retiredDir of retiredDirs) {
      rmSync(retiredDir, { recursive: true, force: true });
    }
  }
}

function writeManifestAtomically(manifestPath: string, exportVersion: string, exportedFiles: string[]): void {
  const manifestTempPath = uniqueSiblingPath(manifestPath, "tmp");
  try {
    writeFileSync(
      manifestTempPath,
      stringifyYamlDocument({
        export_version: exportVersion,
        exported_files: exportedFiles,
        last_sync_time: new Date().toISOString(),
      }),
      "utf8",
    );
    renameSync(manifestTempPath, manifestPath);
  } finally {
    rmSync(manifestTempPath, { force: true });
  }
}

export function synchronizeSharedSchemaCache(): SharedSchemaCacheSyncResult {
  const rootDir = getSharedSchemaCacheRoot();
  const manifestPath = getSharedSchemaManifestPath(rootDir);
  const assets = getBundledSharedCacheAssets();
  const exportVersion = computeExportVersion(assets);
  const exportedFiles = assets.map((asset) => asset.relativeCachePath);

  if (!cacheNeedsRefresh(rootDir, manifestPath, exportVersion, assets)) {
    return {
      action: "skipped",
      rootDir,
      manifestPath,
      exportVersion,
      exportedFiles,
    };
  }

  mkdirSync(rootDir, { recursive: true });
  swapInRefreshedAssets(rootDir, assets);
  writeManifestAtomically(manifestPath, exportVersion, exportedFiles);

  return {
    action: "synced",
    rootDir,
    manifestPath,
    exportVersion,
    exportedFiles,
  };
}

export function formatSharedSchemaCacheWarning(error: unknown, rootDir = getSharedSchemaCacheRoot()): string {
  const message = error instanceof Error ? error.message : String(error);
  return `shared schema cache at '${rootDir}' could not be synchronized: ${message}`;
}
