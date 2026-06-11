import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { getEmbeddedTemplateKeys, readEmbeddedTemplate } from "./embedded-templates.js";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";

const SHARED_SCHEMA_KEY_PREFIX = "strict-spec-driven/schemas/";
const SHARED_SCHEMA_CACHE_DIRNAME = ".strict-spec-schemas";
const SHARED_SCHEMA_MANIFEST_NAME = "manifest.yaml";

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

export type SharedSchemaCacheSyncOptions = {
  homeDir?: string;
};

type BundledSchemaAsset = {
  relativeCachePath: string;
  content: string;
};

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

function getBundledSchemaAssets(): BundledSchemaAsset[] {
  return getEmbeddedTemplateKeys()
    .filter((key) => key.startsWith(SHARED_SCHEMA_KEY_PREFIX))
    .map((key) => {
      const content = readEmbeddedTemplate(key);
      if (content === undefined) {
        throw new Error(`embedded schema asset '${key}' is not available`);
      }
      return {
        relativeCachePath: toPosix(path.join("templates", key)),
        content,
      };
    })
    .sort((left, right) => left.relativeCachePath.localeCompare(right.relativeCachePath));
}

function computeExportVersion(assets: BundledSchemaAsset[]): string {
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

function cacheNeedsRefresh(
  rootDir: string,
  manifestPath: string,
  exportVersion: string,
  assets: BundledSchemaAsset[],
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

  return assets.some((asset) => {
    const absolutePath = path.join(rootDir, asset.relativeCachePath);
    return !existsSync(absolutePath) || !statSync(absolutePath).isFile();
  });
}

export function getSharedSchemaCacheRoot(homeDir = os.homedir()): string {
  return path.join(homeDir, SHARED_SCHEMA_CACHE_DIRNAME);
}

export function getSharedSchemaManifestPath(rootDir = getSharedSchemaCacheRoot()): string {
  return path.join(rootDir, SHARED_SCHEMA_MANIFEST_NAME);
}

export function getBundledSharedSchemaCacheVersion(): string {
  return computeExportVersion(getBundledSchemaAssets());
}

export function getBundledSharedSchemaCacheFiles(): string[] {
  return getBundledSchemaAssets().map((asset) => asset.relativeCachePath);
}

export function synchronizeSharedSchemaCache(options: SharedSchemaCacheSyncOptions = {}): SharedSchemaCacheSyncResult {
  const rootDir = getSharedSchemaCacheRoot(options.homeDir);
  const manifestPath = getSharedSchemaManifestPath(rootDir);
  const assets = getBundledSchemaAssets();
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
  rmSync(path.join(rootDir, "templates", "strict-spec-driven", "schemas"), { recursive: true, force: true });

  for (const asset of assets) {
    const absolutePath = path.join(rootDir, asset.relativeCachePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, asset.content, "utf8");
  }

  writeFileSync(
    manifestPath,
    stringifyYamlDocument({
      export_version: exportVersion,
      exported_files: exportedFiles,
      last_sync_time: new Date().toISOString(),
    }),
    "utf8",
  );

  return {
    action: "synced",
    rootDir,
    manifestPath,
    exportVersion,
    exportedFiles,
  };
}

export function formatSharedSchemaCacheWarning(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `shared schema cache at '~/.strict-spec-schemas/' could not be synchronized: ${message}`;
}
