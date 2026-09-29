import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
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
  "architecture.yaml",
  "specs/INDEX.yaml",
  "tech/INDEX.yaml",
  "roadmap/INDEX.yaml",
  "lessons/INDEX.yaml",
] as const;

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const LEGACY_WORKFLOW_DIR = ".spec-driven";
export const MAX_ACTIVE_CHANGE_COUNT = 2;
/** Canonical change-name rule, owned here because this module creates the directory it names. */
export const CHANGE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type StrictInitResult = {
  rootDir: string;
  created: string[];
  skipped: string[];
  warnings: string[];
};

export type StrictChangeScaffoldResult = {
  changeDir: string;
  specsDir: string;
  /** False when the container already existed, so propose can report a no-op rather than a create. */
  created: boolean;
};

export type ChangeContainerReservation = {
  /** Absolute path of the change directory. */
  changeDir: string;
  /** Repo-relative change directory, for output and diagnostics. */
  repoRelativeChangeDir: string;
  /** Absolute path of the change's specs directory. */
  specsDir: string;
  /** True when this reservation created the container rather than finding it. */
  created: boolean;
  /**
   * Absolute paths this reservation created, in creation order. Only these are unwound on failure,
   * so a rejected write into a pre-existing change never deletes anything the caller did not make.
   */
  createdPaths: string[];
};

export type ReserveChangeContainerOptions = {
  /**
   * Rejects a container that already holds files. propose sets this so a populated change is a
   * collision; artifact authoring leaves it unset, because writing into a populated change is the
   * normal incremental edit.
   */
  rejectPopulated?: boolean;
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

/**
 * The single boundary every change-authoring entry point crosses before writing anything. It
 * validates the change name, the active-change limit, and the collision rule, then creates the
 * change container only if it is absent, recording exactly what it created so a failed first write
 * can be unwound. Both propose and artifact authoring call it, so the limit has one answer rather
 * than one per command, and the unwind list belongs to the transition rather than to whichever
 * command happened to start it.
 *
 * An artifact-free container counts as an active change: the limit bounds concurrent work, not
 * concurrent files, so an interrupted first authoring call still occupies a slot.
 */
export function reserveChangeContainer(
  rootDir: string,
  changeName: string,
  options: ReserveChangeContainerOptions = {},
): ChangeContainerReservation {
  if (!CHANGE_NAME_PATTERN.test(changeName)) {
    throw new Error("change name must be kebab-case (lowercase letters, numbers, and hyphens)");
  }

  const strictChangesRootDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes");
  const changeDir = path.join(strictChangesRootDir, changeName);
  const repoRelativeChangeDir = toRepoRelativePath(rootDir, changeDir);
  const specsDir = path.join(changeDir, "specs");

  const containerExists = existsSync(changeDir);
  if (containerExists && !statSync(changeDir).isDirectory()) {
    throw new Error(`change '${changeName}' already exists at ${repoRelativeChangeDir}`);
  }
  if (containerExists && options.rejectPopulated && directoryTreeContainsFiles(changeDir)) {
    throw new Error(`change '${changeName}' already exists at ${repoRelativeChangeDir}`);
  }

  if (!containerExists) {
    const blockingActiveChanges = listActiveChangeNames(rootDir).filter((name) => name !== changeName);
    if (blockingActiveChanges.length >= MAX_ACTIVE_CHANGE_COUNT) {
      const blockingList = blockingActiveChanges.map((name) => `'${name}'`).join(", ");
      throw new Error(
        `cannot create change '${changeName}': active changes ${blockingList} already fill the limit of two active changes; archive or cancel one first`,
      );
    }
  }

  // Record only the directories this call brings into existence. mkdirSync with recursive can
  // create several levels at once, so each absent level is captured separately and the unwind
  // removes exactly them, leaving any pre-existing level alone.
  const createdPaths: string[] = [];
  for (const directoryPath of [strictChangesRootDir, changeDir, specsDir]) {
    if (existsSync(directoryPath)) continue;
    mkdirSync(directoryPath, { recursive: true });
    createdPaths.push(directoryPath);
  }

  return {
    changeDir,
    repoRelativeChangeDir,
    specsDir,
    created: !containerExists,
    createdPaths,
  };
}

/**
 * Removes exactly the paths a reservation created, newest first, so a rejected or failed first
 * authoring call leaves no change behind. A reservation that found an existing container created
 * nothing and therefore removes nothing.
 */
export function unwindChangeContainer(reservation: ChangeContainerReservation): void {
  for (const createdPath of [...reservation.createdPaths].reverse()) {
    rmSync(createdPath, { recursive: true, force: true });
  }
}

/**
 * Creates the change container for propose. It writes no planning artifacts: those exist only once
 * an authoring command has real content for them. Running it again against an artifact-free
 * container succeeds as a no-op, so an interrupted first authoring call can be retried.
 */
export function initializeStrictChangeScaffold(rootDir: string, changeName: string): StrictChangeScaffoldResult {
  const reservation = reserveChangeContainer(rootDir, changeName, { rejectPopulated: true });
  return {
    changeDir: reservation.repoRelativeChangeDir,
    specsDir: `${toRepoRelativePath(rootDir, reservation.specsDir)}/`,
    created: reservation.created,
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
