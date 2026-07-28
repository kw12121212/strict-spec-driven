import { existsSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import { parseYamlFile, stringifyYamlDocument } from "./yaml.js";
import { MAX_ACTIVE_CHANGE_COUNT, initializeStrictChangeScaffold, listActiveChangeNames } from "./scaffold.js";
import { syncRoadmap } from "./roadmap.js";
import type { RoadmapSyncResult } from "./roadmap.js";
import { generateArchitectureDocument } from "./architecture.js";
import { generateDesignDocument } from "./design-system.js";
import { DocumentSourceError, type DocumentRenderResult } from "./document-render.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
const FORBIDDEN_SPEC_SUBDIRS = new Set([".strict-spec-driven", "changes", "archive"]);

type CheckConfig = {
  type: string;
};

type MaintenanceConfig = {
  checks?: CheckConfig[];
};

type WorkflowConfig = {
  maintenance?: MaintenanceConfig;
  review_evidence?: {
    project_regression?: {
      command?: unknown;
    };
  };
};

const REGRESSION_COMMAND_FALLBACK =
  "REPLACE WITH the complete project regression command (build plus full test run)";

function configuredRegressionCommand(config: WorkflowConfig): string {
  const command = config.review_evidence?.project_regression?.command;
  return typeof command === "string" && command.trim().length > 0 ? command : REGRESSION_COMMAND_FALLBACK;
}

type MaintenanceFinding = {
  check: string;
  description: string;
};

export type MaintenanceResult = {
  valid: boolean;
  checksRun: number;
  findingsCount: number;
  generatedChange: string | null;
  seedingSkippedReason: string | null;
};

function getChangesDir(rootDir: string): string {
  return path.join(rootDir, STRICT_WORKFLOW_DIR, "changes");
}

function generateChangeName(rootDir: string, date: string): string {
  const changesDir = getChangesDir(rootDir);
  let candidate = `maintenance-${date}`;
  if (!existsSync(path.join(changesDir, candidate))) return candidate;
  for (let i = 2; i <= 99; i++) {
    candidate = `maintenance-${date}-${i}`;
    if (!existsSync(path.join(changesDir, candidate))) return candidate;
  }
  throw new Error(`Could not generate a unique maintenance change name for date ${date}`);
}

function runRoadmapSyncCheck(rootDir: string): MaintenanceFinding[] {
  const result: RoadmapSyncResult = syncRoadmap(rootDir);
  return result.updatedFiles.map((file) => ({
    check: "roadmap-sync-check",
    description: `Synced roadmap file: ${file}`,
  }));
}

function runSpecsDirectoryStructureCheck(rootDir: string): MaintenanceFinding[] {
  const specsDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "specs");
  if (!existsSync(specsDir) || !statSync(specsDir).isDirectory()) return [];

  const findings: MaintenanceFinding[] = [];
  for (const entry of readdirSync(specsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && FORBIDDEN_SPEC_SUBDIRS.has(entry.name)) {
      findings.push({
        check: "specs-directory-structure-check",
        description: `Remove misplaced .strict-spec-driven/specs/${entry.name}/ directory; workflow state directories belong under .strict-spec-driven/ directly`,
      });
    }
  }
  return findings;
}

/**
 * The generated documents this check compares. Both renderers already render in memory, compare
 * against disk, and name the sources that went stale in check mode, so the check reuses them rather
 * than reimplementing comparison.
 */
const GENERATED_DOCUMENT_TARGETS: {
  reRenderCommand: string;
  check: (rootDir: string) => DocumentRenderResult;
}[] = [
  {
    reRenderCommand: "strict-spec-cli architecture-generate",
    check: (rootDir) => generateArchitectureDocument(rootDir, { check: true }),
  },
  {
    reRenderCommand: "strict-spec-cli design-generate",
    check: (rootDir) => generateDesignDocument(rootDir, { check: true }),
  },
];

/**
 * Reports generated documents that exist on disk and no longer match their strict YAML sources. A
 * document absent from disk is not drift: both generated documents are opt-in, so a project that
 * never rendered one has declined it rather than let it go stale. An unreadable source artifact is
 * skipped for the same reason — there is nothing to compare against, and artifact validity is what
 * architecture-status and design-status report.
 */
function runGeneratedDocCheck(rootDir: string): MaintenanceFinding[] {
  const findings: MaintenanceFinding[] = [];

  for (const target of GENERATED_DOCUMENT_TARGETS) {
    let result: DocumentRenderResult;
    try {
      result = target.check(rootDir);
    } catch (error) {
      if (error instanceof DocumentSourceError) continue;
      throw error;
    }

    if (!result.documentExists || result.current) continue;
    findings.push({
      check: "generated-doc-check",
      description: `Re-render stale ${result.outputPath} after changes to ${result.staleSources.join(", ")}: ${target.reRenderCommand}`,
    });
  }

  return findings;
}

function buildProposalYaml(changeName: string, findings: MaintenanceFinding[]): object {
  const checkTypes = [...new Set(findings.map((f) => f.check))];
  return {
    schema: "strict-spec-driven/change-proposal/v1",
    schema_version: 1,
    artifact_type: "change_proposal",
    schema_file: "templates/strict-spec-driven/schemas/change-proposal.yaml",
    change: { id: changeName, status: "proposed" },
    summary: {
      what: checkTypes.map((t) => `Applied ${t} findings.`),
      why: ["Automated maintenance run detected and applied repository drift corrections."],
    },
    scope: {
      in: findings.map((f) => f.description),
      out: [],
    },
    unchanged_behavior: [],
  };
}

function buildTasksYaml(changeName: string, findings: MaintenanceFinding[], regressionCommand: string): object {
  const implementationTasks: Record<string, { text: string; status: string }> = {};
  for (const [i, f] of findings.entries()) {
    implementationTasks[`finding-${i + 1}`] = {
      text: `[${f.check}] ${f.description}`,
      status: "pending",
    };
  }

  return {
    schema: "strict-spec-driven/task-list/v2",
    schema_version: 2,
    artifact_type: "task_list",
    schema_file: "templates/strict-spec-driven/schemas/task-list.yaml",
    change: changeName,
    sections: {
      Implementation: implementationTasks,
      Testing: {
        "run-project-regression": {
          text: "Run the complete project regression command; when the workflow config declares a coverage contract, this command enforces the minimum coverage threshold by exiting non-zero below it.",
          status: "pending",
          command: regressionCommand,
        },
      },
      Verification: {
        "verify-scope": { text: "Verify maintenance scope matches findings.", status: "pending" },
      },
    },
    testing_gates: {
      validation_task: "run-project-regression",
      unit_test_task: "run-project-regression",
    },
  };
}

export function runMaintenance(rootDir: string): MaintenanceResult {
  const configPath = path.join(rootDir, STRICT_WORKFLOW_DIR, "config.yaml");
  if (!existsSync(configPath)) {
    return { valid: true, checksRun: 0, findingsCount: 0, generatedChange: null, seedingSkippedReason: null };
  }

  let config: WorkflowConfig;
  try {
    config = parseYamlFile<WorkflowConfig>(configPath);
  } catch {
    return { valid: false, checksRun: 0, findingsCount: 0, generatedChange: null, seedingSkippedReason: null };
  }

  const maintenanceCfg = config.maintenance;
  if (!maintenanceCfg?.checks?.length) {
    return { valid: true, checksRun: 0, findingsCount: 0, generatedChange: null, seedingSkippedReason: null };
  }

  const findings: MaintenanceFinding[] = [];
  let checksRun = 0;

  for (const check of maintenanceCfg.checks) {
    if (check.type === "roadmap-sync-check") {
      findings.push(...runRoadmapSyncCheck(rootDir));
      checksRun++;
    }
    if (check.type === "specs-directory-structure-check") {
      findings.push(...runSpecsDirectoryStructureCheck(rootDir));
      checksRun++;
    }
    if (check.type === "generated-doc-check") {
      findings.push(...runGeneratedDocCheck(rootDir));
      checksRun++;
    }
  }

  if (findings.length === 0) {
    return { valid: true, checksRun, findingsCount: 0, generatedChange: null, seedingSkippedReason: null };
  }

  const activeChanges = listActiveChangeNames(rootDir);
  if (activeChanges.length >= MAX_ACTIVE_CHANGE_COUNT) {
    const blockingList = activeChanges.map((name) => `'${name}'`).join(", ");
    return {
      valid: true,
      checksRun,
      findingsCount: findings.length,
      generatedChange: null,
      seedingSkippedReason: `seeding skipped because active changes ${blockingList} already fill the limit of two active changes; archive or cancel one before maintenance can seed a change`,
    };
  }

  const date = new Date().toISOString().slice(0, 10);
  const changeName = generateChangeName(rootDir, date);

  initializeStrictChangeScaffold(rootDir, changeName);

  const changeDir = path.join(getChangesDir(rootDir), changeName);
  writeFileSync(
    path.join(changeDir, "proposal.yaml"),
    stringifyYamlDocument(buildProposalYaml(changeName, findings)),
    "utf8",
  );
  writeFileSync(
    path.join(changeDir, "tasks.yaml"),
    stringifyYamlDocument(buildTasksYaml(changeName, findings, configuredRegressionCommand(config))),
    "utf8",
  );

  return { valid: true, checksRun, findingsCount: findings.length, generatedChange: changeName, seedingSkippedReason: null };
}
