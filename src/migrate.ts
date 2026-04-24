import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";
import { convertRoadmapIndex, convertRoadmapMilestone, convertSpecsIndex } from "./converters/roadmap.js";
import { initializeStrictScaffold, loadBundledScaffoldYaml } from "./scaffold.js";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";

const LEGACY_WORKFLOW_DIR = ".spec-driven";
const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const LEGACY_CONFIG_PATH = `${LEGACY_WORKFLOW_DIR}/config.yaml`;
const STRICT_CONFIG_PATH = `${STRICT_WORKFLOW_DIR}/config.yaml`;
const MAIN_SPEC_SCHEMA_FILE = "templates/strict-spec-driven/schemas/main-spec.yaml";
const DELTA_SPEC_SCHEMA_FILE = "templates/strict-spec-driven/schemas/delta-spec.yaml";
const CHANGE_PROPOSAL_SCHEMA_FILE = "templates/strict-spec-driven/schemas/change-proposal.yaml";
const CHANGE_DESIGN_SCHEMA_FILE = "templates/strict-spec-driven/schemas/change-design.yaml";
const TASK_LIST_SCHEMA_FILE = "templates/strict-spec-driven/schemas/task-list.yaml";
const QUESTION_LIST_SCHEMA_FILE = "templates/strict-spec-driven/schemas/question-list.yaml";
const SPEC_INDEX_SCHEMA_FILE = "templates/strict-spec-driven/schemas/spec-index.yaml";
const LEGACY_ROADMAP_DIR = `${LEGACY_WORKFLOW_DIR}/roadmap`;
const STRICT_ROADMAP_DIR = `${STRICT_WORKFLOW_DIR}/roadmap`;

type StrictWorkflowConfig = {
  schema: "strict-spec-driven/config/v1";
  schema_version: 1;
  artifact_type: "workflow_config";
  context: string;
  rules: Record<string, unknown>;
};

type LegacyWorkflowConfig = {
  context?: unknown;
  rules?: unknown;
};

type MigrationArtifactKind =
  | "workflow_config"
  | "strict_scaffold_asset"
  | "main_spec"
  | "delta_spec"
  | "change_proposal"
  | "change_design"
  | "task_list"
  | "question_list"
  | "roadmap_index"
  | "roadmap_milestone"
  | "spec_index"
  | "legacy_markdown_artifact"
  | "legacy_project_state";

export type MigrationConvertedArtifact = {
  kind:
    | "workflow_config"
    | "strict_scaffold_asset"
    | "main_spec"
    | "delta_spec"
    | "change_proposal"
    | "change_design"
    | "task_list"
    | "question_list"
    | "roadmap_index"
    | "roadmap_milestone"
    | "spec_index";
  targetPath: string;
  sourcePath?: string;
  note: string;
};

export type MigrationSkippedArtifact = {
  kind: "legacy_markdown_artifact" | "legacy_project_state";
  sourcePath: string;
  reason: string;
};

export type MigrationDiagnostic = {
  code: string;
  message: string;
  sourcePath?: string;
  targetPath?: string;
};

export type MigrationManualFollowUp = {
  sourcePath: string;
  reason: string;
  recommendation: string;
};

export type MigrationResult = {
  valid: boolean;
  targetRoot: string;
  converted: MigrationConvertedArtifact[];
  skipped: MigrationSkippedArtifact[];
  warnings: MigrationDiagnostic[];
  errors: MigrationDiagnostic[];
  manualFollowUp: MigrationManualFollowUp[];
};

type DeferredLegacyArtifact = {
  kind: "legacy_markdown_artifact" | "legacy_project_state";
  reason: string;
  recommendation: string;
};

type RequirementStrength = "MUST" | "SHOULD" | "MAY";

type ScenarioStepKind = "GIVEN" | "WHEN" | "THEN" | "AND";

type StrictSpecMapping = {
  implementation: string[];
  tests: string[];
};

type StrictScenarioStep = {
  kind: ScenarioStepKind;
  text: string;
};

type StrictScenario = {
  id: string;
  steps: StrictScenarioStep[];
};

type StrictRequirement = {
  id: string;
  strength: RequirementStrength;
  statement: string;
  scenarios: StrictScenario[];
};

type StrictMainSpecArtifact = {
  schema: "strict-spec-driven/main-spec/v1";
  schema_version: 1;
  artifact_type: "main_spec";
  schema_file: string;
  spec: {
    id: string;
    title: string;
  };
  mapping: StrictSpecMapping;
  requirements: StrictRequirement[];
};

type StrictDeltaSpecArtifact = {
  schema: "strict-spec-driven/delta-spec/v1";
  schema_version: 1;
  artifact_type: "delta_spec";
  schema_file: string;
  target_spec: string;
  mapping: StrictSpecMapping;
  operations: {
    ADDED: Array<{ requirement: StrictRequirement }>;
    MODIFIED: Array<{ target_requirement: string; replacement: StrictRequirement }>;
    REMOVED: Array<{ target_requirement: string; reason: string }>;
  };
};

type StrictChangeProposalArtifact = {
  schema: "strict-spec-driven/change-proposal/v1";
  schema_version: 1;
  artifact_type: "change_proposal";
  schema_file: string;
  change: {
    id: string;
    status: "active" | "complete";
  };
  summary: {
    what: string[];
    why: string[];
  };
  scope: {
    in: string[];
    out: string[];
  };
  unchanged_behavior: string[];
};

type StrictChangeDesignArtifact = {
  schema: "strict-spec-driven/change-design/v1";
  schema_version: 1;
  artifact_type: "change_design";
  schema_file: string;
  change: string;
  approach: string[];
  decisions: Array<{
    id: string;
    decision: string;
    rationale: string;
  }>;
  alternatives: Array<{
    option: string;
    reason: string;
  }>;
  risks?: string[];
};

type StrictTaskListTask = {
  id: string;
  text: string;
  status: "pending" | "complete";
  command?: string;
};

type StrictTaskListArtifact = {
  schema: "strict-spec-driven/task-list/v1";
  schema_version: 1;
  artifact_type: "task_list";
  schema_file: string;
  change: string;
  sections: Array<{
    name: "Implementation" | "Testing" | "Verification";
    tasks: StrictTaskListTask[];
  }>;
  testing_gates: {
    validation_task: string;
    unit_test_task: string;
  };
};

type StrictQuestionListArtifact = {
  schema: "strict-spec-driven/question-list/v1";
  schema_version: 1;
  artifact_type: "question_list";
  schema_file: string;
  change: string;
  open: Array<{
    id: string;
    question: string;
    context: string;
    status: "open";
  }>;
  resolved: Array<{
    id: string;
    question: string;
    context: string;
    answer: string;
    status: "resolved";
  }>;
};

type StrictSpecIndexArtifact = {
  schema: "strict-spec-driven/spec-index/v1";
  schema_version: 1;
  artifact_type: "spec_index";
  schema_file: string;
  specs: Array<{
    id: string;
    title: string;
    path: string;
  }>;
};

type LegacyChangeDirectory = {
  legacyDirectoryPath: string;
  repoRelativeDirectory: string;
  strictDirectoryPath: string;
  directoryName: string;
  archived: boolean;
};

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function toRepoRelativePath(rootDir: string, absolutePath: string): string {
  return toPosix(path.relative(rootDir, absolutePath));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asObject(value: unknown, description: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${description} must be a YAML mapping`);
  }
  return value;
}

function listFilesRecursive(directoryPath: string): string[] {
  if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) {
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
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  walk(directoryPath);
  return files;
}

function makeDiagnostic(
  code: string,
  message: string,
  sourcePath?: string,
  targetPath?: string,
): MigrationDiagnostic {
  return { code, message, sourcePath, targetPath };
}

function readYamlFile<T>(filePath: string): T {
  return parseYamlDocument<T>(readFileSync(filePath, "utf8"));
}

function writeYamlFile(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, stringifyYamlDocument(value), "utf8");
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toKebabCase(value: string): string {
  const collapsed = value
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return collapsed.length > 0 ? collapsed : "item";
}

function makeUniqueId(baseId: string, usedIds: Set<string>): string {
  let candidate = baseId;
  let sequence = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${sequence}`;
    sequence += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function replaceMarkdownExtension(repoRelativePath: string): string {
  return repoRelativePath.replace(/\.md$/i, ".yaml");
}

function normalizeMappingPathList(value: unknown, description: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${description} must be a YAML sequence of strings`);
  }
  return value.map((entry) => normalizeWhitespace(entry));
}

function extractMarkdownFrontmatter(content: string): {
  frontmatter: Record<string, unknown> | null;
  body: string;
} {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: null, body: normalized };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    throw new Error("frontmatter is missing a closing '---' line");
  }

  const frontmatter = parseYamlDocument<unknown>(normalized.slice(4, endIndex));
  if (!isRecord(frontmatter)) {
    throw new Error("frontmatter must decode to a YAML mapping");
  }

  return {
    frontmatter,
    body: normalized.slice(endIndex + "\n---\n".length),
  };
}

function getLegacySpecMapping(frontmatter: Record<string, unknown> | null): StrictSpecMapping {
  if (!frontmatter) {
    return {
      implementation: [],
      tests: [],
    };
  }

  const rawMapping = frontmatter.mapping;
  if (rawMapping === undefined) {
    return {
      implementation: [],
      tests: [],
    };
  }

  const mapping = asObject(rawMapping, "legacy markdown frontmatter field 'mapping'");
  return {
    implementation: normalizeMappingPathList(mapping.implementation, "legacy mapping.implementation"),
    tests: normalizeMappingPathList(mapping.tests, "legacy mapping.tests"),
  };
}

function parseRequirementStrength(statement: string, context: string): RequirementStrength {
  const match = statement.match(/\b(MUST|SHOULD|MAY)\b/);
  if (!match) {
    throw new Error(`${context} is missing an RFC 2119 keyword (MUST/SHOULD/MAY)`);
  }
  return match[1] as RequirementStrength;
}

function extractMarkdownSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      if (currentHeading) {
        sections.set(currentHeading, currentLines.join("\n"));
      }
      currentHeading = headingMatch[1].trim();
      currentLines = [];
      continue;
    }

    if (currentHeading) {
      currentLines.push(line);
    }
  }

  if (currentHeading) {
    sections.set(currentHeading, currentLines.join("\n"));
  }

  return sections;
}

function extractMarkdownHeading(content: string): string | null {
  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    const headingMatch = line.match(/^# (.+)$/);
    if (headingMatch) {
      return normalizeWhitespace(headingMatch[1]);
    }
  }
  return null;
}

function splitFirstSentence(text: string): { first: string; rest: string } {
  const normalized = normalizeWhitespace(text);
  const sentenceBreaks = [". ", " — ", ": "];
  for (const marker of sentenceBreaks) {
    const index = normalized.indexOf(marker);
    if (index !== -1) {
      return {
        first: normalized.slice(0, index + (marker === ". " ? 1 : 0)).trim(),
        rest: normalized.slice(index + marker.length).trim(),
      };
    }
  }
  return {
    first: normalized,
    rest: "",
  };
}

function parseMarkdownItems(
  sectionText: string,
  mode: "list" | "approach" = "list",
): string[] {
  const items: string[] = [];
  let current = "";
  let currentKind: "ordered" | "bullet" | "paragraph" | null = null;

  function flushCurrent(): void {
    const normalized = normalizeWhitespace(current);
    if (normalized.length > 0) {
      items.push(normalized);
    }
    current = "";
    currentKind = null;
  }

  for (const rawLine of sectionText.split("\n")) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith("<!--")) {
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (mode === "approach" && orderedMatch) {
      flushCurrent();
      current = orderedMatch[1];
      currentKind = "ordered";
      continue;
    }

    const bulletMatch = trimmed.match(/^- (.+)$/);
    if (bulletMatch) {
      if (mode === "approach" && currentKind === "ordered") {
        current = `${current} ${bulletMatch[1]}`.trim();
        continue;
      }
      flushCurrent();
      current = bulletMatch[1];
      currentKind = "bullet";
      continue;
    }

    if (!current) {
      current = trimmed;
      currentKind = "paragraph";
      continue;
    }

    current = `${current} ${trimmed}`.trim();
  }

  flushCurrent();
  return items;
}

function parseScopeItems(sectionText: string): { inScope: string[]; outOfScope: string[] } {
  const inScope: string[] = [];
  const outOfScope: string[] = [];
  let currentTarget: "in" | "out" | null = null;
  let currentItem = "";

  function flushCurrent(): void {
    const normalized = normalizeWhitespace(currentItem);
    if (normalized.length === 0 || !currentTarget) {
      currentItem = "";
      return;
    }
    if (currentTarget === "in") {
      inScope.push(normalized);
    } else {
      outOfScope.push(normalized);
    }
    currentItem = "";
  }

  for (const rawLine of sectionText.split("\n")) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith("<!--")) {
      continue;
    }
    if (trimmed === "In scope:") {
      flushCurrent();
      currentTarget = "in";
      continue;
    }
    if (trimmed === "Out of scope:") {
      flushCurrent();
      currentTarget = "out";
      continue;
    }
    if (!currentTarget) {
      continue;
    }
    if (trimmed.startsWith("- ")) {
      flushCurrent();
      currentItem = trimmed.slice(2);
      continue;
    }
    currentItem = `${currentItem} ${trimmed}`.trim();
  }

  flushCurrent();
  return { inScope, outOfScope };
}

function extractBacktickCommand(text: string): string | undefined {
  const match = text.match(/`([^`]+)`/);
  return match ? match[1].trim() : undefined;
}

function buildSpecIdFromRelativePath(relativeSpecPath: string): string {
  return toKebabCase(relativeSpecPath.replace(/\.md$/i, "").replace(/\//g, "-"));
}

function buildStrictMarkdownTargetPath(rootDir: string, repoRelativeTargetPath: string): string {
  return path.join(rootDir, ...repoRelativeTargetPath.split("/"));
}

function listLegacyChangeDirectories(rootDir: string): LegacyChangeDirectory[] {
  const changesRoot = path.join(rootDir, LEGACY_WORKFLOW_DIR, "changes");
  if (!existsSync(changesRoot) || !statSync(changesRoot).isDirectory()) {
    return [];
  }

  const directories: LegacyChangeDirectory[] = [];
  const changeEntries = readdirSync(changesRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of changeEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name === "archive") {
      const archiveRoot = path.join(changesRoot, "archive");
      if (!existsSync(archiveRoot) || !statSync(archiveRoot).isDirectory()) {
        continue;
      }
      const archiveEntries = readdirSync(archiveRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const archiveEntry of archiveEntries) {
        if (!archiveEntry.isDirectory()) {
          continue;
        }
        directories.push({
          legacyDirectoryPath: path.join(archiveRoot, archiveEntry.name),
          repoRelativeDirectory: `${LEGACY_WORKFLOW_DIR}/changes/archive/${archiveEntry.name}`,
          strictDirectoryPath: path.join(rootDir, STRICT_WORKFLOW_DIR, "changes", "archive", archiveEntry.name),
          directoryName: archiveEntry.name,
          archived: true,
        });
      }
      continue;
    }

    directories.push({
      legacyDirectoryPath: path.join(changesRoot, entry.name),
      repoRelativeDirectory: `${LEGACY_WORKFLOW_DIR}/changes/${entry.name}`,
      strictDirectoryPath: path.join(rootDir, STRICT_WORKFLOW_DIR, "changes", entry.name),
      directoryName: entry.name,
      archived: false,
    });
  }

  return directories;
}

function recordDeferredArtifact(
  result: MigrationResult,
  sourcePath: string,
  reason: string,
  recommendation: string,
  kind: MigrationSkippedArtifact["kind"] = "legacy_markdown_artifact",
  code = "converter_unavailable",
): void {
  result.skipped.push({
    kind,
    sourcePath,
    reason,
  });
  result.warnings.push(makeDiagnostic(code, reason, sourcePath));
  result.manualFollowUp.push({
    sourcePath,
    reason,
    recommendation,
  });
}

function makeConversionFailure(sourcePath: string, error: unknown): DeferredLegacyArtifact {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: "legacy_markdown_artifact",
    reason: `Legacy core workflow artifact uses an unsupported or ambiguous Markdown shape: ${message}`,
    recommendation:
      "Review this legacy artifact and either normalize it to the canonical Markdown structure or extend the converter before treating the migration as complete.",
  };
}

function parseLegacyMainSpec(
  sourcePath: string,
  content: string,
): StrictMainSpecArtifact {
  const { frontmatter, body } = extractMarkdownFrontmatter(content);
  const mapping = getLegacySpecMapping(frontmatter);
  const title = extractMarkdownHeading(body);
  if (!title) {
    throw new Error(`main spec '${sourcePath}' is missing a top-level '# <title>' heading`);
  }

  const requirements: StrictRequirement[] = [];
  const requirementIds = new Set<string>();
  let currentRequirementId: string | null = null;
  let currentStatementLines: string[] = [];
  let currentScenarios: StrictScenario[] = [];
  let currentScenarioTitle: string | null = null;
  let currentScenarioSteps: StrictScenarioStep[] = [];
  let currentScenarioIds = new Set<string>();

  function flushScenario(): void {
    if (!currentScenarioTitle) {
      return;
    }
    if (currentScenarioSteps.length === 0) {
      throw new Error(`scenario '${currentScenarioTitle}' in '${sourcePath}' is missing steps`);
    }
    currentScenarios.push({
      id: makeUniqueId(toKebabCase(currentScenarioTitle), currentScenarioIds),
      steps: currentScenarioSteps,
    });
    currentScenarioTitle = null;
    currentScenarioSteps = [];
  }

  function flushRequirement(): void {
    if (!currentRequirementId) {
      return;
    }
    flushScenario();
    const statement = normalizeWhitespace(currentStatementLines.join(" "));
    if (statement.length === 0) {
      throw new Error(`requirement '${currentRequirementId}' in '${sourcePath}' is missing a statement`);
    }
    requirements.push({
      id: makeUniqueId(currentRequirementId, requirementIds),
      strength: parseRequirementStrength(statement, `requirement '${currentRequirementId}' in '${sourcePath}'`),
      statement,
      scenarios: currentScenarios,
    });
    currentRequirementId = null;
    currentStatementLines = [];
    currentScenarios = [];
    currentScenarioIds = new Set<string>();
  }

  for (const rawLine of body.split("\n")) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const requirementMatch = trimmed.match(/^### Requirement:\s+(.+)$/);
    if (requirementMatch) {
      flushRequirement();
      currentRequirementId = normalizeWhitespace(requirementMatch[1]);
      continue;
    }

    const scenarioMatch = trimmed.match(/^#### Scenario:\s+(.+)$/);
    if (scenarioMatch) {
      if (!currentRequirementId) {
        throw new Error(`scenario '${scenarioMatch[1]}' in '${sourcePath}' appears before any requirement`);
      }
      flushScenario();
      currentScenarioTitle = normalizeWhitespace(scenarioMatch[1]);
      continue;
    }

    const stepMatch = trimmed.match(/^- (GIVEN|WHEN|THEN|AND)\s+(.+)$/);
    if (stepMatch) {
      if (!currentScenarioTitle) {
        throw new Error(`step '${trimmed}' in '${sourcePath}' appears outside a scenario`);
      }
      currentScenarioSteps.push({
        kind: stepMatch[1] as ScenarioStepKind,
        text: normalizeWhitespace(stepMatch[2]),
      });
      continue;
    }

    if (trimmed.startsWith("# ")) {
      continue;
    }

    if (currentScenarioTitle && currentScenarioSteps.length > 0) {
      const lastStep = currentScenarioSteps[currentScenarioSteps.length - 1];
      lastStep.text = normalizeWhitespace(`${lastStep.text} ${trimmed}`);
      continue;
    }

    if (!currentRequirementId) {
      continue;
    }

    currentStatementLines.push(trimmed);
  }

  flushRequirement();

  if (requirements.length === 0) {
    throw new Error(`main spec '${sourcePath}' does not contain any requirements`);
  }

  const relativeSpecPath = sourcePath.replace(`${LEGACY_WORKFLOW_DIR}/specs/`, "");
  return {
    schema: "strict-spec-driven/main-spec/v1",
    schema_version: 1,
    artifact_type: "main_spec",
    schema_file: MAIN_SPEC_SCHEMA_FILE,
    spec: {
      id: buildSpecIdFromRelativePath(relativeSpecPath),
      title,
    },
    mapping,
    requirements,
  };
}

function parseLegacyDeltaSpec(
  sourcePath: string,
  content: string,
): StrictDeltaSpecArtifact {
  const { frontmatter, body } = extractMarkdownFrontmatter(content);
  const mapping = getLegacySpecMapping(frontmatter);
  const relativePathMatch = sourcePath.match(/^\.spec-driven\/changes\/(?:archive\/[^/]+\/|[^/]+\/)specs\/(.+)\.md$/);
  if (!relativePathMatch) {
    throw new Error(`delta spec '${sourcePath}' is not under a recognized change specs directory`);
  }

  const operations: StrictDeltaSpecArtifact["operations"] = {
    ADDED: [],
    MODIFIED: [],
    REMOVED: [],
  };
  let currentOperation: keyof StrictDeltaSpecArtifact["operations"] | null = null;
  let currentRequirementId: string | null = null;
  let currentScenarioTitle: string | null = null;
  let currentScenarioSteps: StrictScenarioStep[] = [];
  let currentScenarioIds = new Set<string>();
  let currentStatementLines: string[] = [];
  let currentPreviousLines: string[] = [];
  let currentReasonLines: string[] = [];
  let currentScenarios: StrictScenario[] = [];

  function flushScenario(): void {
    if (!currentScenarioTitle) {
      return;
    }
    if (currentScenarioSteps.length === 0) {
      throw new Error(`scenario '${currentScenarioTitle}' in '${sourcePath}' is missing steps`);
    }
    currentScenarios.push({
      id: makeUniqueId(toKebabCase(currentScenarioTitle), currentScenarioIds),
      steps: currentScenarioSteps,
    });
    currentScenarioTitle = null;
    currentScenarioSteps = [];
  }

  function flushRequirement(): void {
    if (!currentRequirementId || !currentOperation) {
      return;
    }
    flushScenario();

    if (currentOperation === "ADDED") {
      const statement = normalizeWhitespace(currentStatementLines.join(" "));
      if (statement.length === 0) {
        throw new Error(`ADDED requirement '${currentRequirementId}' in '${sourcePath}' is missing a statement`);
      }
      operations.ADDED.push({
        requirement: {
          id: currentRequirementId,
          strength: parseRequirementStrength(statement, `ADDED requirement '${currentRequirementId}' in '${sourcePath}'`),
          statement,
          scenarios: currentScenarios,
        },
      });
    } else if (currentOperation === "MODIFIED") {
      const statement = normalizeWhitespace(currentStatementLines.join(" "));
      if (statement.length === 0) {
        throw new Error(`MODIFIED requirement '${currentRequirementId}' in '${sourcePath}' is missing a replacement statement`);
      }
      operations.MODIFIED.push({
        target_requirement: currentRequirementId,
        replacement: {
          id: currentRequirementId,
          strength: parseRequirementStrength(statement, `MODIFIED requirement '${currentRequirementId}' in '${sourcePath}'`),
          statement,
          scenarios: currentScenarios,
        },
      });
    } else {
      const reason = normalizeWhitespace(currentReasonLines.join(" "));
      if (reason.length === 0) {
        throw new Error(`REMOVED requirement '${currentRequirementId}' in '${sourcePath}' is missing a reason`);
      }
      operations.REMOVED.push({
        target_requirement: currentRequirementId,
        reason,
      });
    }

    currentRequirementId = null;
    currentScenarioTitle = null;
    currentScenarioSteps = [];
    currentScenarioIds = new Set<string>();
    currentStatementLines = [];
    currentPreviousLines = [];
    currentReasonLines = [];
    currentScenarios = [];
  }

  for (const rawLine of body.split("\n")) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const operationMatch = trimmed.match(/^## (ADDED|MODIFIED|REMOVED) Requirements$/);
    if (operationMatch) {
      flushRequirement();
      currentOperation = operationMatch[1] as keyof StrictDeltaSpecArtifact["operations"];
      continue;
    }

    const requirementMatch = trimmed.match(/^### Requirement:\s+(.+)$/);
    if (requirementMatch) {
      if (!currentOperation) {
        throw new Error(`requirement '${requirementMatch[1]}' in '${sourcePath}' appears before any delta operation section`);
      }
      flushRequirement();
      currentRequirementId = normalizeWhitespace(requirementMatch[1]);
      continue;
    }

    const scenarioMatch = trimmed.match(/^#### Scenario:\s+(.+)$/);
    if (scenarioMatch) {
      if (!currentRequirementId || currentOperation === "REMOVED") {
        throw new Error(`scenario '${scenarioMatch[1]}' in '${sourcePath}' is not valid in the current delta section`);
      }
      flushScenario();
      currentScenarioTitle = normalizeWhitespace(scenarioMatch[1]);
      continue;
    }

    const stepMatch = trimmed.match(/^- (GIVEN|WHEN|THEN|AND)\s+(.+)$/);
    if (stepMatch) {
      if (!currentScenarioTitle) {
        throw new Error(`step '${trimmed}' in '${sourcePath}' appears outside a scenario`);
      }
      currentScenarioSteps.push({
        kind: stepMatch[1] as ScenarioStepKind,
        text: normalizeWhitespace(stepMatch[2]),
      });
      continue;
    }

    if (!currentRequirementId || !currentOperation) {
      continue;
    }

    if (currentScenarioTitle && currentScenarioSteps.length > 0) {
      const lastStep = currentScenarioSteps[currentScenarioSteps.length - 1];
      lastStep.text = normalizeWhitespace(`${lastStep.text} ${trimmed}`);
      continue;
    }

    if (currentOperation === "REMOVED") {
      const reasonMatch = trimmed.match(/^Reason:\s*(.+)$/);
      if (reasonMatch) {
        currentReasonLines.push(reasonMatch[1]);
      } else if (currentReasonLines.length > 0) {
        currentReasonLines.push(trimmed);
      } else {
        throw new Error(`REMOVED requirement '${currentRequirementId}' in '${sourcePath}' is missing a 'Reason:' line`);
      }
      continue;
    }

    if (currentOperation === "MODIFIED" && trimmed.startsWith("Previously:")) {
      currentPreviousLines.push(trimmed.slice("Previously:".length).trim());
      continue;
    }

    if (currentOperation === "MODIFIED" && currentStatementLines.length === 0 && currentPreviousLines.length > 0) {
      if (/^The system (MUST|SHOULD|MAY)\b/.test(trimmed)) {
        currentStatementLines.push(trimmed);
      } else {
        currentPreviousLines.push(trimmed);
      }
      continue;
    }

    currentStatementLines.push(trimmed);
  }

  flushRequirement();

  return {
    schema: "strict-spec-driven/delta-spec/v1",
    schema_version: 1,
    artifact_type: "delta_spec",
    schema_file: DELTA_SPEC_SCHEMA_FILE,
    target_spec: buildSpecIdFromRelativePath(relativePathMatch[1]),
    mapping,
    operations,
  };
}

function parseLegacyProposal(
  sourcePath: string,
  content: string,
  fallbackChangeId: string,
  archived: boolean,
): StrictChangeProposalArtifact {
  const body = content.replace(/\r\n/g, "\n");
  const sections = extractMarkdownSections(body);
  const what = parseMarkdownItems(sections.get("What") ?? "");
  const why = parseMarkdownItems(sections.get("Why") ?? "");
  const scope = parseScopeItems(sections.get("Scope") ?? "");
  const unchangedBehavior = parseMarkdownItems(sections.get("Unchanged Behavior") ?? "")
    .filter((item) => item !== "Behaviors that must not change as a result of this change (leave blank if nothing is at risk):");
  const heading = extractMarkdownHeading(body);
  const changeId = heading ? toKebabCase(heading) : fallbackChangeId;

  if (what.length === 0) {
    throw new Error(`proposal '${sourcePath}' is missing ## What content`);
  }
  if (why.length === 0) {
    throw new Error(`proposal '${sourcePath}' is missing ## Why content`);
  }

  return {
    schema: "strict-spec-driven/change-proposal/v1",
    schema_version: 1,
    artifact_type: "change_proposal",
    schema_file: CHANGE_PROPOSAL_SCHEMA_FILE,
    change: {
      id: changeId,
      status: archived ? "complete" : "active",
    },
    summary: {
      what,
      why,
    },
    scope: {
      in: scope.inScope,
      out: scope.outOfScope,
    },
    unchanged_behavior: unchangedBehavior,
  };
}

function parseLegacyDesign(
  sourcePath: string,
  content: string,
  changeId: string,
): StrictChangeDesignArtifact {
  const sections = extractMarkdownSections(content.replace(/\r\n/g, "\n"));
  const approach = parseMarkdownItems(sections.get("Approach") ?? "", "approach");
  const decisionItems = parseMarkdownItems(sections.get("Key Decisions") ?? "");
  const alternativeItems = parseMarkdownItems(sections.get("Alternatives Considered") ?? "");
  const riskItems = parseMarkdownItems(sections.get("Risks") ?? "");

  if (approach.length === 0) {
    throw new Error(`design '${sourcePath}' is missing ## Approach content`);
  }

  const usedDecisionIds = new Set<string>();
  const decisions = decisionItems.map((item) => {
    const boldMatch = item.match(/^\*\*(.+?)\*\*:\s*(.+)$/);
    const decisionText = boldMatch ? boldMatch[2] : item;
    const { first, rest } = splitFirstSentence(decisionText);
    const idSource = boldMatch ? boldMatch[1] : first;
    return {
      id: makeUniqueId(toKebabCase(idSource), usedDecisionIds),
      decision: first,
      rationale: rest.length > 0 ? rest : normalizeWhitespace(decisionText),
    };
  });

  const alternatives = alternativeItems.map((item) => {
    const boldMatch = item.match(/^\*\*(.+?)\*\*:\s*(.+)$/);
    const optionText = boldMatch ? boldMatch[1] : splitFirstSentence(item).first;
    const reasonText = boldMatch ? boldMatch[2] : splitFirstSentence(item).rest || item;
    return {
      option: normalizeWhitespace(optionText),
      reason: normalizeWhitespace(reasonText),
    };
  });

  return {
    schema: "strict-spec-driven/change-design/v1",
    schema_version: 1,
    artifact_type: "change_design",
    schema_file: CHANGE_DESIGN_SCHEMA_FILE,
    change: changeId,
    approach,
    decisions,
    alternatives,
    risks: riskItems.length > 0 ? riskItems : undefined,
  };
}

function parseLegacyTasks(
  sourcePath: string,
  content: string,
  changeId: string,
): StrictTaskListArtifact {
  const sections = extractMarkdownSections(content.replace(/\r\n/g, "\n"));

  function parseTaskSection(
    sectionName: "Implementation" | "Testing" | "Verification",
  ): StrictTaskListTask[] {
    const sectionText = sections.get(sectionName) ?? "";
    const tasks: StrictTaskListTask[] = [];
    let currentText = "";
    let currentStatus: "pending" | "complete" | null = null;
    let index = 0;

    function flushCurrent(): void {
      if (!currentStatus) {
        return;
      }
      const text = normalizeWhitespace(currentText);
      if (text.length === 0) {
        throw new Error(`${sectionName} task in '${sourcePath}' is missing text`);
      }
      index += 1;
      const task: StrictTaskListTask = {
        id: `${toKebabCase(sectionName)}-${index}`,
        text,
        status: currentStatus,
      };
      if (sectionName === "Testing") {
        const command = extractBacktickCommand(text);
        if (!command) {
          throw new Error(`Testing task '${text}' in '${sourcePath}' is missing a backticked command`);
        }
        task.command = command;
      }
      tasks.push(task);
      currentText = "";
      currentStatus = null;
    }

    for (const rawLine of sectionText.split("\n")) {
      const trimmed = rawLine.trim();
      if (trimmed.length === 0 || trimmed.startsWith("<!--")) {
        continue;
      }
      const taskMatch = trimmed.match(/^- \[(x| )\]\s+(.+)$/i);
      if (taskMatch) {
        flushCurrent();
        currentStatus = taskMatch[1].toLowerCase() === "x" ? "complete" : "pending";
        currentText = taskMatch[2];
        continue;
      }
      if (!currentStatus) {
        continue;
      }
      currentText = `${currentText} ${trimmed}`.trim();
    }

    flushCurrent();

    if (tasks.length === 0) {
      throw new Error(`tasks '${sourcePath}' is missing the required ${sectionName} tasks`);
    }
    return tasks;
  }

  const implementationTasks = parseTaskSection("Implementation");
  const testingTasks = parseTaskSection("Testing");
  const verificationTasks = parseTaskSection("Verification");

  if (testingTasks.length < 2) {
    throw new Error(`tasks '${sourcePath}' must contain at least two Testing tasks for validation and unit test gates`);
  }

  return {
    schema: "strict-spec-driven/task-list/v1",
    schema_version: 1,
    artifact_type: "task_list",
    schema_file: TASK_LIST_SCHEMA_FILE,
    change: changeId,
    sections: [
      {
        name: "Implementation",
        tasks: implementationTasks,
      },
      {
        name: "Testing",
        tasks: testingTasks,
      },
      {
        name: "Verification",
        tasks: verificationTasks,
      },
    ],
    testing_gates: {
      validation_task: testingTasks[0].id,
      unit_test_task: testingTasks[1].id,
    },
  };
}

function parseLegacyQuestions(
  sourcePath: string,
  content: string,
  changeId: string,
): StrictQuestionListArtifact {
  const sections = extractMarkdownSections(content.replace(/\r\n/g, "\n"));
  const usedIds = new Set<string>();

  function parseQuestionSection(sectionName: "Open" | "Resolved"): Array<{
    id: string;
    question: string;
    context: string;
    answer?: string;
    status: "open" | "resolved";
  }> {
    const results: Array<{
      id: string;
      question: string;
      context: string;
      answer?: string;
      status: "open" | "resolved";
    }> = [];
    let currentQuestion = "";
    let contextLines: string[] = [];
    let answerLines: string[] = [];
    let currentField: "question" | "context" | "answer" | null = null;

    function flushCurrent(): void {
      const question = normalizeWhitespace(currentQuestion);
      if (question.length === 0) {
        currentQuestion = "";
        contextLines = [];
        answerLines = [];
        currentField = null;
        return;
      }

      const context = normalizeWhitespace(contextLines.join(" "));
      if (context.length === 0) {
        throw new Error(`question '${question}' in '${sourcePath}' is missing Context`);
      }

      const record = {
        id: makeUniqueId(toKebabCase(question), usedIds),
        question,
        context,
        status: sectionName === "Open" ? "open" as const : "resolved" as const,
      };

      if (sectionName === "Resolved") {
        const answer = normalizeWhitespace(answerLines.join(" "));
        if (answer.length === 0) {
          throw new Error(`resolved question '${question}' in '${sourcePath}' is missing an answer`);
        }
        results.push({
          ...record,
          answer,
        });
      } else {
        results.push(record);
      }

      currentQuestion = "";
      contextLines = [];
      answerLines = [];
      currentField = null;
    }

    const sectionText = sections.get(sectionName) ?? "";
    for (const rawLine of sectionText.split("\n")) {
      const trimmed = rawLine.trim();
      if (trimmed.length === 0 || trimmed.startsWith("<!--")) {
        continue;
      }
      const questionMatch = trimmed.match(/^- \[(x| )\]\s+Q:\s+(.+)$/i);
      if (questionMatch) {
        flushCurrent();
        currentQuestion = questionMatch[2];
        currentField = "question";
        continue;
      }
      const contextMatch = trimmed.match(/^Context:\s+(.+)$/);
      if (contextMatch) {
        contextLines.push(contextMatch[1]);
        currentField = "context";
        continue;
      }
      const answerMatch = trimmed.match(/^A:\s+(.+)$/);
      if (answerMatch) {
        answerLines.push(answerMatch[1]);
        currentField = "answer";
        continue;
      }
      if (currentField === "context") {
        contextLines.push(trimmed);
      } else if (currentField === "answer") {
        answerLines.push(trimmed);
      } else if (currentField === "question") {
        currentQuestion = `${currentQuestion} ${trimmed}`.trim();
      }
    }

    flushCurrent();
    return results;
  }

  const openQuestions = parseQuestionSection("Open");
  const resolvedQuestions = parseQuestionSection("Resolved");

  return {
    schema: "strict-spec-driven/question-list/v1",
    schema_version: 1,
    artifact_type: "question_list",
    schema_file: QUESTION_LIST_SCHEMA_FILE,
    change: changeId,
    open: openQuestions.map((entry) => ({
      id: entry.id,
      question: entry.question,
      context: entry.context,
      status: "open" as const,
    })),
    resolved: resolvedQuestions.map((entry) => ({
      id: entry.id,
      question: entry.question,
      context: entry.context,
      answer: entry.answer ?? "",
      status: "resolved" as const,
    })),
  };
}

function regenerateStrictSpecIndex(rootDir: string): void {
  const specsRoot = path.join(rootDir, STRICT_WORKFLOW_DIR, "specs");
  const indexPath = path.join(specsRoot, "INDEX.yaml");
  const specs = listFilesRecursive(specsRoot)
    .map((absolutePath) => ({
      absolutePath,
      repoRelativePath: toRepoRelativePath(rootDir, absolutePath),
    }))
    .filter(({ absolutePath }) => absolutePath.endsWith(".yaml") || absolutePath.endsWith(".yml"))
    .filter(({ absolutePath }) => path.basename(absolutePath) !== "INDEX.yaml")
    .map(({ absolutePath, repoRelativePath }) => {
      const artifact = readYamlFile<unknown>(absolutePath);
      if (!isRecord(artifact) || artifact.artifact_type !== "main_spec") {
        return null;
      }
      const spec = asObject(artifact.spec, `main spec '${repoRelativePath}' field 'spec'`);
      if (typeof spec.id !== "string" || typeof spec.title !== "string") {
        throw new Error(`main spec '${repoRelativePath}' is missing spec.id or spec.title`);
      }
      return {
        id: spec.id,
        title: spec.title,
        path: repoRelativePath,
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

  const indexArtifact: StrictSpecIndexArtifact = existsSync(indexPath)
    ? {
        ...(readYamlFile<StrictSpecIndexArtifact>(indexPath)),
        schema: "strict-spec-driven/spec-index/v1",
        schema_version: 1,
        artifact_type: "spec_index",
        schema_file: SPEC_INDEX_SCHEMA_FILE,
        specs,
      }
    : {
        schema: "strict-spec-driven/spec-index/v1",
        schema_version: 1,
        artifact_type: "spec_index",
        schema_file: SPEC_INDEX_SCHEMA_FILE,
        specs,
      };
  writeYamlFile(indexPath, indexArtifact);
}

function convertLegacySpecArtifacts(
  rootDir: string,
  result: MigrationResult,
  handledLegacyFiles: Set<string>,
): boolean {
  const legacySpecsRoot = path.join(rootDir, LEGACY_WORKFLOW_DIR, "specs");
  if (!existsSync(legacySpecsRoot) || !statSync(legacySpecsRoot).isDirectory()) {
    return false;
  }

  let convertedAny = false;
  const legacySpecFiles = listFilesRecursive(legacySpecsRoot)
    .map((absolutePath) => toRepoRelativePath(rootDir, absolutePath))
    .filter((repoRelativePath) => repoRelativePath.endsWith(".md"))
    .filter((repoRelativePath) => path.basename(repoRelativePath) !== "INDEX.md" && path.basename(repoRelativePath) !== "README.md")
    .sort((left, right) => left.localeCompare(right));

  for (const legacySpecFile of legacySpecFiles) {
    handledLegacyFiles.add(legacySpecFile);
    try {
      const strictArtifact = parseLegacyMainSpec(
        legacySpecFile,
        readFileSync(path.join(rootDir, legacySpecFile), "utf8"),
      );
      const strictTargetPath = replaceMarkdownExtension(
        legacySpecFile.replace(`${LEGACY_WORKFLOW_DIR}/specs/`, `${STRICT_WORKFLOW_DIR}/specs/`),
      );
      writeYamlFile(
        buildStrictMarkdownTargetPath(rootDir, strictTargetPath),
        strictArtifact,
      );
      result.converted.push({
        kind: "main_spec",
        sourcePath: legacySpecFile,
        targetPath: strictTargetPath,
        note: "Migrated legacy Markdown main spec into a strict YAML main_spec artifact.",
      });
      convertedAny = true;
    } catch (error) {
      const deferredArtifact = makeConversionFailure(legacySpecFile, error);
      recordDeferredArtifact(
        result,
        legacySpecFile,
        deferredArtifact.reason,
        deferredArtifact.recommendation,
        deferredArtifact.kind,
        "conversion_ambiguous",
      );
    }
  }

  if (convertedAny) {
    regenerateStrictSpecIndex(rootDir);
  }

  return convertedAny;
}

function convertLegacyChangeArtifacts(
  rootDir: string,
  result: MigrationResult,
  handledLegacyFiles: Set<string>,
): void {
  for (const changeDirectory of listLegacyChangeDirectories(rootDir)) {
    const fallbackChangeId = changeDirectory.archived
      ? toKebabCase(changeDirectory.directoryName.replace(/^\d{4}-\d{2}-\d{2}-/, ""))
      : toKebabCase(changeDirectory.directoryName);
    let changeId = fallbackChangeId;

    const legacyProposalPath = path.join(changeDirectory.legacyDirectoryPath, "proposal.md");
    const repoRelativeProposalPath = `${changeDirectory.repoRelativeDirectory}/proposal.md`;
    if (existsSync(legacyProposalPath) && statSync(legacyProposalPath).isFile()) {
      handledLegacyFiles.add(repoRelativeProposalPath);
      try {
        const proposalArtifact = parseLegacyProposal(
          repoRelativeProposalPath,
          readFileSync(legacyProposalPath, "utf8"),
          fallbackChangeId,
          changeDirectory.archived,
        );
        changeId = proposalArtifact.change.id;
        const strictTargetPath = `${changeDirectory.strictDirectoryPath.replace(`${rootDir}/`, "")}/proposal.yaml`;
        writeYamlFile(path.join(changeDirectory.strictDirectoryPath, "proposal.yaml"), proposalArtifact);
        result.converted.push({
          kind: "change_proposal",
          sourcePath: repoRelativeProposalPath,
          targetPath: toPosix(strictTargetPath),
          note: "Migrated legacy Markdown proposal into a strict YAML change_proposal artifact.",
        });
      } catch (error) {
        const deferredArtifact = makeConversionFailure(repoRelativeProposalPath, error);
        recordDeferredArtifact(
          result,
          repoRelativeProposalPath,
          deferredArtifact.reason,
          deferredArtifact.recommendation,
          deferredArtifact.kind,
          "conversion_ambiguous",
        );
      }
    }

    const changeArtifactFiles: Array<{
      legacyName: string;
      targetName: string;
      kind: MigrationConvertedArtifact["kind"];
      convert: (sourcePath: string, content: string, resolvedChangeId: string) => unknown;
      note: string;
    }> = [
      {
        legacyName: "design.md",
        targetName: "design.yaml",
        kind: "change_design",
        convert: parseLegacyDesign,
        note: "Migrated legacy Markdown design into a strict YAML change_design artifact.",
      },
      {
        legacyName: "tasks.md",
        targetName: "tasks.yaml",
        kind: "task_list",
        convert: parseLegacyTasks,
        note: "Migrated legacy Markdown tasks into a strict YAML task_list artifact.",
      },
      {
        legacyName: "questions.md",
        targetName: "questions.yaml",
        kind: "question_list",
        convert: parseLegacyQuestions,
        note: "Migrated legacy Markdown questions into a strict YAML question_list artifact.",
      },
    ];

    for (const artifactFile of changeArtifactFiles) {
      const legacyFilePath = path.join(changeDirectory.legacyDirectoryPath, artifactFile.legacyName);
      const repoRelativeLegacyFilePath = `${changeDirectory.repoRelativeDirectory}/${artifactFile.legacyName}`;
      if (!existsSync(legacyFilePath) || !statSync(legacyFilePath).isFile()) {
        continue;
      }
      handledLegacyFiles.add(repoRelativeLegacyFilePath);
      try {
        const artifact = artifactFile.convert(
          repoRelativeLegacyFilePath,
          readFileSync(legacyFilePath, "utf8"),
          changeId,
        );
        const strictTargetPath = `${changeDirectory.strictDirectoryPath.replace(`${rootDir}/`, "")}/${artifactFile.targetName}`;
        writeYamlFile(path.join(changeDirectory.strictDirectoryPath, artifactFile.targetName), artifact);
        result.converted.push({
          kind: artifactFile.kind,
          sourcePath: repoRelativeLegacyFilePath,
          targetPath: toPosix(strictTargetPath),
          note: artifactFile.note,
        });
      } catch (error) {
        const deferredArtifact = makeConversionFailure(repoRelativeLegacyFilePath, error);
        recordDeferredArtifact(
          result,
          repoRelativeLegacyFilePath,
          deferredArtifact.reason,
          deferredArtifact.recommendation,
          deferredArtifact.kind,
          "conversion_ambiguous",
        );
      }
    }

    const legacyDeltaSpecsRoot = path.join(changeDirectory.legacyDirectoryPath, "specs");
    if (existsSync(legacyDeltaSpecsRoot) && statSync(legacyDeltaSpecsRoot).isDirectory()) {
      const deltaSpecFiles = listFilesRecursive(legacyDeltaSpecsRoot)
        .map((absolutePath) => toRepoRelativePath(rootDir, absolutePath))
        .filter((repoRelativePath) => repoRelativePath.endsWith(".md"))
        .sort((left, right) => left.localeCompare(right));

      for (const legacyDeltaSpecPath of deltaSpecFiles) {
        handledLegacyFiles.add(legacyDeltaSpecPath);
        try {
          const deltaArtifact = parseLegacyDeltaSpec(
            legacyDeltaSpecPath,
            readFileSync(path.join(rootDir, legacyDeltaSpecPath), "utf8"),
          );
          const strictTargetPath = replaceMarkdownExtension(
            legacyDeltaSpecPath
              .replace(`${LEGACY_WORKFLOW_DIR}/changes/`, `${STRICT_WORKFLOW_DIR}/changes/`)
              .replace("/specs/", "/specs/"),
          );
          writeYamlFile(buildStrictMarkdownTargetPath(rootDir, strictTargetPath), deltaArtifact);
          result.converted.push({
            kind: "delta_spec",
            sourcePath: legacyDeltaSpecPath,
            targetPath: strictTargetPath,
            note: "Migrated legacy Markdown delta spec into a strict YAML delta_spec artifact.",
          });
        } catch (error) {
          const deferredArtifact = makeConversionFailure(legacyDeltaSpecPath, error);
          recordDeferredArtifact(
            result,
            legacyDeltaSpecPath,
            deferredArtifact.reason,
            deferredArtifact.recommendation,
            deferredArtifact.kind,
            "conversion_ambiguous",
          );
        }
      }
    }
  }
}

function describeDeferredLegacyArtifact(repoRelativePath: string): DeferredLegacyArtifact {
  if (repoRelativePath === `${LEGACY_WORKFLOW_DIR}/specs/INDEX.md`) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy specs index content is a project-state artifact that still requires a dedicated strict YAML converter.",
      recommendation: "Implement roadmap and project-state migration converters before attempting to migrate specs index state.",
    };
  }
  if (repoRelativePath === `${LEGACY_WORKFLOW_DIR}/specs/README.md`) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy specs README guidance does not have a dedicated strict YAML migration target in the current migrate command.",
      recommendation: "Decide whether this documentation should stay as Markdown guidance or move under a dedicated migration/documentation path before treating the migration as complete.",
    };
  }
  if (repoRelativePath.startsWith(`${LEGACY_WORKFLOW_DIR}/changes/`)) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy change artifacts require dedicated migration converters before they can become strict YAML change artifacts.",
      recommendation: "Implement the core-workflow migration converters before attempting to self-host migrated changes.",
    };
  }
  if (repoRelativePath.startsWith(`${LEGACY_WORKFLOW_DIR}/roadmap/`)) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy roadmap artifacts require dedicated migration converters before they can become strict roadmap YAML artifacts.",
      recommendation: "Implement roadmap and project-state migration converters before attempting to migrate roadmap state.",
    };
  }
  if (repoRelativePath.startsWith(`${LEGACY_WORKFLOW_DIR}/specs/`)) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy spec artifacts require dedicated migration converters before they can become strict YAML specs and deltas.",
      recommendation: "Implement spec and delta migration converters before attempting to migrate legacy spec content.",
    };
  }

  return {
    kind: repoRelativePath.endsWith(".md") ? "legacy_markdown_artifact" : "legacy_project_state",
    reason: "This legacy workflow artifact does not have a dedicated migration converter in the current migrate command.",
    recommendation: "Add a dedicated migration converter for this artifact type before treating the migration as complete.",
  };
}

function convertLegacyRoadmapArtifacts(
  rootDir: string,
  result: MigrationResult,
  handledLegacyFiles: Set<string>,
): void {
  const legacyRoadmapRoot = path.join(rootDir, LEGACY_ROADMAP_DIR);
  if (!existsSync(legacyRoadmapRoot) || !statSync(legacyRoadmapRoot).isDirectory()) {
    return;
  }

  const legacyIndexPath = `${LEGACY_ROADMAP_DIR}/INDEX.md`;
  const legacyIndexAbsPath = path.join(legacyRoadmapRoot, "INDEX.md");
  if (existsSync(legacyIndexAbsPath) && statSync(legacyIndexAbsPath).isFile()) {
    handledLegacyFiles.add(legacyIndexPath);
    try {
      const content = readFileSync(legacyIndexAbsPath, "utf8");
      const conversionResult = convertRoadmapIndex(content);
      if (!conversionResult.ok) {
        recordDeferredArtifact(
          result,
          legacyIndexPath,
          conversionResult.reason,
          conversionResult.recommendation,
          "legacy_markdown_artifact",
          "conversion_ambiguous",
        );
      } else {
        const strictIndexPath = `${STRICT_ROADMAP_DIR}/INDEX.yaml`;
        writeYamlFile(buildStrictMarkdownTargetPath(rootDir, strictIndexPath), conversionResult.artifact);
        result.converted.push({
          kind: "roadmap_index",
          sourcePath: legacyIndexPath,
          targetPath: strictIndexPath,
          note: "Migrated legacy roadmap index into a strict YAML roadmap_index artifact.",
        });
      }
    } catch (error) {
      const deferredArtifact = makeConversionFailure(legacyIndexPath, error);
      recordDeferredArtifact(
        result,
        legacyIndexPath,
        deferredArtifact.reason,
        deferredArtifact.recommendation,
        deferredArtifact.kind,
        "conversion_ambiguous",
      );
    }
  }

  const legacyMilestonesRoot = path.join(legacyRoadmapRoot, "milestones");
  if (!existsSync(legacyMilestonesRoot) || !statSync(legacyMilestonesRoot).isDirectory()) {
    return;
  }

  const milestoneFiles = listFilesRecursive(legacyMilestonesRoot)
    .map((absolutePath) => toRepoRelativePath(rootDir, absolutePath))
    .filter((repoRelativePath) => repoRelativePath.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right));

  for (const legacyMilestoneFile of milestoneFiles) {
    handledLegacyFiles.add(legacyMilestoneFile);
    try {
      const content = readFileSync(path.join(rootDir, legacyMilestoneFile), "utf8");
      const filename = path.basename(legacyMilestoneFile);
      const conversionResult = convertRoadmapMilestone(content, filename);
      if (!conversionResult.ok) {
        recordDeferredArtifact(
          result,
          legacyMilestoneFile,
          conversionResult.reason,
          conversionResult.recommendation,
          "legacy_markdown_artifact",
          "conversion_ambiguous",
        );
        continue;
      }
      const strictMilestonePath = toPosix(
        legacyMilestoneFile
          .replace(`${LEGACY_ROADMAP_DIR}/`, `${STRICT_ROADMAP_DIR}/`)
          .replace(/\.md$/i, ".yaml"),
      );
      writeYamlFile(buildStrictMarkdownTargetPath(rootDir, strictMilestonePath), conversionResult.artifact);
      result.converted.push({
        kind: "roadmap_milestone",
        sourcePath: legacyMilestoneFile,
        targetPath: strictMilestonePath,
        note: "Migrated legacy roadmap milestone into a strict YAML roadmap_milestone artifact.",
      });
    } catch (error) {
      const deferredArtifact = makeConversionFailure(legacyMilestoneFile, error);
      recordDeferredArtifact(
        result,
        legacyMilestoneFile,
        deferredArtifact.reason,
        deferredArtifact.recommendation,
        deferredArtifact.kind,
        "conversion_ambiguous",
      );
    }
  }
}

function convertLegacySpecsIndex(
  rootDir: string,
  result: MigrationResult,
  handledLegacyFiles: Set<string>,
): void {
  const legacySpecsIndexPath = `${LEGACY_WORKFLOW_DIR}/specs/INDEX.md`;
  const legacySpecsIndexAbsPath = path.join(rootDir, LEGACY_WORKFLOW_DIR, "specs", "INDEX.md");

  if (!existsSync(legacySpecsIndexAbsPath) || !statSync(legacySpecsIndexAbsPath).isFile()) {
    return;
  }

  handledLegacyFiles.add(legacySpecsIndexPath);

  const strictSpecsIndexPath = `${STRICT_WORKFLOW_DIR}/specs/INDEX.yaml`;
  const strictSpecsIndexAbsPath = path.join(rootDir, STRICT_WORKFLOW_DIR, "specs", "INDEX.yaml");

  if (existsSync(strictSpecsIndexAbsPath)) {
    result.converted.push({
      kind: "spec_index",
      sourcePath: legacySpecsIndexPath,
      targetPath: strictSpecsIndexPath,
      note: "Legacy specs index converted: strict spec index regenerated from migrated spec artifacts.",
    });
    return;
  }

  try {
    const content = readFileSync(legacySpecsIndexAbsPath, "utf8");
    const conversionResult = convertSpecsIndex(content);
    if (!conversionResult.ok) {
      recordDeferredArtifact(
        result,
        legacySpecsIndexPath,
        conversionResult.reason,
        conversionResult.recommendation,
        "legacy_markdown_artifact",
        "conversion_ambiguous",
      );
      return;
    }
    writeYamlFile(strictSpecsIndexAbsPath, conversionResult.artifact);
    result.converted.push({
      kind: "spec_index",
      sourcePath: legacySpecsIndexPath,
      targetPath: strictSpecsIndexPath,
      note: "Migrated legacy specs index into a strict YAML spec_index artifact.",
    });
  } catch (error) {
    const deferredArtifact = makeConversionFailure(legacySpecsIndexPath, error);
    recordDeferredArtifact(
      result,
      legacySpecsIndexPath,
      deferredArtifact.reason,
      deferredArtifact.recommendation,
      deferredArtifact.kind,
      "conversion_ambiguous",
    );
  }
}

function sortMigrationResult(result: MigrationResult): MigrationResult {
  result.converted.sort((left, right) => {
    const leftKey = [left.targetPath, left.sourcePath ?? "", left.kind, left.note].join("|");
    const rightKey = [right.targetPath, right.sourcePath ?? "", right.kind, right.note].join("|");
    return leftKey.localeCompare(rightKey);
  });
  result.skipped.sort((left, right) => {
    const leftKey = [left.sourcePath, left.kind, left.reason].join("|");
    const rightKey = [right.sourcePath, right.kind, right.reason].join("|");
    return leftKey.localeCompare(rightKey);
  });
  result.warnings.sort((left, right) => {
    const leftKey = [left.code, left.sourcePath ?? "", left.targetPath ?? "", left.message].join("|");
    const rightKey = [right.code, right.sourcePath ?? "", right.targetPath ?? "", right.message].join("|");
    return leftKey.localeCompare(rightKey);
  });
  result.errors.sort((left, right) => {
    const leftKey = [left.code, left.sourcePath ?? "", left.targetPath ?? "", left.message].join("|");
    const rightKey = [right.code, right.sourcePath ?? "", right.targetPath ?? "", right.message].join("|");
    return leftKey.localeCompare(rightKey);
  });
  result.manualFollowUp.sort((left, right) => {
    const leftKey = [left.sourcePath, left.reason, left.recommendation].join("|");
    const rightKey = [right.sourcePath, right.reason, right.recommendation].join("|");
    return leftKey.localeCompare(rightKey);
  });
  return result;
}

function loadStrictConfigFromLegacy(rootDir: string, errors: MigrationDiagnostic[]): StrictWorkflowConfig | null {
  const legacyConfigAbsolutePath = path.join(rootDir, LEGACY_CONFIG_PATH);
  if (!existsSync(legacyConfigAbsolutePath) || !statSync(legacyConfigAbsolutePath).isFile()) {
    errors.push(
      makeDiagnostic(
        "legacy_config_missing",
        "Bootstrap migration requires .spec-driven/config.yaml to exist before migrate can initialize strict workflow state.",
        LEGACY_CONFIG_PATH,
      ),
    );
    return null;
  }

  let legacyConfigArtifact: LegacyWorkflowConfig;
  try {
    legacyConfigArtifact = parseYamlDocument<LegacyWorkflowConfig>(readFileSync(legacyConfigAbsolutePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(
      makeDiagnostic(
        "legacy_config_invalid",
        `Legacy workflow config could not be parsed as YAML: ${message}`,
        LEGACY_CONFIG_PATH,
      ),
    );
    return null;
  }

  if (!isRecord(legacyConfigArtifact)) {
    errors.push(
      makeDiagnostic(
        "legacy_config_invalid",
        "Legacy workflow config must decode to a YAML mapping before migrate can continue.",
        LEGACY_CONFIG_PATH,
      ),
    );
    return null;
  }

  const { context, rules } = legacyConfigArtifact;
  if (typeof context !== "string" || context.length === 0) {
    errors.push(
      makeDiagnostic(
        "legacy_config_invalid",
        "Legacy workflow config must provide a non-empty string context before migrate can continue.",
        LEGACY_CONFIG_PATH,
      ),
    );
    return null;
  }
  if (!isRecord(rules)) {
    errors.push(
      makeDiagnostic(
        "legacy_config_invalid",
        "Legacy workflow config must provide a rules mapping before migrate can continue.",
        LEGACY_CONFIG_PATH,
      ),
    );
    return null;
  }

  const scaffoldConfig = loadBundledScaffoldYaml<StrictWorkflowConfig>("config.yaml");
  return {
    ...scaffoldConfig,
    context,
    rules,
  };
}

export function migrateLegacyWorkflow(rootDir: string): MigrationResult {
  const legacyRootAbsolutePath = path.join(rootDir, LEGACY_WORKFLOW_DIR);
  const strictRootAbsolutePath = path.join(rootDir, STRICT_WORKFLOW_DIR);
  const result: MigrationResult = {
    valid: false,
    targetRoot: STRICT_WORKFLOW_DIR,
    converted: [],
    skipped: [],
    warnings: [],
    errors: [],
    manualFollowUp: [],
  };

  if (!existsSync(legacyRootAbsolutePath) || !statSync(legacyRootAbsolutePath).isDirectory()) {
    result.errors.push(
      makeDiagnostic(
        "legacy_source_missing",
        "Bootstrap migration requires a .spec-driven/ directory at the repository root.",
        LEGACY_WORKFLOW_DIR,
      ),
    );
    return sortMigrationResult(result);
  }

  if (existsSync(strictRootAbsolutePath)) {
    const strictRootStat = statSync(strictRootAbsolutePath);
    if (!strictRootStat.isDirectory()) {
      result.errors.push(
        makeDiagnostic(
          "strict_target_conflict",
          "Cannot migrate into .strict-spec-driven because a non-directory entry already exists at that path.",
          undefined,
          STRICT_WORKFLOW_DIR,
        ),
      );
      return sortMigrationResult(result);
    }
    if (readdirSync(strictRootAbsolutePath).length > 0) {
      result.errors.push(
        makeDiagnostic(
          "strict_target_conflict",
          "Cannot migrate into a non-empty .strict-spec-driven directory without a future safe rerun policy.",
          undefined,
          STRICT_WORKFLOW_DIR,
        ),
      );
      return sortMigrationResult(result);
    }
  }

  const strictConfig = loadStrictConfigFromLegacy(rootDir, result.errors);
  if (!strictConfig) {
    return sortMigrationResult(result);
  }

  const legacyFiles = listFilesRecursive(legacyRootAbsolutePath)
    .map((absolutePath) => toRepoRelativePath(rootDir, absolutePath))
    .sort((left, right) => left.localeCompare(right));

  const scaffoldResult = initializeStrictScaffold(rootDir);
  const strictConfigAbsolutePath = path.join(rootDir, STRICT_CONFIG_PATH);
  writeFileSync(strictConfigAbsolutePath, stringifyYamlDocument(strictConfig), "utf8");

  result.converted.push({
    kind: "workflow_config",
    sourcePath: LEGACY_CONFIG_PATH,
    targetPath: STRICT_CONFIG_PATH,
    note: "Migrated legacy workflow config into strict workflow config metadata.",
  });

  const handledLegacyFiles = new Set<string>([LEGACY_CONFIG_PATH]);

  for (const createdAsset of scaffoldResult.created.sort((left, right) => left.localeCompare(right))) {
    if (createdAsset === "config.yaml") {
      continue;
    }
    result.converted.push({
      kind: "strict_scaffold_asset",
      targetPath: `${STRICT_WORKFLOW_DIR}/${createdAsset}`,
      note: "Initialized strict scaffold asset pending dedicated legacy content converters.",
    });
  }

  convertLegacySpecArtifacts(rootDir, result, handledLegacyFiles);
  convertLegacyChangeArtifacts(rootDir, result, handledLegacyFiles);
  convertLegacyRoadmapArtifacts(rootDir, result, handledLegacyFiles);
  convertLegacySpecsIndex(rootDir, result, handledLegacyFiles);

  for (const legacyFile of legacyFiles) {
    if (handledLegacyFiles.has(legacyFile)) {
      continue;
    }
    const deferredArtifact = describeDeferredLegacyArtifact(legacyFile);
    recordDeferredArtifact(
      result,
      legacyFile,
      deferredArtifact.reason,
      deferredArtifact.recommendation,
      deferredArtifact.kind,
      "converter_unavailable",
    );
  }

  result.valid = true;
  return sortMigrationResult(result);
}
