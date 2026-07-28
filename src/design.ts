import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { listFilesRecursive, normalizeRepoRelativePath } from "./cli/fs.js";
import { loadBundledSchemaByArtifactType, validateArtifact, type ValidationDiagnostic } from "./validation.js";
import { parseYamlDocument } from "./yaml.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const ARCHITECTURE_ARTIFACT_PATH = `${STRICT_WORKFLOW_DIR}/architecture.yaml`;
const WORKFLOW_CONFIG_PATH = `${STRICT_WORKFLOW_DIR}/config.yaml`;
const SPEC_INDEX_PATH = `${STRICT_WORKFLOW_DIR}/specs/INDEX.yaml`;
const TECH_DIR_PATH = `${STRICT_WORKFLOW_DIR}/tech/`;
const EXCLUDED_TECH_BASENAMES = new Set(["INDEX.yaml"]);

export const DEFAULT_DESIGN_DOCUMENT_PATH = "DESIGN.md";
/** Entry point named in the missing-artifact error so operators know how to create the source. */
export const DESIGN_AUTHORING_ENTRY_POINT = "/strict-spec-design";

type ArchitectureComponent = {
  title?: unknown;
  responsibility?: unknown;
  boundaries?: unknown;
  depends_on?: unknown;
  mapping?: { implementation?: unknown } | unknown;
};

type ArchitectureDataFlow = {
  title?: unknown;
  trigger?: unknown;
  steps?: unknown;
  components?: unknown;
};

type ArchitectureDecision = {
  title?: unknown;
  statement?: unknown;
  rationale?: unknown;
  status?: unknown;
  alternatives?: unknown;
};

type ArchitectureArtifact = {
  architecture?: { id?: unknown; title?: unknown };
  components?: Record<string, ArchitectureComponent>;
  data_flows?: Record<string, ArchitectureDataFlow>;
  decisions?: Record<string, ArchitectureDecision>;
};

/**
 * A rendered section of the design document together with the source artifacts that produce it.
 * Check mode compares blocks individually so drift can name the source that went stale rather than
 * only reporting that the whole document differs.
 */
type DesignBlock = {
  id: string;
  /** Heading line that starts the block on disk, or null for the leading title-and-banner block. */
  heading: string | null;
  sources: string[];
  lines: string[];
};

export type DesignMappingDrift = {
  component: string;
  path: string;
};

export type DesignStatusResult = {
  artifactPath: string;
  exists: boolean;
  valid: boolean;
  diagnostics: ValidationDiagnostic[];
  componentCount: number;
  dataFlowCount: number;
  decisionCount: number;
  mappingDrift: DesignMappingDrift[];
};

export type DesignGenerateResult = {
  outputPath: string;
  mode: "write" | "check";
  written: boolean;
  /** False when check mode found no document at the output path, which is reported apart from drift. */
  documentExists: boolean;
  current: boolean;
  sources: string[];
  staleSources: string[];
};

export class DesignSourceError extends Error {}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readYamlIfPresent<T>(absolutePath: string, artifactPath: string): T | null {
  if (!existsSync(absolutePath)) return null;
  try {
    return parseYamlDocument<T>(readFileSync(absolutePath, "utf8"), { source: artifactPath });
  } catch {
    return null;
  }
}

export function getArchitectureArtifactPath(rootDir: string): string {
  return path.join(rootDir, STRICT_WORKFLOW_DIR, "architecture.yaml");
}

/**
 * Reads and schema-validates the architecture artifact. Both design-generate and design-status
 * depend on it, so the missing-artifact message names the path and the entry point that creates it.
 */
function loadArchitectureArtifact(rootDir: string): { artifact: ArchitectureArtifact; diagnostics: ValidationDiagnostic[] } {
  const absolutePath = getArchitectureArtifactPath(rootDir);
  if (!existsSync(absolutePath)) {
    throw new DesignSourceError(
      `architecture artifact is missing: ${ARCHITECTURE_ARTIFACT_PATH}; run ${DESIGN_AUTHORING_ENTRY_POINT} to author it`,
    );
  }

  let artifact: unknown;
  try {
    artifact = parseYamlDocument<unknown>(readFileSync(absolutePath, "utf8"), { source: ARCHITECTURE_ARTIFACT_PATH });
  } catch (error) {
    throw new DesignSourceError(
      `architecture artifact is not valid YAML: ${ARCHITECTURE_ARTIFACT_PATH}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const schema = loadBundledSchemaByArtifactType("architecture");
  const result = validateArtifact(schema, artifact, ARCHITECTURE_ARTIFACT_PATH);
  return { artifact: (artifact ?? {}) as ArchitectureArtifact, diagnostics: result.diagnostics };
}

function listTechFiles(techDir: string): string[] {
  if (!existsSync(techDir) || !statSync(techDir).isDirectory()) return [];
  return listFilesRecursive(techDir)
    .filter((filePath) => {
      const basename = path.basename(filePath);
      return basename.endsWith(".yaml") && !EXCLUDED_TECH_BASENAMES.has(basename);
    })
    .sort();
}

function renderBulletList(values: string[]): string[] {
  return values.map((value) => `- ${value}`);
}

function renderHeaderBlock(artifact: ArchitectureArtifact): DesignBlock {
  const title = asText(artifact.architecture?.title) || "Project Architecture";
  return {
    id: "header",
    heading: null,
    sources: [ARCHITECTURE_ARTIFACT_PATH],
    lines: [
      `# ${title}`,
      "",
      "> **Generated file — do not edit by hand.**",
      "> Rendered by `strict-spec-cli design-generate` from these source artifacts:",
      `> - \`${ARCHITECTURE_ARTIFACT_PATH}\``,
      `> - \`${WORKFLOW_CONFIG_PATH}\``,
      `> - \`${SPEC_INDEX_PATH}\``,
      `> - \`${TECH_DIR_PATH}\``,
      ">",
      "> Change the sources and re-render; edits made here are discarded by the next render.",
    ],
  };
}

function renderOverviewBlock(rootDir: string): DesignBlock {
  const config = readYamlIfPresent<{ context?: unknown }>(path.join(rootDir, STRICT_WORKFLOW_DIR, "config.yaml"), WORKFLOW_CONFIG_PATH);
  const context = asText(config?.context);
  return {
    id: "overview",
    heading: "## Overview",
    sources: [WORKFLOW_CONFIG_PATH],
    lines: [
      "## Overview",
      "",
      ...(context
        ? context.split("\n").map((line) => line.trimEnd())
        : [`_No project context is recorded in \`${WORKFLOW_CONFIG_PATH}\`._`]),
    ],
  };
}

function renderComponentsBlock(artifact: ArchitectureArtifact): DesignBlock {
  const components = asRecord(artifact.components);
  const lines: string[] = ["## Components", ""];

  if (Object.keys(components).length === 0) {
    lines.push(`_No components are declared in \`${ARCHITECTURE_ARTIFACT_PATH}\`._`);
  }

  for (const [componentId, rawComponent] of Object.entries(components)) {
    const component = asRecord(rawComponent) as ArchitectureComponent;
    lines.push(`### ${asText(component.title) || componentId} (\`${componentId}\`)`, "");
    lines.push(asText(component.responsibility), "");

    const boundaries = asStringArray(component.boundaries);
    if (boundaries.length > 0) {
      lines.push("**Boundaries**", "", ...renderBulletList(boundaries), "");
    }

    const dependsOn = asStringArray(component.depends_on);
    if (dependsOn.length > 0) {
      lines.push(`**Depends on:** ${dependsOn.map((value) => `\`${value}\``).join(", ")}`, "");
    }

    const implementation = asStringArray(asRecord(component.mapping).implementation);
    if (implementation.length > 0) {
      lines.push("**Implementation**", "", ...renderBulletList(implementation.map((value) => `\`${value}\``)), "");
    }
  }

  return { id: "components", heading: "## Components", sources: [ARCHITECTURE_ARTIFACT_PATH], lines: trimTrailingBlankLines(lines) };
}

function renderDataFlowsBlock(artifact: ArchitectureArtifact): DesignBlock {
  const dataFlows = asRecord(artifact.data_flows);
  const lines: string[] = ["## Data Flows", ""];

  if (Object.keys(dataFlows).length === 0) {
    lines.push(`_No data flows are declared in \`${ARCHITECTURE_ARTIFACT_PATH}\`._`);
  }

  for (const [flowId, rawFlow] of Object.entries(dataFlows)) {
    const flow = asRecord(rawFlow) as ArchitectureDataFlow;
    lines.push(`### ${asText(flow.title) || flowId} (\`${flowId}\`)`, "");
    lines.push(`**Trigger:** ${asText(flow.trigger)}`, "");

    const components = asStringArray(flow.components);
    if (components.length > 0) {
      lines.push(`**Components:** ${components.map((value) => `\`${value}\``).join(" → ")}`, "");
    }

    const steps = asStringArray(flow.steps);
    if (steps.length > 0) {
      lines.push(...steps.map((step, index) => `${index + 1}. ${step}`), "");
    }
  }

  return { id: "data-flows", heading: "## Data Flows", sources: [ARCHITECTURE_ARTIFACT_PATH], lines: trimTrailingBlankLines(lines) };
}

function renderDecisionsBlock(artifact: ArchitectureArtifact): DesignBlock {
  const decisions = asRecord(artifact.decisions);
  const lines: string[] = ["## Architecture Decisions", ""];

  if (Object.keys(decisions).length === 0) {
    lines.push(`_No architecture decisions are declared in \`${ARCHITECTURE_ARTIFACT_PATH}\`._`);
  }

  for (const [decisionId, rawDecision] of Object.entries(decisions)) {
    const decision = asRecord(rawDecision) as ArchitectureDecision;
    lines.push(`### ${asText(decision.title) || decisionId} (\`${decisionId}\`)`, "");
    lines.push(`**Status:** ${asText(decision.status)}`, "");
    lines.push(asText(decision.statement), "");
    lines.push(`**Rationale:** ${asText(decision.rationale)}`, "");

    const alternatives = asStringArray(decision.alternatives);
    if (alternatives.length > 0) {
      lines.push("**Alternatives considered**", "", ...renderBulletList(alternatives), "");
    }
  }

  return {
    id: "decisions",
    heading: "## Architecture Decisions",
    sources: [ARCHITECTURE_ARTIFACT_PATH],
    lines: trimTrailingBlankLines(lines),
  };
}

function renderSpecificationSurfaceBlock(rootDir: string): DesignBlock {
  const index = readYamlIfPresent<{ specs?: unknown }>(path.join(rootDir, STRICT_WORKFLOW_DIR, "specs", "INDEX.yaml"), SPEC_INDEX_PATH);
  const rawSpecs = index?.specs;
  const specs = Array.isArray(rawSpecs) ? rawSpecs : [];
  const lines: string[] = [
    "## Specification Surface",
    "",
    `Projected from \`${SPEC_INDEX_PATH}\` and the main specs it references.`,
    "",
  ];

  if (specs.length === 0) {
    lines.push(`_No strict main specs are registered in \`${SPEC_INDEX_PATH}\`._`);
    return {
      id: "specification-surface",
      heading: "## Specification Surface",
      sources: [SPEC_INDEX_PATH],
      lines: trimTrailingBlankLines(lines),
    };
  }

  lines.push("| Spec | ID | Requirements | Implementation files | Test files |", "| --- | --- | --- | --- | --- |");

  for (const rawSpec of specs) {
    const spec = asRecord(rawSpec);
    const specId = asText(spec.id);
    const specPath = asText(spec.path);
    const specTitle = asText(spec.title) || specId;
    const mainSpec = specPath
      ? readYamlIfPresent<{ requirements?: unknown; mapping?: unknown }>(path.join(rootDir, specPath), specPath)
      : null;

    const requirementCount = mainSpec ? Object.keys(asRecord(mainSpec.requirements)).length : null;
    const mapping = asRecord(mainSpec?.mapping);
    const implementationCount = mainSpec ? asStringArray(mapping.implementation).length : null;
    const testCount = mainSpec ? asStringArray(mapping.tests).length : null;
    const titleCell = specPath ? `[${specTitle}](${specPath})` : specTitle;

    lines.push(
      `| ${titleCell} | \`${specId}\` | ${requirementCount ?? "—"} | ${implementationCount ?? "—"} | ${testCount ?? "—"} |`,
    );
  }

  return {
    id: "specification-surface",
    heading: "## Specification Surface",
    sources: [SPEC_INDEX_PATH],
    lines: trimTrailingBlankLines(lines),
  };
}

function renderTechnicalStandardsBlock(rootDir: string): DesignBlock {
  const techFiles = listTechFiles(path.join(rootDir, STRICT_WORKFLOW_DIR, "tech"));
  const lines: string[] = [
    "## Technical Standards",
    "",
    `Projected from \`${TECH_DIR_PATH}\`. MUST rules are binding; SHOULD rules are the default.`,
    "",
  ];

  if (techFiles.length === 0) {
    lines.push(`_No technical standards are declared in \`${TECH_DIR_PATH}\`._`);
    return {
      id: "technical-standards",
      heading: "## Technical Standards",
      sources: [TECH_DIR_PATH],
      lines: trimTrailingBlankLines(lines),
    };
  }

  for (const techFile of techFiles) {
    const artifactPath = normalizeRepoRelativePath(rootDir, techFile);
    const standardDoc = readYamlIfPresent<{ standard?: unknown; rules?: unknown }>(techFile, artifactPath);
    if (!standardDoc) continue;

    const standard = asRecord(standardDoc.standard);
    const standardId = asText(standard.id);
    const title = asText(standard.title) || standardId;
    const category = asText(standard.category);

    lines.push(`### [${title}](${artifactPath}) (\`${standardId}\`) — ${category}`, "");
    for (const [ruleId, rawRule] of Object.entries(asRecord(standardDoc.rules))) {
      const rule = asRecord(rawRule);
      lines.push(`- **${asText(rule.strength)}** \`${ruleId}\` — ${asText(rule.statement)}`);
    }
    lines.push("");
  }

  return {
    id: "technical-standards",
    heading: "## Technical Standards",
    sources: [TECH_DIR_PATH],
    lines: trimTrailingBlankLines(lines),
  };
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const result = [...lines];
  while (result.length > 0 && result[result.length - 1] === "") {
    result.pop();
  }
  return result;
}

function buildDesignBlocks(rootDir: string, artifact: ArchitectureArtifact): DesignBlock[] {
  return [
    renderHeaderBlock(artifact),
    renderOverviewBlock(rootDir),
    renderComponentsBlock(artifact),
    renderDataFlowsBlock(artifact),
    renderDecisionsBlock(artifact),
    renderSpecificationSurfaceBlock(rootDir),
    renderTechnicalStandardsBlock(rootDir),
  ];
}

function blocksToDocument(blocks: DesignBlock[]): string {
  return blocks.map((block) => block.lines.join("\n")).join("\n\n") + "\n";
}

/**
 * Splits an on-disk document at the same headings the renderer emits so each block can be compared
 * to its rendered counterpart. Returns null when the headings are missing or reordered, which makes
 * per-source attribution impossible and forces the caller to report every source as stale.
 */
function splitDocumentIntoBlockTexts(content: string, blocks: DesignBlock[]): string[] | null {
  const lines = content.split("\n");
  const startIndexes: number[] = [0];

  let searchFrom = 0;
  for (const block of blocks.slice(1)) {
    const headingIndex = lines.indexOf(block.heading as string, searchFrom);
    if (headingIndex === -1) return null;
    startIndexes.push(headingIndex);
    searchFrom = headingIndex + 1;
  }

  return startIndexes.map((startIndex, position) => {
    const endIndex = position + 1 < startIndexes.length ? startIndexes[position + 1] : lines.length;
    return lines.slice(startIndex, endIndex).join("\n").replace(/\n+$/, "");
  });
}

function allSources(blocks: DesignBlock[]): string[] {
  return [...new Set(blocks.flatMap((block) => block.sources))];
}

/**
 * Called only when the document already differs from what the sources render. Block comparison
 * ignores blank-line padding between sections, so a difference that lives purely in that padding
 * matches every block; naming no source at all would contradict the drift report, so the whole
 * source list stands in.
 */
function collectStaleSources(blocks: DesignBlock[], diskContent: string): string[] {
  const diskBlockTexts = splitDocumentIntoBlockTexts(diskContent, blocks);
  if (!diskBlockTexts) {
    return allSources(blocks);
  }

  const stale = new Set<string>();
  blocks.forEach((block, index) => {
    if (block.lines.join("\n") === diskBlockTexts[index]) return;
    block.sources.forEach((source) => stale.add(source));
  });

  return stale.size > 0 ? [...stale] : allSources(blocks);
}

export function generateDesignDocument(
  rootDir: string,
  options: { check?: boolean; outputPath?: string } = {},
): DesignGenerateResult {
  const { artifact, diagnostics } = loadArchitectureArtifact(rootDir);
  if (diagnostics.length > 0) {
    const details = diagnostics.map((diagnostic) => `${diagnostic.fieldPath}: ${diagnostic.message}`).join("; ");
    throw new DesignSourceError(`architecture artifact does not validate: ${ARCHITECTURE_ARTIFACT_PATH}: ${details}`);
  }

  const blocks = buildDesignBlocks(rootDir, artifact);
  const content = blocksToDocument(blocks);
  const sources = allSources(blocks);
  const relativeOutputPath = (options.outputPath ?? DEFAULT_DESIGN_DOCUMENT_PATH).replaceAll("\\", "/");

  if (path.isAbsolute(relativeOutputPath)) {
    throw new DesignSourceError(`design document output path must be repo-relative, got '${relativeOutputPath}'`);
  }
  const absoluteOutputPath = path.resolve(rootDir, relativeOutputPath);
  const normalizedOutputPath = normalizeRepoRelativePath(rootDir, absoluteOutputPath);
  if (normalizedOutputPath === ".." || normalizedOutputPath.startsWith("../")) {
    throw new DesignSourceError(`design document output path cannot traverse outside the repository, got '${relativeOutputPath}'`);
  }

  if (options.check) {
    const base = { outputPath: normalizedOutputPath, mode: "check", written: false, sources } as const;
    if (!existsSync(absoluteOutputPath)) {
      return { ...base, documentExists: false, current: false, staleSources: sources };
    }
    const diskContent = readFileSync(absoluteOutputPath, "utf8");
    if (diskContent === content) {
      return { ...base, documentExists: true, current: true, staleSources: [] };
    }
    return { ...base, documentExists: true, current: false, staleSources: collectStaleSources(blocks, diskContent) };
  }

  mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, content, "utf8");
  return {
    outputPath: normalizedOutputPath,
    mode: "write",
    written: true,
    documentExists: true,
    current: true,
    sources,
    staleSources: [],
  };
}

export function getDesignStatus(rootDir: string): DesignStatusResult {
  const { artifact, diagnostics } = loadArchitectureArtifact(rootDir);
  const components = asRecord(artifact.components);
  const mappingDrift: DesignMappingDrift[] = [];

  for (const [componentId, rawComponent] of Object.entries(components)) {
    const implementation = asStringArray(asRecord(asRecord(rawComponent).mapping).implementation);
    for (const mappedPath of implementation) {
      if (!existsSync(path.join(rootDir, mappedPath))) {
        mappingDrift.push({ component: componentId, path: mappedPath });
      }
    }
  }

  return {
    artifactPath: ARCHITECTURE_ARTIFACT_PATH,
    exists: true,
    valid: diagnostics.length === 0,
    diagnostics,
    componentCount: Object.keys(components).length,
    dataFlowCount: Object.keys(asRecord(artifact.data_flows)).length,
    decisionCount: Object.keys(asRecord(artifact.decisions)).length,
    mappingDrift,
  };
}
