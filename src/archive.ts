import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import path from "path";
import { syncRoadmap, type RoadmapSyncResult } from "./roadmap.js";
import { ROADMAP_DIR } from "./roadmap/model.js";
import { verifyChange } from "./verify.js";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";

type RequirementValue = {
  strength: string;
  statement: string;
  scenarios: Record<string, unknown[]>;
  [key: string]: unknown;
};

type MainSpecArtifact = {
  artifact_type: string;
  spec: {
    id: string;
    title: string;
  };
  requirements: Record<string, RequirementValue>;
  [key: string]: unknown;
};

type DeltaSpecArtifact = {
  target_spec: string;
  operations?: {
    ADDED?: Record<string, RequirementValue>;
    MODIFIED?: Record<string, RequirementValue>;
    REMOVED?: Record<string, { reason: string }>;
  };
};

type SpecIndexArtifact = {
  schema: string;
  schema_version: number;
  artifact_type: string;
  schema_file: string;
  specs: Array<{ id: string; title: string; path: string }>;
  [key: string]: unknown;
};

export type ArchiveMergedSpecResult = {
  targetSpec: string;
  specPath: string;
  added: number;
  modified: number;
  removed: number;
  modifiedMissingTargetAsAdded: string[];
  removedMissingTargetSkipped: string[];
};

export type ArchiveResult = {
  valid: boolean;
  changeName: string;
  archiveDestination: string;
  mergeSummary: {
    specsUpdated: number;
    added: number;
    modified: number;
    removed: number;
    modifiedMissingTargetAsAdded: number;
    removedMissingTargetSkipped: number;
  };
  mergedSpecs: ArchiveMergedSpecResult[];
  roadmapSync: RoadmapSyncResult | null;
};

function normalizeRepoRelativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function formatLocalDate(date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asObject(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} must be a YAML mapping`);
  }
  return value as Record<string, unknown>;
}

function listYamlFiles(directoryPath: string): string[] {
  if (!existsSync(directoryPath)) {
    return [];
  }

  const files: string[] = [];

  function walk(currentPath: string): void {
    const entries = readdirSync(currentPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        files.push(fullPath);
      }
    }
  }

  walk(directoryPath);
  return files;
}

function readYamlFile<T>(filePath: string): T {
  const content = readFileSync(filePath, "utf8");
  return parseYamlDocument<T>(content);
}

function writeYamlFile(filePath: string, value: unknown): void {
  writeFileSync(filePath, stringifyYamlDocument(value), "utf8");
}

function assertUniqueRequirementIds(requirements: Record<string, unknown>, specPath: string): void {
  // Mapping keys are inherently unique — no-op.
  void requirements;
  void specPath;
}

function collectMainSpecPathsById(rootDir: string): Map<string, string> {
  const specsRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "specs");
  const byId = new Map<string, string>();

  for (const specPath of listYamlFiles(specsRoot)) {
    if (path.basename(specPath) === "INDEX.yaml") {
      continue;
    }

    const parsed = readYamlFile<unknown>(specPath);
    const artifact = asObject(parsed, `main spec '${specPath}'`);
    if (artifact.artifact_type !== "main_spec") {
      continue;
    }

    const spec = asObject(artifact.spec, `main spec '${specPath}' field 'spec'`);
    const specId = spec.id;
    if (typeof specId !== "string" || specId.length === 0) {
      throw new Error(`main spec '${specPath}' is missing spec.id`);
    }

    if (byId.has(specId)) {
      throw new Error(`duplicate main spec id '${specId}' in '${specPath}' and '${byId.get(specId)}'`);
    }
    byId.set(specId, specPath);
  }

  return byId;
}

function applyDeltaToMainSpec(
  mainSpec: MainSpecArtifact,
  deltaSpec: DeltaSpecArtifact,
  report: ArchiveMergedSpecResult,
  specPath: string,
): void {
  if (!mainSpec.requirements || typeof mainSpec.requirements !== "object" || Array.isArray(mainSpec.requirements)) {
    throw new Error(`main spec '${specPath}' is missing requirements`);
  }

  const operations = deltaSpec.operations ?? {};

  for (const [reqId, value] of Object.entries(operations.ADDED ?? {})) {
    mainSpec.requirements[reqId] = { ...value };
    report.added += 1;
  }

  for (const [targetRequirement, replacement] of Object.entries(operations.MODIFIED ?? {})) {
    if (!(targetRequirement in mainSpec.requirements)) {
      mainSpec.requirements[targetRequirement] = { ...replacement };
      report.modifiedMissingTargetAsAdded.push(targetRequirement);
      continue;
    }

    mainSpec.requirements[targetRequirement] = { ...replacement };
    report.modified += 1;
  }

  for (const targetRequirement of Object.keys(operations.REMOVED ?? {})) {
    if (!(targetRequirement in mainSpec.requirements)) {
      report.removedMissingTargetSkipped.push(targetRequirement);
      continue;
    }

    delete mainSpec.requirements[targetRequirement];
    report.removed += 1;
  }

  assertUniqueRequirementIds(mainSpec.requirements, specPath);
}

function buildArchiveDestination(rootDir: string, changeName: string): string {
  const archiveRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes", "archive");
  mkdirSync(archiveRoot, { recursive: true });

  const datePrefix = formatLocalDate();
  const baseName = `${datePrefix}-${changeName}`;
  let candidate = path.join(archiveRoot, baseName);
  let sequence = 2;

  while (existsSync(candidate)) {
    candidate = path.join(archiveRoot, `${baseName}-${sequence}`);
    sequence += 1;
  }

  return candidate;
}

function regenerateSpecIndex(rootDir: string): void {
  const specsRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "specs");
  const indexPath = path.join(specsRoot, "INDEX.yaml");

  const specs = listYamlFiles(specsRoot)
    .filter((filePath) => path.basename(filePath) !== "INDEX.yaml")
    .map((filePath) => {
      const parsed = readYamlFile<unknown>(filePath);
      const artifact = asObject(parsed, `spec '${filePath}'`);
      if (artifact.artifact_type !== "main_spec") {
        return null;
      }

      const spec = asObject(artifact.spec, `spec '${filePath}' field 'spec'`);
      const specId = spec.id;
      const title = spec.title;
      if (typeof specId !== "string" || specId.length === 0) {
        throw new Error(`main spec '${filePath}' is missing spec.id`);
      }
      if (typeof title !== "string" || title.length === 0) {
        throw new Error(`main spec '${filePath}' is missing spec.title`);
      }

      return {
        id: specId,
        title,
        path: normalizeRepoRelativePath(rootDir, filePath),
      };
    })
    .filter((value): value is { id: string; title: string; path: string } => value !== null)
    .sort((left, right) => {
      const byPath = left.path.localeCompare(right.path);
      if (byPath !== 0) {
        return byPath;
      }
      return left.id.localeCompare(right.id);
    });

  let indexArtifact: SpecIndexArtifact = {
    schema: "strict-spec-driven/spec-index/v1",
    schema_version: 1,
    artifact_type: "spec_index",
    schema_file: "templates/strict-spec-driven/schemas/spec-index.yaml",
    specs: [],
  };

  if (existsSync(indexPath)) {
    const parsed = readYamlFile<unknown>(indexPath);
    const artifact = asObject(parsed, `spec index '${indexPath}'`) as SpecIndexArtifact;
    indexArtifact = {
      ...artifact,
      specs: [],
    };
  } else {
    mkdirSync(path.dirname(indexPath), { recursive: true });
  }

  indexArtifact.specs = specs;
  writeYamlFile(indexPath, indexArtifact);
}

function syncRoadmapAfterArchive(rootDir: string): RoadmapSyncResult | null {
  const roadmapDir = path.join(rootDir, ROADMAP_DIR);
  if (!existsSync(roadmapDir)) {
    return null;
  }

  return syncRoadmap(rootDir);
}

export function archiveChange(rootDir: string, changeName: string): ArchiveResult {
  const changeDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes", changeName);
  if (!existsSync(changeDir)) {
    throw new Error(`change '${changeName}' not found`);
  }

  const verifyResult = verifyChange(rootDir, changeName);
  if (!verifyResult.valid) {
    throw new Error(`change '${changeName}' failed verification (${verifyResult.diagnostics.length} diagnostic(s))`);
  }

  const requiredArtifacts = ["proposal.yaml", "design.yaml", "tasks.yaml", "questions.yaml"];
  for (const artifactName of requiredArtifacts) {
    const artifactPath = path.join(changeDir, artifactName);
    if (!existsSync(artifactPath)) {
      throw new Error(`required artifact '${artifactName}' is missing`);
    }
    readYamlFile<unknown>(artifactPath);
  }

  const mainSpecPathsById = collectMainSpecPathsById(rootDir);
  const deltaSpecsDir = path.join(changeDir, "specs");
  const deltaSpecPaths = listYamlFiles(deltaSpecsDir);

  const mainSpecCache = new Map<string, MainSpecArtifact>();
  const mergeReports = new Map<string, ArchiveMergedSpecResult>();

  for (const deltaSpecPath of deltaSpecPaths) {
    const deltaSpec = readYamlFile<DeltaSpecArtifact>(deltaSpecPath);
    if (typeof deltaSpec.target_spec !== "string" || deltaSpec.target_spec.length === 0) {
      throw new Error(`delta spec '${deltaSpecPath}' is missing target_spec`);
    }

    const targetSpecPath = mainSpecPathsById.get(deltaSpec.target_spec);
    if (!targetSpecPath) {
      throw new Error(
        `delta spec '${deltaSpecPath}' targets missing main spec '${deltaSpec.target_spec}'`,
      );
    }

    let mainSpec = mainSpecCache.get(targetSpecPath);
    if (!mainSpec) {
      mainSpec = readYamlFile<MainSpecArtifact>(targetSpecPath);
      if (mainSpec.artifact_type !== "main_spec") {
        throw new Error(`target spec '${targetSpecPath}' is not a main_spec artifact`);
      }
      mainSpecCache.set(targetSpecPath, mainSpec);
    }

    let report = mergeReports.get(deltaSpec.target_spec);
    if (!report) {
      report = {
        targetSpec: deltaSpec.target_spec,
        specPath: normalizeRepoRelativePath(rootDir, targetSpecPath),
        added: 0,
        modified: 0,
        removed: 0,
        modifiedMissingTargetAsAdded: [],
        removedMissingTargetSkipped: [],
      };
      mergeReports.set(deltaSpec.target_spec, report);
    }

    applyDeltaToMainSpec(mainSpec, deltaSpec, report, targetSpecPath);
  }

  for (const [mainSpecPath, mainSpecArtifact] of mainSpecCache) {
    writeYamlFile(mainSpecPath, mainSpecArtifact);
  }

  regenerateSpecIndex(rootDir);

  const archiveDestination = buildArchiveDestination(rootDir, changeName);
  renameSync(changeDir, archiveDestination);
  const roadmapSync = syncRoadmapAfterArchive(rootDir);

  const mergedSpecs = Array.from(mergeReports.values()).sort((left, right) => {
    const bySpecPath = left.specPath.localeCompare(right.specPath);
    if (bySpecPath !== 0) {
      return bySpecPath;
    }
    return left.targetSpec.localeCompare(right.targetSpec);
  });

  const mergeSummary = mergedSpecs.reduce(
    (summary, report) => {
      summary.specsUpdated += 1;
      summary.added += report.added;
      summary.modified += report.modified;
      summary.removed += report.removed;
      summary.modifiedMissingTargetAsAdded += report.modifiedMissingTargetAsAdded.length;
      summary.removedMissingTargetSkipped += report.removedMissingTargetSkipped.length;
      return summary;
    },
    {
      specsUpdated: 0,
      added: 0,
      modified: 0,
      removed: 0,
      modifiedMissingTargetAsAdded: 0,
      removedMissingTargetSkipped: 0,
    },
  );

  return {
    valid: true,
    changeName,
    archiveDestination: normalizeRepoRelativePath(rootDir, archiveDestination),
    mergeSummary,
    mergedSpecs,
    roadmapSync,
  };
}
