import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  DocumentSourceError,
  STRICT_WORKFLOW_DIR,
  asRecord,
  asStringArray,
  asText,
  renderBlocksToDocument,
  renderBulletList,
  trimTrailingBlankLines,
  type DocumentBlock,
  type DocumentRenderResult,
} from "./document-render.js";
import { loadBundledSchemaByArtifactType, validateArtifact, type ValidationDiagnostic } from "./validation.js";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";

const DESIGN_SYSTEM_ARTIFACT_PATH = `${STRICT_WORKFLOW_DIR}/design-system.yaml`;

export const DEFAULT_DESIGN_DOCUMENT_PATH = "DESIGN.md";
/** Entry point named in the missing-artifact error so operators know how to create the source. */
export const DESIGN_AUTHORING_ENTRY_POINT = "/strict-spec-design";

/**
 * Token groups the schema fixes, in the order the design.md format renders them. The renderer walks
 * this list rather than the artifact's key order so two artifacts declaring the same groups always
 * produce the same section order.
 */
const TOKEN_GROUPS = [
  { key: "colors", heading: "## Colors" },
  { key: "typography", heading: "## Typography" },
  { key: "layout", heading: "## Layout" },
  { key: "elevation", heading: "## Elevation & Depth" },
  { key: "shapes", heading: "## Shapes" },
] as const;

type DesignSystemArtifact = {
  design_system?: { id?: unknown; title?: unknown };
  tokens?: Record<string, unknown>;
  components?: Record<string, unknown>;
  guidance?: { overview?: unknown; do?: unknown; dont?: unknown };
};

export type DesignSystemMappingDrift = {
  component: string;
  path: string;
  kind: "implementation" | "snapshot";
};

export type DesignSystemStatusResult = {
  artifactPath: string;
  exists: boolean;
  valid: boolean;
  diagnostics: ValidationDiagnostic[];
  tokenGroupCount: number;
  tokenCount: number;
  componentCount: number;
  mappingDrift: DesignSystemMappingDrift[];
};

export type DesignGenerateResult = DocumentRenderResult;

export function getDesignSystemArtifactPath(rootDir: string): string {
  return path.join(rootDir, STRICT_WORKFLOW_DIR, "design-system.yaml");
}

/**
 * Reads and schema-validates the design-system artifact. Both design-generate and design-status
 * depend on it, so the missing-artifact message names the path and the entry point that creates it.
 */
function loadDesignSystemArtifact(rootDir: string): {
  artifact: DesignSystemArtifact;
  diagnostics: ValidationDiagnostic[];
} {
  const absolutePath = getDesignSystemArtifactPath(rootDir);
  if (!existsSync(absolutePath)) {
    throw new DocumentSourceError(
      `design-system artifact is missing: ${DESIGN_SYSTEM_ARTIFACT_PATH}; run ${DESIGN_AUTHORING_ENTRY_POINT} to author it`,
    );
  }

  let artifact: unknown;
  try {
    artifact = parseYamlDocument<unknown>(readFileSync(absolutePath, "utf8"), { source: DESIGN_SYSTEM_ARTIFACT_PATH });
  } catch (error) {
    throw new DocumentSourceError(
      `design-system artifact is not valid YAML: ${DESIGN_SYSTEM_ARTIFACT_PATH}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const schema = loadBundledSchemaByArtifactType("design_system");
  const result = validateArtifact(schema, artifact, DESIGN_SYSTEM_ARTIFACT_PATH);
  return { artifact: (artifact ?? {}) as DesignSystemArtifact, diagnostics: result.diagnostics };
}

/** Token groups that are present and non-empty, in the fixed render order. */
function declaredTokenGroups(artifact: DesignSystemArtifact): { key: string; heading: string; entries: Record<string, unknown> }[] {
  const tokens = asRecord(artifact.tokens);
  return TOKEN_GROUPS.map((group) => ({
    key: group.key,
    heading: group.heading,
    entries: asRecord(tokens[group.key]),
  })).filter((group) => Object.keys(group.entries).length > 0);
}

/**
 * The design.md interchange format opens with machine-readable tokens, so the front matter leads the
 * file and the generated banner follows it. Only declared token groups are emitted, which keeps the
 * front matter an accurate description of the artifact rather than a shape with empty slots.
 */
function renderHeaderBlock(artifact: DesignSystemArtifact): DocumentBlock {
  const title = asText(artifact.design_system?.title) || "Design System";
  const groups = declaredTokenGroups(artifact);
  const frontMatter: Record<string, unknown> = {};
  for (const group of groups) {
    frontMatter[group.key] = group.entries;
  }

  const frontMatterLines =
    groups.length > 0 ? stringifyYamlDocument(frontMatter).replace(/\n+$/, "").split("\n") : [];

  return {
    id: "header",
    heading: null,
    sources: [DESIGN_SYSTEM_ARTIFACT_PATH],
    lines: [
      "---",
      ...frontMatterLines,
      "---",
      "",
      `# ${title}`,
      "",
      "> **Generated file — do not edit by hand.**",
      "> Rendered by `strict-spec-cli design-generate` from these source artifacts:",
      `> - \`${DESIGN_SYSTEM_ARTIFACT_PATH}\``,
      ">",
      "> Change the sources and re-render; edits made here are discarded by the next render.",
    ],
  };
}

function renderOverviewBlock(artifact: DesignSystemArtifact): DocumentBlock {
  const overview = asText(artifact.guidance?.overview);
  return {
    id: "overview",
    heading: "## Overview",
    sources: [DESIGN_SYSTEM_ARTIFACT_PATH],
    lines: [
      "## Overview",
      "",
      ...(overview
        ? overview.split("\n").map((line) => line.trimEnd())
        : [`_No design overview is recorded in \`${DESIGN_SYSTEM_ARTIFACT_PATH}\`._`]),
    ],
  };
}

/** Renders a scalar token group as a value table. */
function renderScalarTokenBlock(groupKey: string, heading: string, entries: Record<string, unknown>): DocumentBlock {
  const lines: string[] = [heading, "", "| Token | Value |", "| --- | --- |"];
  for (const [tokenId, value] of Object.entries(entries)) {
    lines.push(`| \`${tokenId}\` | \`${String(value)}\` |`);
  }

  return {
    id: `tokens-${groupKey}`,
    heading,
    sources: [DESIGN_SYSTEM_ARTIFACT_PATH],
    lines: trimTrailingBlankLines(lines),
  };
}

/** Typography tokens are objects rather than scalars, so each declared face gets its own field list. */
function renderTypographyBlock(heading: string, entries: Record<string, unknown>): DocumentBlock {
  const lines: string[] = [heading, ""];
  for (const [tokenId, rawValue] of Object.entries(entries)) {
    const value = asRecord(rawValue);
    lines.push(`### \`${tokenId}\``, "");
    for (const [field, fieldValue] of Object.entries(value)) {
      lines.push(`- **${field}:** \`${String(fieldValue)}\``);
    }
    lines.push("");
  }

  return {
    id: "tokens-typography",
    heading,
    sources: [DESIGN_SYSTEM_ARTIFACT_PATH],
    lines: trimTrailingBlankLines(lines),
  };
}

function renderComponentsBlock(artifact: DesignSystemArtifact): DocumentBlock {
  const components = asRecord(artifact.components);
  const lines: string[] = ["## Components", ""];

  if (Object.keys(components).length === 0) {
    lines.push(`_No components are declared in \`${DESIGN_SYSTEM_ARTIFACT_PATH}\`._`);
  }

  for (const [componentId, rawComponent] of Object.entries(components)) {
    const component = asRecord(rawComponent);
    lines.push(`### ${asText(component.title) || componentId} (\`${componentId}\`)`, "");

    const description = asText(component.description);
    if (description) {
      lines.push(description, "");
    }

    const componentTokens = asRecord(component.tokens);
    if (Object.keys(componentTokens).length > 0) {
      lines.push("| Property | Token |", "| --- | --- |");
      for (const [property, token] of Object.entries(componentTokens)) {
        lines.push(`| \`${property}\` | \`${String(token)}\` |`);
      }
      lines.push("");
    }

    const mapping = asRecord(component.mapping);
    const implementation = asStringArray(mapping.implementation);
    if (implementation.length > 0) {
      lines.push("**Implementation**", "", ...renderBulletList(implementation.map((value) => `\`${value}\``)), "");
    }

    const snapshots = asStringArray(mapping.snapshots);
    if (snapshots.length > 0) {
      lines.push("**Visual regression snapshots**", "", ...renderBulletList(snapshots.map((value) => `\`${value}\``)), "");
    }
  }

  return {
    id: "components",
    heading: "## Components",
    sources: [DESIGN_SYSTEM_ARTIFACT_PATH],
    lines: trimTrailingBlankLines(lines),
  };
}

function renderGuidanceBlock(artifact: DesignSystemArtifact): DocumentBlock {
  const dos = asStringArray(artifact.guidance?.do);
  const donts = asStringArray(artifact.guidance?.dont);

  const lines: string[] = ["## Do's and Don'ts", ""];
  if (dos.length === 0 && donts.length === 0) {
    lines.push(`_No design guidance is declared in \`${DESIGN_SYSTEM_ARTIFACT_PATH}\`._`);
  }
  if (dos.length > 0) {
    lines.push("**Do**", "", ...renderBulletList(dos), "");
  }
  if (donts.length > 0) {
    lines.push("**Don't**", "", ...renderBulletList(donts), "");
  }

  return {
    id: "guidance",
    heading: "## Do's and Don'ts",
    sources: [DESIGN_SYSTEM_ARTIFACT_PATH],
    lines: trimTrailingBlankLines(lines),
  };
}

function buildDesignSystemBlocks(artifact: DesignSystemArtifact): DocumentBlock[] {
  const blocks: DocumentBlock[] = [renderHeaderBlock(artifact), renderOverviewBlock(artifact)];

  for (const group of declaredTokenGroups(artifact)) {
    blocks.push(
      group.key === "typography"
        ? renderTypographyBlock(group.heading, group.entries)
        : renderScalarTokenBlock(group.key, group.heading, group.entries),
    );
  }

  blocks.push(renderComponentsBlock(artifact), renderGuidanceBlock(artifact));

  return blocks;
}

export function generateDesignDocument(
  rootDir: string,
  options: { check?: boolean; outputPath?: string } = {},
): DesignGenerateResult {
  const { artifact, diagnostics } = loadDesignSystemArtifact(rootDir);
  if (diagnostics.length > 0) {
    const details = diagnostics.map((diagnostic) => `${diagnostic.fieldPath}: ${diagnostic.message}`).join("; ");
    throw new DocumentSourceError(`design-system artifact does not validate: ${DESIGN_SYSTEM_ARTIFACT_PATH}: ${details}`);
  }

  const blocks = buildDesignSystemBlocks(artifact);
  return renderBlocksToDocument(rootDir, blocks, {
    check: options.check,
    outputPath: options.outputPath,
    defaultOutputPath: DEFAULT_DESIGN_DOCUMENT_PATH,
    documentLabel: "design document",
  });
}

export function getDesignSystemStatus(rootDir: string): DesignSystemStatusResult {
  const { artifact, diagnostics } = loadDesignSystemArtifact(rootDir);
  const tokens = asRecord(artifact.tokens);
  const components = asRecord(artifact.components);
  const mappingDrift: DesignSystemMappingDrift[] = [];

  let tokenCount = 0;
  let tokenGroupCount = 0;
  for (const group of TOKEN_GROUPS) {
    const entries = asRecord(tokens[group.key]);
    const entryCount = Object.keys(entries).length;
    if (entryCount === 0) continue;
    tokenGroupCount += 1;
    tokenCount += entryCount;
  }

  for (const [componentId, rawComponent] of Object.entries(components)) {
    const mapping = asRecord(asRecord(rawComponent).mapping);
    for (const mappedPath of asStringArray(mapping.implementation)) {
      if (!existsSync(path.join(rootDir, mappedPath))) {
        mappingDrift.push({ component: componentId, path: mappedPath, kind: "implementation" });
      }
    }
    for (const snapshotPath of asStringArray(mapping.snapshots)) {
      if (!existsSync(path.join(rootDir, snapshotPath))) {
        mappingDrift.push({ component: componentId, path: snapshotPath, kind: "snapshot" });
      }
    }
  }

  return {
    artifactPath: DESIGN_SYSTEM_ARTIFACT_PATH,
    exists: true,
    valid: diagnostics.length === 0,
    diagnostics,
    tokenGroupCount,
    tokenCount,
    componentCount: Object.keys(components).length,
    mappingDrift,
  };
}
