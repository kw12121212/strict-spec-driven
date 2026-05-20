import { existsSync, statSync } from "fs";
import path from "path";
import { stringifyYamlDocument } from "./yaml.js";
import {
  ROADMAP_DIR,
  ROADMAP_INDEX_PATH,
  type RoadmapDiagnostic,
  type RoadmapMilestoneStatus,
  type RoadmapPlannedChangeStatus,
  type RoadmapStatusResult,
  type RoadmapSyncResult,
} from "./roadmap/model.js";
import { ensureTrailingNewline, makeDiagnostic, sortDiagnostics } from "./roadmap/shared.js";
import { loadRoadmap } from "./roadmap/load.js";
import {
  appendRoadmapCrossFileDiagnostics,
  buildMilestoneStatus,
  getChangeStateIndex,
  getMergedPlannedChangesForMilestone,
  getStandalonePlannedChangesForMilestone,
  orderMilestoneStatuses,
} from "./roadmap/status.js";
import {
  buildCanonicalMilestoneArtifact,
  buildCanonicalPlannedChangeArtifact,
  buildMaterializedPlannedChangeArtifact,
  buildRoadmapIndexArtifact,
  ensurePlannedChangeDirectory,
  materializedPlannedChangePath,
  writeFileIfChanged,
} from "./roadmap/sync.js";

export type {
  RoadmapDiagnostic,
  RoadmapMilestoneStatus,
  RoadmapPlannedChangeStatus,
  RoadmapStatusResult,
  RoadmapSyncResult,
} from "./roadmap/model.js";

export type RoadmapSyncOptions = {
  materializePlannedChanges?: boolean;
};

type TextTableColumn<Row> = {
  header: string;
  value: (row: Row) => string;
  align?: "left" | "right";
};

function padTableCell(value: string, width: number, align: "left" | "right" = "left"): string {
  return align === "right" ? value.padStart(width, " ") : value.padEnd(width, " ");
}

function renderTextTable<Row>(rows: Row[], columns: TextTableColumn<Row>[]): string[] {
  const widths = columns.map((column) =>
    Math.max(column.header.length, ...rows.map((row) => column.value(row).length))
  );
  const header = columns.map((column, index) => padTableCell(column.header, widths[index], column.align)).join("  ");
  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows.map((row) =>
    columns
      .map((column, index) => padTableCell(column.value(row), widths[index], column.align))
      .join("  ")
  );
  return [header, separator, ...body];
}

function appendWarnings(lines: string[], warnings: string[]): void {
  if (warnings.length === 0) return;
  lines.push("Warnings:");
  for (const warning of warnings) {
    lines.push(`- ${warning}`);
  }
  lines.push("");
}

function appendDiagnostics(lines: string[], diagnostics: RoadmapDiagnostic[]): void {
  if (diagnostics.length === 0) return;
  lines.push("Diagnostics:");
  for (const diagnostic of diagnostics) {
    lines.push(`- [${diagnostic.source}] ${diagnostic.artifactPath} ${diagnostic.fieldPath}`);
    lines.push(`  message: ${diagnostic.message}`);
    if (diagnostic.expected !== undefined) {
      lines.push(`  expected: ${diagnostic.expected}`);
    }
    if (diagnostic.actual !== undefined) {
      lines.push(`  actual: ${diagnostic.actual}`);
    }
  }
  lines.push("");
}

function milestoneIssueCount(milestone: RoadmapMilestoneStatus): number {
  return milestone.mismatches.length
    + milestone.plannedChanges.reduce((count, plannedChange) => count + plannedChange.mismatches.length, 0);
}

function appendPlannedChangeDetail(lines: string[], plannedChange: RoadmapPlannedChangeStatus): void {
  lines.push(
    `  - ${plannedChange.id} | state=${plannedChange.state} | declared=${plannedChange.declaredStatus} | derived=${plannedChange.derivedStatus} | path=${plannedChange.path}`,
  );
  lines.push(`    summary: ${plannedChange.summary}`);
  if (plannedChange.mismatches.length === 0) return;
  for (const mismatch of plannedChange.mismatches) {
    lines.push(`    issue: ${mismatch}`);
  }
}

export function formatRoadmapOverview(result: RoadmapStatusResult): string {
  const lines: string[] = [`Roadmap overview (${result.valid ? "valid" : "invalid"})`, ""];
  appendWarnings(lines, result.warnings);
  appendDiagnostics(lines, result.diagnostics);

  lines.push("Milestone summary:");
  if (result.milestones.length === 0) {
    lines.push("(none)");
  } else {
    const summaryRows = renderTextTable(result.milestones, [
      { header: "ID", value: (milestone) => milestone.id },
      { header: "Declared", value: (milestone) => milestone.declaredStatus },
      { header: "Derived", value: (milestone) => milestone.derivedStatus },
      { header: "Planned", value: (milestone) => String(milestone.plannedChanges.length), align: "right" },
      {
        header: "Complete",
        value: (milestone) => String(milestone.plannedChanges.filter((plannedChange) => plannedChange.derivedStatus === "complete").length),
        align: "right",
      },
      { header: "Issues", value: (milestone) => String(milestoneIssueCount(milestone)), align: "right" },
      { header: "Title", value: (milestone) => milestone.title },
    ]);
    lines.push(...summaryRows);
  }

  lines.push("");
  lines.push("Milestone detail:");
  if (result.milestones.length === 0) {
    lines.push("(none)");
  } else {
    for (const milestone of result.milestones) {
      lines.push(`[${milestone.id}] ${milestone.title}`);
      lines.push(`path: ${milestone.path}`);
      lines.push(`goal: ${milestone.goal}`);
      lines.push(`status: declared=${milestone.declaredStatus} derived=${milestone.derivedStatus}`);
      if (milestone.mismatches.length > 0) {
        for (const mismatch of milestone.mismatches) {
          lines.push(`issue: ${mismatch}`);
        }
      }
      if (milestone.plannedChanges.length === 0) {
        lines.push("planned changes: (none)");
      } else {
        lines.push("planned changes:");
        for (const plannedChange of milestone.plannedChanges) {
          appendPlannedChangeDetail(lines, plannedChange);
        }
      }
      lines.push("");
    }
    while (lines[lines.length - 1] === "") {
      lines.pop();
    }
  }

  return `${lines.join("\n")}\n`;
}

export function getRoadmapStatus(rootDir: string): RoadmapStatusResult {
  const roadmap = loadRoadmap(rootDir);
  const changeStates = getChangeStateIndex(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates);
  const statusMap = new Map<string, RoadmapMilestoneStatus>();
  for (const milestone of roadmap.milestones) {
    const milestonePath = `roadmap/milestones/${milestone.relativeMilestonePath}`;
    const standalonePlannedChanges = getStandalonePlannedChangesForMilestone(roadmap, milestone);
    const plannedChangeEntries = getMergedPlannedChangesForMilestone(milestone, standalonePlannedChanges);
    statusMap.set(milestonePath, buildMilestoneStatus(milestone, changeStates, plannedChangeEntries));
  }

  const milestones = orderMilestoneStatuses(rootDir, roadmap, statusMap, ROADMAP_INDEX_PATH);
  const diagnostics = sortDiagnostics(roadmap.diagnostics);

  return {
    valid: diagnostics.length === 0,
    warnings: roadmap.warnings,
    diagnostics,
    milestones,
  };
}

export function syncRoadmap(rootDir: string, options: RoadmapSyncOptions = {}): RoadmapSyncResult {
  const roadmap = loadRoadmap(rootDir, {
    allowInlinePlannedChanges: options.materializePlannedChanges === true,
  });
  const changeStates = getChangeStateIndex(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates);
  const blockingDiagnostics = roadmap.diagnostics.filter((diagnostic) => diagnostic.artifactPath !== ROADMAP_INDEX_PATH);
  if (blockingDiagnostics.length > 0) {
    return {
      valid: false,
      warnings: roadmap.warnings,
      diagnostics: sortDiagnostics(blockingDiagnostics),
      updatedFiles: [],
      milestones: [],
    };
  }

  const roadmapDir = path.join(rootDir, ROADMAP_DIR);
  if (!existsSync(roadmapDir) || !statSync(roadmapDir).isDirectory()) {
    return {
      valid: false,
      warnings: roadmap.warnings,
      diagnostics: [
        makeDiagnostic("schema", ROADMAP_DIR, "$", "strict roadmap directory not found", ROADMAP_DIR, "missing"),
      ],
      updatedFiles: [],
      milestones: [],
    };
  }

  const updatedFiles: string[] = [];

  for (const milestone of roadmap.milestones) {
    const standalonePlannedChanges = getStandalonePlannedChangesForMilestone(roadmap, milestone);
    const plannedChangeEntries = getMergedPlannedChangesForMilestone(milestone, standalonePlannedChanges);
    const status = buildMilestoneStatus(milestone, changeStates, plannedChangeEntries);
    const materializedInlineIds = options.materializePlannedChanges
      ? new Set(Object.keys(milestone.artifact.planned_changes))
      : undefined;

    if (options.materializePlannedChanges) {
      for (const [id, entry] of Object.entries(milestone.artifact.planned_changes)) {
        const plannedChangePath = materializedPlannedChangePath(rootDir, milestone, id);
        ensurePlannedChangeDirectory(plannedChangePath);
        const plannedChangeArtifact = buildMaterializedPlannedChangeArtifact(milestone, id, entry, status);
        writeFileIfChanged(plannedChangePath, stringifyYamlDocument(plannedChangeArtifact), updatedFiles, rootDir);
      }
    }

    const nextArtifact = buildCanonicalMilestoneArtifact(milestone, status, {
      omitInlinePlannedChangeIds: materializedInlineIds,
    });
    writeFileIfChanged(milestone.absolutePath, stringifyYamlDocument(nextArtifact), updatedFiles, rootDir);
    milestone.artifact = nextArtifact;
    milestone.raw = ensureTrailingNewline(stringifyYamlDocument(nextArtifact));

    for (const plannedChange of standalonePlannedChanges) {
      const nextPlannedChangeArtifact = buildCanonicalPlannedChangeArtifact(plannedChange, status);
      writeFileIfChanged(plannedChange.absolutePath, stringifyYamlDocument(nextPlannedChangeArtifact), updatedFiles, rootDir);
      plannedChange.artifact = nextPlannedChangeArtifact;
      plannedChange.raw = ensureTrailingNewline(stringifyYamlDocument(nextPlannedChangeArtifact));
    }
  }

  const indexPath = path.join(rootDir, ROADMAP_INDEX_PATH);
  const nextIndex = buildRoadmapIndexArtifact(roadmap.milestones);
  writeFileIfChanged(indexPath, stringifyYamlDocument(nextIndex), updatedFiles, rootDir);

  const status = getRoadmapStatus(rootDir);
  return {
    valid: status.valid,
    warnings: status.warnings,
    diagnostics: status.diagnostics,
    updatedFiles,
    milestones: status.milestones,
  };
}
