import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { normalizeRepoRelativePath } from "./cli/fs.js";
import { parseYamlDocument } from "./yaml.js";

export const STRICT_WORKFLOW_DIR = ".strict-spec-driven";

/**
 * A rendered section of a generated document together with the source artifacts that produce it.
 * Check mode compares blocks individually so drift can name the source that went stale rather than
 * only reporting that the whole document differs.
 */
export type DocumentBlock = {
  id: string;
  /** Heading line that starts the block on disk, or null for the leading title-and-banner block. */
  heading: string | null;
  sources: string[];
  lines: string[];
};

export type DocumentRenderResult = {
  outputPath: string;
  mode: "write" | "check";
  written: boolean;
  /** False when check mode found no document at the output path, which is reported apart from drift. */
  documentExists: boolean;
  current: boolean;
  sources: string[];
  staleSources: string[];
};

export class DocumentSourceError extends Error {}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function readYamlIfPresent<T>(absolutePath: string, artifactPath: string): T | null {
  if (!existsSync(absolutePath)) return null;
  try {
    return parseYamlDocument<T>(readFileSync(absolutePath, "utf8"), { source: artifactPath });
  } catch {
    return null;
  }
}

export function renderBulletList(values: string[]): string[] {
  return values.map((value) => `- ${value}`);
}

export function trimTrailingBlankLines(lines: string[]): string[] {
  const result = [...lines];
  while (result.length > 0 && result[result.length - 1] === "") {
    result.pop();
  }
  return result;
}

export function blocksToDocument(blocks: DocumentBlock[]): string {
  return blocks.map((block) => block.lines.join("\n")).join("\n\n") + "\n";
}

/**
 * Splits an on-disk document at the same headings the renderer emits so each block can be compared
 * to its rendered counterpart. Returns null when the headings are missing or reordered, which makes
 * per-source attribution impossible and forces the caller to report every source as stale.
 */
function splitDocumentIntoBlockTexts(content: string, blocks: DocumentBlock[]): string[] | null {
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

export function allSources(blocks: DocumentBlock[]): string[] {
  return [...new Set(blocks.flatMap((block) => block.sources))];
}

/**
 * Called only when the document already differs from what the sources render. Block comparison
 * ignores blank-line padding between sections, so a difference that lives purely in that padding
 * matches every block; naming no source at all would contradict the drift report, so the whole
 * source list stands in.
 */
function collectStaleSources(blocks: DocumentBlock[], diskContent: string): string[] {
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

/**
 * Writes or checks a document assembled from blocks. `documentLabel` names the document family in
 * output-path errors so each renderer reports its own document rather than a shared generic name.
 */
export function renderBlocksToDocument(
  rootDir: string,
  blocks: DocumentBlock[],
  options: { check?: boolean; outputPath?: string; defaultOutputPath: string; documentLabel: string },
): DocumentRenderResult {
  const content = blocksToDocument(blocks);
  const sources = allSources(blocks);
  const relativeOutputPath = (options.outputPath ?? options.defaultOutputPath).replaceAll("\\", "/");

  if (path.isAbsolute(relativeOutputPath)) {
    throw new DocumentSourceError(
      `${options.documentLabel} output path must be repo-relative, got '${relativeOutputPath}'`,
    );
  }
  const absoluteOutputPath = path.resolve(rootDir, relativeOutputPath);
  const normalizedOutputPath = normalizeRepoRelativePath(rootDir, absoluteOutputPath);
  if (normalizedOutputPath === ".." || normalizedOutputPath.startsWith("../")) {
    throw new DocumentSourceError(
      `${options.documentLabel} output path cannot traverse outside the repository, got '${relativeOutputPath}'`,
    );
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
