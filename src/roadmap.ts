import { existsSync, renameSync, statSync } from "fs";
import path from "path";
import { stringifyYamlDocument } from "./yaml.js";
import {
  canonicalPlannedChangeFileName,
  ROADMAP_DIR,
  ROADMAP_INDEX_PATH,
  type RoadmapDiagnostic,
  type RoadmapRecommendResult,
  type RoadmapMilestoneStatus,
  type RoadmapPlannedChangeStatus,
  type RoadmapRecommendation,
  type RoadmapRecommendationCandidate,
  type RoadmapRecommendationSkip,
  type RoadmapStatusResult,
  type RoadmapSyncResult,
  type LoadedRoadmap,
} from "./roadmap/model.js";
import { ensureTrailingNewline, makeDiagnostic, normalizeRepoRelativePath, sortDiagnostics } from "./roadmap/shared.js";
import { loadArchivedPlannedChangeIds, loadRoadmap } from "./roadmap/load.js";
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
  resolveMilestoneOrderCollisions,
  writeFileIfChanged,
} from "./roadmap/sync.js";

export type {
  RoadmapDiagnostic,
  RoadmapRecommendResult,
  RoadmapMilestoneStatus,
  RoadmapPlannedChangeStatus,
  RoadmapRecommendation,
  RoadmapRecommendationCandidate,
  RoadmapRecommendationSkip,
  RoadmapStatusResult,
  RoadmapSyncResult,
} from "./roadmap/model.js";

export type RoadmapSyncOptions = {
  materializePlannedChanges?: boolean;
  fixNames?: boolean;
};

export type RoadmapSyncRenamedFile = {
  from: string;
  to: string;
};

export type RoadmapRecommendOptions = {
  milestoneId?: string;
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
  if (plannedChange.mismatches.length === 0) return;
  for (const mismatch of plannedChange.mismatches) {
    lines.push(`    issue: ${mismatch}`);
  }
}

type RoadmapStatusContext = {
  roadmap: LoadedRoadmap;
  warnings: string[];
  diagnostics: RoadmapDiagnostic[];
  milestones: RoadmapMilestoneStatus[];
};

function loadRoadmapStatusContext(rootDir: string): RoadmapStatusContext {
  const roadmap = loadRoadmap(rootDir);
  const changeStates = getChangeStateIndex(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates, loadArchivedPlannedChangeIds(rootDir));
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
    roadmap,
    warnings: roadmap.warnings,
    diagnostics,
    milestones,
  };
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
  const { warnings, diagnostics, milestones } = loadRoadmapStatusContext(rootDir);

  return {
    valid: diagnostics.length === 0,
    warnings,
    diagnostics,
    milestones,
  };
}

function createPlannedChangeStatusIndex(milestones: RoadmapMilestoneStatus[]): Map<string, RoadmapPlannedChangeStatus> {
  const index = new Map<string, RoadmapPlannedChangeStatus>();
  for (const milestone of milestones) {
    for (const plannedChange of milestone.plannedChanges) {
      index.set(plannedChange.id, plannedChange);
    }
  }
  return index;
}

function findPlannedChangeStatus(
  milestoneStatus: RoadmapMilestoneStatus,
  plannedChangeId: string,
  plannedChangePath: string,
): RoadmapPlannedChangeStatus | undefined {
  return milestoneStatus.plannedChanges.find(
    (plannedChange) => plannedChange.id === plannedChangeId && plannedChange.path === plannedChangePath,
  );
}

function buildCandidateSkipReasons(
  plannedChangeStatus: RoadmapPlannedChangeStatus,
  dependencyStatusIndex: Map<string, RoadmapPlannedChangeStatus>,
  dependencyIds: string[],
): RoadmapRecommendationSkip[] {
  const skipReasons: RoadmapRecommendationSkip[] = [];

  if (plannedChangeStatus.state === "active") {
    skipReasons.push({
      code: "workflow-state-active",
      message: "active strict change conflicts with this planned change",
    });
  } else if (plannedChangeStatus.state === "archived") {
    skipReasons.push({
      code: "workflow-state-archived",
      message: "planned change is already complete in archived strict workflow state",
    });
  } else if (plannedChangeStatus.state === "ambiguous") {
    skipReasons.push({
      code: "workflow-state-ambiguous",
      message: "planned change exists in both active and archived strict workflow state",
    });
  }

  for (const mismatch of plannedChangeStatus.mismatches) {
    skipReasons.push({
      code: "planned-change-mismatch",
      message: mismatch,
    });
  }

  for (const dependencyId of dependencyIds) {
    const dependencyStatus = dependencyStatusIndex.get(dependencyId);
    if (dependencyStatus?.derivedStatus === "complete") continue;
    skipReasons.push({
      code: "dependency-incomplete",
      message: dependencyStatus
        ? `dependency '${dependencyId}' is not complete (state=${dependencyStatus.state})`
        : `dependency '${dependencyId}' is missing from roadmap status`,
    });
  }

  return skipReasons;
}

export function recommendRoadmapChange(rootDir: string, options: RoadmapRecommendOptions = {}): RoadmapRecommendResult {
  const { roadmap, warnings, diagnostics, milestones } = loadRoadmapStatusContext(rootDir);
  if (diagnostics.length > 0) {
    return {
      valid: false,
      status: "roadmap-error",
      warnings,
      diagnostics,
      recommendation: null,
      candidates: [],
    };
  }

  const milestoneByPath = new Map(roadmap.milestones.map((milestone) => [`roadmap/milestones/${milestone.relativeMilestonePath}`, milestone]));
  const dependencyStatusIndex = createPlannedChangeStatusIndex(milestones);
  const candidates: RoadmapRecommendationCandidate[] = [];
  const recommendationReason = options.milestoneId
    ? `first eligible standalone planned change in milestone '${options.milestoneId}' with complete dependencies and no roadmap mismatches`
    : "first eligible standalone planned change in roadmap order with complete dependencies and no roadmap mismatches";
  let recommendation: RoadmapRecommendation | null = null;

  for (const milestoneStatus of milestones) {
    if (options.milestoneId !== undefined && milestoneStatus.id !== options.milestoneId) continue;
    const milestone = milestoneByPath.get(milestoneStatus.path);
    if (!milestone) continue;

    for (const standalonePlannedChange of getStandalonePlannedChangesForMilestone(roadmap, milestone)) {
      const plannedChangePath = `roadmap/${standalonePlannedChange.relativeRoadmapPath}`;
      const plannedChangeStatus = findPlannedChangeStatus(
        milestoneStatus,
        standalonePlannedChange.artifact.planned_change.id,
        plannedChangePath,
      );
      if (!plannedChangeStatus) continue;

      const skipReasons = buildCandidateSkipReasons(
        plannedChangeStatus,
        dependencyStatusIndex,
        standalonePlannedChange.artifact.depends_on,
      );
      const candidate: RoadmapRecommendationCandidate = {
        id: standalonePlannedChange.artifact.planned_change.id,
        changeName: standalonePlannedChange.artifact.planned_change.id,
        summary: standalonePlannedChange.artifact.summary,
        path: plannedChangePath,
        milestone: {
          id: milestoneStatus.id,
          title: milestoneStatus.title,
          path: milestoneStatus.path,
        },
        eligible: skipReasons.length === 0,
        skipReasons,
      };
      candidates.push(candidate);

      if (!candidate.eligible || recommendation) continue;
      recommendation = {
        id: candidate.id,
        changeName: candidate.changeName,
        summary: candidate.summary,
        path: candidate.path,
        milestone: candidate.milestone,
        reason: recommendationReason,
      };
    }
  }

  return {
    valid: true,
    status: recommendation ? "recommended" : "no-candidate",
    warnings,
    diagnostics,
    recommendation,
    candidates,
  };
}

/**
 * Rename misnamed active standalone planned-change files to their canonical
 * milestone-prefixed basenames. A rename whose canonical destination already
 * exists is skipped so the conflict surfaces as a blocking filename diagnostic
 * instead of overwriting another artifact.
 */
function fixPlannedChangeFileNames(rootDir: string, allowInlinePlannedChanges: boolean): RoadmapSyncRenamedFile[] {
  const renamedFiles: RoadmapSyncRenamedFile[] = [];
  const preload = loadRoadmap(rootDir, { allowInlinePlannedChanges });
  for (const plannedChange of preload.plannedChanges) {
    const canonical = canonicalPlannedChangeFileName(
      plannedChange.artifact.planned_change.milestone,
      plannedChange.artifact.planned_change.id,
    );
    if (plannedChange.file === canonical) continue;
    const targetPath = path.join(path.dirname(plannedChange.absolutePath), canonical);
    if (existsSync(targetPath)) continue;
    renameSync(plannedChange.absolutePath, targetPath);
    renamedFiles.push({
      from: normalizeRepoRelativePath(rootDir, plannedChange.absolutePath),
      to: normalizeRepoRelativePath(rootDir, targetPath),
    });
  }
  return renamedFiles.sort((left, right) => left.from.localeCompare(right.from));
}

export function syncRoadmap(rootDir: string, options: RoadmapSyncOptions = {}): RoadmapSyncResult {
  const renamedFiles = options.fixNames === true
    ? fixPlannedChangeFileNames(rootDir, options.materializePlannedChanges === true)
    : undefined;
  const renamedFilesResult = renamedFiles !== undefined ? { renamedFiles } : {};

  const roadmap = loadRoadmap(rootDir, {
    allowInlinePlannedChanges: options.materializePlannedChanges === true,
  });
  const changeStates = getChangeStateIndex(rootDir);
  appendRoadmapCrossFileDiagnostics(roadmap, changeStates, loadArchivedPlannedChangeIds(rootDir));
  const blockingDiagnostics = roadmap.diagnostics.filter((diagnostic) => diagnostic.artifactPath !== ROADMAP_INDEX_PATH);
  if (blockingDiagnostics.length > 0) {
    return {
      valid: false,
      warnings: roadmap.warnings,
      diagnostics: sortDiagnostics(blockingDiagnostics),
      updatedFiles: [],
      ...renamedFilesResult,
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
      ...renamedFilesResult,
      milestones: [],
    };
  }

  const updatedFiles: string[] = [];

  resolveMilestoneOrderCollisions(roadmap.milestones);

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
    ...renamedFilesResult,
    milestones: status.milestones,
  };
}
