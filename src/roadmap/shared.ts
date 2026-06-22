import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { sortByDeterministicKey, toPosix } from "../diagnostics.js";
import { parseYamlFile } from "../yaml.js";
import {
  DECLARED_PLANNED_CHANGE_STATUSES,
  DECLARED_ROADMAP_STATUSES,
  STRICT_WORKFLOW_DIR,
  type DeclaredPlannedChangeStatus,
  type DeclaredRoadmapStatus,
  type RoadmapDiagnostic,
} from "./model.js";

export { toPosix };

export function normalizeRepoRelativePath(rootDir: string, absolutePath: string): string {
  return toPosix(path.relative(rootDir, absolutePath));
}

export function resolveStrictWorkflowPath(rootDir: string, workflowRelativePath: string): string {
  const normalized = toPosix(workflowRelativePath);
  if (normalized.startsWith(`${STRICT_WORKFLOW_DIR}/`)) {
    return path.join(rootDir, normalized);
  }
  return path.join(rootDir, STRICT_WORKFLOW_DIR, normalized);
}

export function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

export function makeDiagnostic(
  source: RoadmapDiagnostic["source"],
  artifactPath: string,
  fieldPath: string,
  message: string,
  expected?: string,
  actual?: string,
): RoadmapDiagnostic {
  return { source, artifactPath, fieldPath, message, expected, actual };
}

export function sortDiagnostics(diagnostics: RoadmapDiagnostic[]): RoadmapDiagnostic[] {
  return sortByDeterministicKey(
    diagnostics,
    (diagnostic) => [
      diagnostic.source,
      diagnostic.artifactPath,
      diagnostic.fieldPath,
      diagnostic.message,
      diagnostic.expected ?? "",
      diagnostic.actual ?? "",
    ],
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function listYamlFiles(directoryPath: string): string[] {
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
      if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        files.push(fullPath);
      }
    }
  }

  walk(directoryPath);
  return files;
}

export function isRepoRelativePath(value: string): boolean {
  if (path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(toPosix(value));
  return normalized !== ".." && !normalized.startsWith("../");
}

export function isDeclaredRoadmapStatus(value: unknown): value is DeclaredRoadmapStatus {
  return typeof value === "string" && DECLARED_ROADMAP_STATUSES.includes(value as DeclaredRoadmapStatus);
}

/**
 * Normalize a milestone status by treating `planned` as equivalent to `proposed`.
 * The two values are interchangeable aliases; downstream comparisons use the
 * canonical `proposed` form so derived-status reconciliation does not flag a
 * mismatch when a milestone declares `planned`.
 */
export function normalizeMilestoneStatus(status: DeclaredRoadmapStatus): DeclaredRoadmapStatus {
  return status === "planned" ? "proposed" : status;
}

export function isDeclaredPlannedChangeStatus(value: unknown): value is DeclaredPlannedChangeStatus {
  return typeof value === "string" && DECLARED_PLANNED_CHANGE_STATUSES.includes(value as DeclaredPlannedChangeStatus);
}

export function readYamlFile(filePath: string): unknown {
  return parseYamlFile<unknown>(filePath);
}
