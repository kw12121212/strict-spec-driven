import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import { listFilesRecursive, normalizeRepoRelativePath } from "./cli/fs.js";
import {
  DocumentSourceError,
  STRICT_WORKFLOW_DIR,
  asRecord,
  asStringArray,
  asText,
  readYamlIfPresent,
  renderBlocksToDocument,
  renderBulletList,
  trimTrailingBlankLines,
  type DocumentBlock,
  type DocumentRenderResult,
} from "./document-render.js";
import { loadBundledSchemaByArtifactType, validateArtifact, type ValidationDiagnostic } from "./validation.js";
import { parseYamlDocument } from "./yaml.js";

const ARCHITECTURE_ARTIFACT_PATH = `${STRICT_WORKFLOW_DIR}/architecture.yaml`;
const WORKFLOW_CONFIG_PATH = `${STRICT_WORKFLOW_DIR}/config.yaml`;
const SPEC_INDEX_PATH = `${STRICT_WORKFLOW_DIR}/specs/INDEX.yaml`;
const TECH_DIR_PATH = `${STRICT_WORKFLOW_DIR}/tech/`;
const EXCLUDED_TECH_BASENAMES = new Set(["INDEX.yaml"]);

export const DEFAULT_ARCHITECTURE_DOCUMENT_PATH = "ARCHITECTURE.md";
/** Entry point named in the missing-artifact error so operators know how to create the source. */
export const ARCHITECTURE_AUTHORING_ENTRY_POINT = "/strict-spec-architecture";

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

export type ArchitectureMappingDrift = {
  component: string;
  path: string;
};

export type ArchitectureStatusResult = {
  artifactPath: string;
  exists: boolean;
  valid: boolean;
  diagnostics: ValidationDiagnostic[];
  componentCount: number;
  dataFlowCount: number;
  decisionCount: number;
  mappingDrift: ArchitectureMappingDrift[];
};

export type ArchitectureGenerateResult = DocumentRenderResult;

export function getArchitectureArtifactPath(rootDir: string): string {
  return path.join(rootDir, STRICT_WORKFLOW_DIR, "architecture.yaml");
}

/**
 * Reads and schema-validates the architecture artifact. Both architecture-generate and architecture-status
 * depend on it, so the missing-artifact message names the path and the entry point that creates it.
 */
function loadArchitectureArtifact(rootDir: string): { artifact: ArchitectureArtifact; diagnostics: ValidationDiagnostic[] } {
  const absolutePath = getArchitectureArtifactPath(rootDir);
  if (!existsSync(absolutePath)) {
    throw new DocumentSourceError(
      `architecture artifact is missing: ${ARCHITECTURE_ARTIFACT_PATH}; run ${ARCHITECTURE_AUTHORING_ENTRY_POINT} to author it`,
    );
  }

  let artifact: unknown;
  try {
    artifact = parseYamlDocument<unknown>(readFileSync(absolutePath, "utf8"), { source: ARCHITECTURE_ARTIFACT_PATH });
  } catch (error) {
    throw new DocumentSourceError(
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

function renderHeaderBlock(artifact: ArchitectureArtifact): DocumentBlock {
  const title = asText(artifact.architecture?.title) || "Project Architecture";
  return {
    id: "header",
    heading: null,
    sources: [ARCHITECTURE_ARTIFACT_PATH],
    lines: [
      `# ${title}`,
      "",
      "> **Generated file — do not edit by hand.**",
      "> Rendered by `strict-spec-cli architecture-generate` from these source artifacts:",
      `> - \`${ARCHITECTURE_ARTIFACT_PATH}\``,
      `> - \`${WORKFLOW_CONFIG_PATH}\``,
      `> - \`${SPEC_INDEX_PATH}\``,
      `> - \`${TECH_DIR_PATH}\``,
      ">",
      "> Change the sources and re-render; edits made here are discarded by the next render.",
    ],
  };
}

function renderOverviewBlock(rootDir: string): DocumentBlock {
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

function renderComponentsBlock(artifact: ArchitectureArtifact): DocumentBlock {
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

function renderDataFlowsBlock(artifact: ArchitectureArtifact): DocumentBlock {
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

function renderDecisionsBlock(artifact: ArchitectureArtifact): DocumentBlock {
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

function renderSpecificationSurfaceBlock(rootDir: string): DocumentBlock {
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

function renderTechnicalStandardsBlock(rootDir: string): DocumentBlock {
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

function buildArchitectureBlocks(rootDir: string, artifact: ArchitectureArtifact): DocumentBlock[] {
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

export function generateArchitectureDocument(
  rootDir: string,
  options: { check?: boolean; outputPath?: string } = {},
): ArchitectureGenerateResult {
  const { artifact, diagnostics } = loadArchitectureArtifact(rootDir);
  if (diagnostics.length > 0) {
    const details = diagnostics.map((diagnostic) => `${diagnostic.fieldPath}: ${diagnostic.message}`).join("; ");
    throw new DocumentSourceError(`architecture artifact does not validate: ${ARCHITECTURE_ARTIFACT_PATH}: ${details}`);
  }

  const blocks = buildArchitectureBlocks(rootDir, artifact);
  return renderBlocksToDocument(rootDir, blocks, {
    check: options.check,
    outputPath: options.outputPath,
    defaultOutputPath: DEFAULT_ARCHITECTURE_DOCUMENT_PATH,
    documentLabel: "architecture document",
  });
}

export function getArchitectureStatus(rootDir: string): ArchitectureStatusResult {
  const { artifact, diagnostics } = loadArchitectureArtifact(rootDir);
  const components = asRecord(artifact.components);
  const mappingDrift: ArchitectureMappingDrift[] = [];

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
