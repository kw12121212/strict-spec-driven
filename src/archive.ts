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
import {
  formatUnresolvableDeltaTargetMessage,
  verifyChange,
  type VerifyDiagnostic,
  type VerifyResult,
} from "./verify.js";
import { mergeDeltaScenes, type SceneMergeReport } from "./scenes.js";
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
  spec?: {
    title: string;
    path: string;
  };
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

type TechRuleValue = {
  strength: string;
  statement: string;
  rationale: string;
  enforcement: Record<string, unknown>;
  [key: string]: unknown;
};

type MainTechArtifact = {
  schema: string;
  schema_version: number;
  artifact_type: string;
  schema_file: string;
  standard: {
    id: string;
    title: string;
    category: string;
  };
  rules: Record<string, TechRuleValue>;
  [key: string]: unknown;
};

type DeltaTechArtifact = {
  target_standard: string;
  standard?: {
    title: string;
    category: string;
  };
  operations?: {
    ADDED?: Record<string, TechRuleValue>;
    MODIFIED?: Record<string, TechRuleValue>;
    REMOVED?: Record<string, { reason: string }>;
  };
};

type TechIndexArtifact = {
  schema: string;
  schema_version: number;
  artifact_type: string;
  schema_file: string;
  standards: Array<{ id: string; title: string; category: string; path: string }>;
  [key: string]: unknown;
};

export type ArchiveMergedSpecResult = {
  targetSpec: string;
  specPath: string;
  created: boolean;
  added: number;
  modified: number;
  removed: number;
  modifiedMissingTargetAsAdded: string[];
  removedMissingTargetSkipped: string[];
};

export type ArchiveMergedStandardResult = {
  targetStandard: string;
  standardPath: string;
  created: boolean;
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
    specsCreated: number;
    added: number;
    modified: number;
    removed: number;
    modifiedMissingTargetAsAdded: number;
    removedMissingTargetSkipped: number;
  };
  mergedSpecs: ArchiveMergedSpecResult[];
  techMergeSummary: {
    standardsUpdated: number;
    standardsCreated: number;
    added: number;
    modified: number;
    removed: number;
    modifiedMissingTargetAsAdded: number;
    removedMissingTargetSkipped: number;
  };
  mergedStandards: ArchiveMergedStandardResult[];
  sceneMergeSummary: {
    scenesUpdated: number;
    scenesCreated: number;
    added: number;
    modified: number;
    removed: number;
    modifiedMissingTargetAsAdded: number;
    removedMissingTargetSkipped: number;
  };
  mergedScenes: SceneMergeReport[];
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

function formatVerifyDiagnostic(diagnostic: VerifyDiagnostic): string {
  return `${diagnostic.source} ${diagnostic.artifactPath} ${diagnostic.fieldPath}: ${diagnostic.message}`;
}

function formatVerificationFailure(result: VerifyResult): string {
  const diagnosticSummary = result.diagnostics
    .slice(0, 5)
    .map(formatVerifyDiagnostic)
    .join("; ");
  const suffix = diagnosticSummary.length > 0 ? `: ${diagnosticSummary}` : "";
  return `change '${result.changeName}' failed verification (${result.diagnostics.length} diagnostic(s))${suffix}`;
}

function buildNewMainSpec(deltaSpec: DeltaSpecArtifact): MainSpecArtifact {
  if (!deltaSpec.spec) {
    throw new Error(
      `delta spec for new main spec '${deltaSpec.target_spec}' must provide a spec block with title and path`,
    );
  }

  return {
    schema: "strict-spec-driven/main-spec/v1",
    schema_version: 1,
    artifact_type: "main_spec",
    schema_file: "templates/strict-spec-driven/schemas/main-spec.yaml",
    spec: {
      id: deltaSpec.target_spec,
      title: deltaSpec.spec.title,
    },
    requirements: {},
  };
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
    if (reqId in mainSpec.requirements) {
      throw new Error(
        `ADDED requirement '${reqId}' already exists in target main spec '${deltaSpec.target_spec}'`,
      );
    }

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

function collectMainTechPathsById(rootDir: string): Map<string, string> {
  const techRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "tech");
  const byId = new Map<string, string>();

  for (const techPath of listYamlFiles(techRoot)) {
    if (path.basename(techPath) === "INDEX.yaml") {
      continue;
    }

    const parsed = readYamlFile<unknown>(techPath);
    const artifact = asObject(parsed, `main tech '${techPath}'`);
    if (artifact.artifact_type !== "main_tech") {
      continue;
    }

    const standard = asObject(artifact.standard, `main tech '${techPath}' field 'standard'`);
    const standardId = standard.id;
    if (typeof standardId !== "string" || standardId.length === 0) {
      throw new Error(`main tech '${techPath}' is missing standard.id`);
    }

    if (byId.has(standardId)) {
      throw new Error(`duplicate main tech id '${standardId}' in '${techPath}' and '${byId.get(standardId)}'`);
    }
    byId.set(standardId, techPath);
  }

  return byId;
}

function applyTechOperations(
  rules: Record<string, TechRuleValue>,
  deltaTech: DeltaTechArtifact,
  report: ArchiveMergedStandardResult,
): void {
  const operations = deltaTech.operations ?? {};

  for (const [ruleId, value] of Object.entries(operations.ADDED ?? {})) {
    if (ruleId in rules) {
      throw new Error(
        `ADDED rule '${ruleId}' already exists in target standard '${deltaTech.target_standard}'`,
      );
    }

    rules[ruleId] = { ...value };
    report.added += 1;
  }

  for (const [targetRule, replacement] of Object.entries(operations.MODIFIED ?? {})) {
    if (!(targetRule in rules)) {
      rules[targetRule] = { ...replacement };
      report.modifiedMissingTargetAsAdded.push(targetRule);
      continue;
    }

    rules[targetRule] = { ...replacement };
    report.modified += 1;
  }

  for (const targetRule of Object.keys(operations.REMOVED ?? {})) {
    if (!(targetRule in rules)) {
      report.removedMissingTargetSkipped.push(targetRule);
      continue;
    }

    delete rules[targetRule];
    report.removed += 1;
  }
}

function applyDeltaToMainTech(
  mainTech: MainTechArtifact,
  deltaTech: DeltaTechArtifact,
  report: ArchiveMergedStandardResult,
  techPath: string,
): void {
  if (!mainTech.rules || typeof mainTech.rules !== "object" || Array.isArray(mainTech.rules)) {
    throw new Error(`main tech '${techPath}' is missing rules`);
  }

  if (deltaTech.standard) {
    mainTech.standard = {
      ...mainTech.standard,
      title: deltaTech.standard.title,
      category: deltaTech.standard.category,
    };
  }

  applyTechOperations(mainTech.rules, deltaTech, report);
}

function buildNewMainTech(deltaTech: DeltaTechArtifact): MainTechArtifact {
  if (!deltaTech.standard) {
    throw new Error(
      `delta tech for new standard '${deltaTech.target_standard}' must provide a standard block with title and category`,
    );
  }

  return {
    schema: "strict-spec-driven/main-tech/v1",
    schema_version: 1,
    artifact_type: "main_tech",
    schema_file: "templates/strict-spec-driven/schemas/main-tech.yaml",
    standard: {
      id: deltaTech.target_standard,
      title: deltaTech.standard.title,
      category: deltaTech.standard.category,
    },
    rules: {},
  };
}

function regenerateTechIndex(rootDir: string): void {
  const techRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "tech");
  if (!existsSync(techRoot)) {
    return;
  }

  const indexPath = path.join(techRoot, "INDEX.yaml");

  const standards = listYamlFiles(techRoot)
    .filter((filePath) => path.basename(filePath) !== "INDEX.yaml")
    .map((filePath) => {
      const parsed = readYamlFile<unknown>(filePath);
      const artifact = asObject(parsed, `tech '${filePath}'`);
      if (artifact.artifact_type !== "main_tech") {
        return null;
      }

      const standard = asObject(artifact.standard, `tech '${filePath}' field 'standard'`);
      const standardId = standard.id;
      const title = standard.title;
      const category = standard.category;
      if (typeof standardId !== "string" || standardId.length === 0) {
        throw new Error(`main tech '${filePath}' is missing standard.id`);
      }
      if (typeof title !== "string" || title.length === 0) {
        throw new Error(`main tech '${filePath}' is missing standard.title`);
      }
      if (typeof category !== "string" || category.length === 0) {
        throw new Error(`main tech '${filePath}' is missing standard.category`);
      }

      return {
        id: standardId,
        title,
        category,
        path: normalizeRepoRelativePath(rootDir, filePath),
      };
    })
    .filter((value): value is { id: string; title: string; category: string; path: string } => value !== null)
    .sort((left, right) => {
      const byPath = left.path.localeCompare(right.path);
      if (byPath !== 0) {
        return byPath;
      }
      return left.id.localeCompare(right.id);
    });

  let indexArtifact: TechIndexArtifact = {
    schema: "strict-spec-driven/tech-index/v1",
    schema_version: 1,
    artifact_type: "tech_index",
    schema_file: "templates/strict-spec-driven/schemas/tech-index.yaml",
    standards: [],
  };

  if (existsSync(indexPath)) {
    const parsed = readYamlFile<unknown>(indexPath);
    const artifact = asObject(parsed, `tech index '${indexPath}'`) as TechIndexArtifact;
    indexArtifact = {
      ...artifact,
      standards: [],
    };
  } else {
    mkdirSync(path.dirname(indexPath), { recursive: true });
  }

  indexArtifact.standards = standards;
  writeYamlFile(indexPath, indexArtifact);
}

function mergeDeltaTechStandards(
  rootDir: string,
  changeDir: string,
): ArchiveMergedStandardResult[] {
  const deltaTechDir = path.join(changeDir, "tech");
  const deltaTechPaths = listYamlFiles(deltaTechDir);
  if (deltaTechPaths.length === 0) {
    return [];
  }

  const techRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "tech");
  const mainTechPathsById = collectMainTechPathsById(rootDir);
  const newStandardPaths = new Map<string, string>();
  // Cache keyed by absolute tech file path.
  const mainTechCache = new Map<string, MainTechArtifact>();
  const mergeReports = new Map<string, ArchiveMergedStandardResult>();

  for (const deltaTechPath of deltaTechPaths) {
    const deltaTech = readYamlFile<DeltaTechArtifact>(deltaTechPath);
    if (typeof deltaTech.target_standard !== "string" || deltaTech.target_standard.length === 0) {
      throw new Error(`delta tech '${deltaTechPath}' is missing target_standard`);
    }

    let report = mergeReports.get(deltaTech.target_standard);
    if (!report) {
      report = {
        targetStandard: deltaTech.target_standard,
        standardPath: "",
        created: false,
        added: 0,
        modified: 0,
        removed: 0,
        modifiedMissingTargetAsAdded: [],
        removedMissingTargetSkipped: [],
      };
      mergeReports.set(deltaTech.target_standard, report);
    }

    const existingTechPath = mainTechPathsById.get(deltaTech.target_standard);
    let cacheKey: string;

    if (existingTechPath) {
      cacheKey = existingTechPath;
      if (!mainTechCache.has(cacheKey)) {
        const loaded = readYamlFile<MainTechArtifact>(existingTechPath);
        if (loaded.artifact_type !== "main_tech") {
          throw new Error(`target standard '${existingTechPath}' is not a main_tech artifact`);
        }
        mainTechCache.set(cacheKey, loaded);
      }
      report.standardPath = normalizeRepoRelativePath(rootDir, existingTechPath);
    } else if (newStandardPaths.has(deltaTech.target_standard)) {
      cacheKey = newStandardPaths.get(deltaTech.target_standard)!;
    } else {
      cacheKey = path.join(techRoot, `${deltaTech.target_standard}.yaml`);
      mainTechCache.set(cacheKey, buildNewMainTech(deltaTech));
      newStandardPaths.set(deltaTech.target_standard, cacheKey);
      report.created = true;
      report.standardPath = normalizeRepoRelativePath(rootDir, cacheKey);
    }

    const mainTech = mainTechCache.get(cacheKey)!;
    applyDeltaToMainTech(mainTech, deltaTech, report, cacheKey);
  }

  if (mainTechCache.size > 0) {
    mkdirSync(techRoot, { recursive: true });
    for (const [techPath, mainTechArtifact] of mainTechCache) {
      writeYamlFile(techPath, mainTechArtifact);
    }
    regenerateTechIndex(rootDir);
  }

  return Array.from(mergeReports.values()).sort((left, right) => {
    const byPath = left.standardPath.localeCompare(right.standardPath);
    if (byPath !== 0) {
      return byPath;
    }
    return left.targetStandard.localeCompare(right.targetStandard);
  });
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
    throw new Error(formatVerificationFailure(verifyResult));
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
  const newSpecPaths = new Map<string, string>();
  const mergeReports = new Map<string, ArchiveMergedSpecResult>();

  for (const deltaSpecPath of deltaSpecPaths) {
    const deltaSpec = readYamlFile<DeltaSpecArtifact>(deltaSpecPath);
    if (typeof deltaSpec.target_spec !== "string" || deltaSpec.target_spec.length === 0) {
      throw new Error(`delta spec '${deltaSpecPath}' is missing target_spec`);
    }

    const existingSpecPath = mainSpecPathsById.get(deltaSpec.target_spec);
    let cacheKey: string;
    let created = false;

    if (existingSpecPath) {
      cacheKey = existingSpecPath;
      if (!mainSpecCache.has(cacheKey)) {
        const loaded = readYamlFile<MainSpecArtifact>(existingSpecPath);
        if (loaded.artifact_type !== "main_spec") {
          throw new Error(`target spec '${existingSpecPath}' is not a main_spec artifact`);
        }
        mainSpecCache.set(cacheKey, loaded);
      }
    } else if (newSpecPaths.has(deltaSpec.target_spec)) {
      cacheKey = newSpecPaths.get(deltaSpec.target_spec)!;
      created = true;
    } else if (deltaSpec.spec) {
      cacheKey = path.join(rootDir, deltaSpec.spec.path);
      mainSpecCache.set(cacheKey, buildNewMainSpec(deltaSpec));
      newSpecPaths.set(deltaSpec.target_spec, cacheKey);
      created = true;
    } else {
      throw new Error(
        formatUnresolvableDeltaTargetMessage(
          changeName,
          normalizeRepoRelativePath(rootDir, deltaSpecPath),
          deltaSpec.target_spec,
        ),
      );
    }

    let report = mergeReports.get(deltaSpec.target_spec);
    if (!report) {
      report = {
        targetSpec: deltaSpec.target_spec,
        specPath: normalizeRepoRelativePath(rootDir, cacheKey),
        created,
        added: 0,
        modified: 0,
        removed: 0,
        modifiedMissingTargetAsAdded: [],
        removedMissingTargetSkipped: [],
      };
      mergeReports.set(deltaSpec.target_spec, report);
    }

    const mainSpec = mainSpecCache.get(cacheKey)!;
    applyDeltaToMainSpec(mainSpec, deltaSpec, report, cacheKey);
  }

  for (const [mainSpecPath, mainSpecArtifact] of mainSpecCache) {
    mkdirSync(path.dirname(mainSpecPath), { recursive: true });
    writeYamlFile(mainSpecPath, mainSpecArtifact);
  }

  regenerateSpecIndex(rootDir);

  const mergedStandards = mergeDeltaTechStandards(rootDir, changeDir);
  // Scenes merge after the specs they cover, so a coverage reference this change also introduces
  // resolves against the main specs already on disk rather than against their pre-merge state.
  const mergedScenes = mergeDeltaScenes(rootDir, changeDir);

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
      if (report.created) {
        summary.specsCreated += 1;
      } else {
        summary.specsUpdated += 1;
      }
      summary.added += report.added;
      summary.modified += report.modified;
      summary.removed += report.removed;
      summary.modifiedMissingTargetAsAdded += report.modifiedMissingTargetAsAdded.length;
      summary.removedMissingTargetSkipped += report.removedMissingTargetSkipped.length;
      return summary;
    },
    {
      specsUpdated: 0,
      specsCreated: 0,
      added: 0,
      modified: 0,
      removed: 0,
      modifiedMissingTargetAsAdded: 0,
      removedMissingTargetSkipped: 0,
    },
  );

  const techMergeSummary = mergedStandards.reduce(
    (summary, report) => {
      if (report.created) {
        summary.standardsCreated += 1;
      } else {
        summary.standardsUpdated += 1;
      }
      summary.added += report.added;
      summary.modified += report.modified;
      summary.removed += report.removed;
      summary.modifiedMissingTargetAsAdded += report.modifiedMissingTargetAsAdded.length;
      summary.removedMissingTargetSkipped += report.removedMissingTargetSkipped.length;
      return summary;
    },
    {
      standardsUpdated: 0,
      standardsCreated: 0,
      added: 0,
      modified: 0,
      removed: 0,
      modifiedMissingTargetAsAdded: 0,
      removedMissingTargetSkipped: 0,
    },
  );

  const sceneMergeSummary = mergedScenes.reduce(
    (summary, report) => {
      if (report.created) {
        summary.scenesCreated += 1;
      } else {
        summary.scenesUpdated += 1;
      }
      summary.added += report.added;
      summary.modified += report.modified;
      summary.removed += report.removed;
      summary.modifiedMissingTargetAsAdded += report.modifiedMissingTargetAsAdded.length;
      summary.removedMissingTargetSkipped += report.removedMissingTargetSkipped.length;
      return summary;
    },
    {
      scenesUpdated: 0,
      scenesCreated: 0,
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
    techMergeSummary,
    mergedStandards,
    sceneMergeSummary,
    mergedScenes,
    roadmapSync,
  };
}
