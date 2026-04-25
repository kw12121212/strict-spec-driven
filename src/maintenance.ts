import { existsSync, writeFileSync } from "fs";
import path from "path";
import { parseYamlFile, stringifyYamlDocument } from "./yaml.js";
import { initializeStrictChangeScaffold } from "./scaffold.js";
import { syncRoadmap } from "./roadmap.js";
import type { RoadmapSyncResult } from "./roadmap.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";

type CheckConfig = {
  type: string;
};

type MaintenanceConfig = {
  checks?: CheckConfig[];
};

type WorkflowConfig = {
  maintenance?: MaintenanceConfig;
};

type MaintenanceFinding = {
  check: string;
  description: string;
};

export type MaintenanceResult = {
  valid: boolean;
  checksRun: number;
  findingsCount: number;
  generatedChange: string | null;
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

function buildTasksYaml(changeName: string, findings: MaintenanceFinding[]): object {
  const implementationTasks = findings.map((f, i) => ({
    id: `finding-${i + 1}`,
    text: `[${f.check}] ${f.description}`,
    status: "pending",
  }));

  return {
    schema: "strict-spec-driven/task-list/v1",
    schema_version: 1,
    artifact_type: "task_list",
    schema_file: "templates/strict-spec-driven/schemas/task-list.yaml",
    change: changeName,
    sections: [
      { name: "Implementation", tasks: implementationTasks },
      {
        name: "Testing",
        tasks: [
          { id: "run-build", text: "Run build validation.", status: "pending", command: "bun run build" },
          { id: "run-tests", text: "Run unit tests.", status: "pending", command: "bun test/run.ts" },
        ],
      },
      {
        name: "Verification",
        tasks: [{ id: "verify-scope", text: "Verify maintenance scope matches findings.", status: "pending" }],
      },
    ],
    testing_gates: {
      validation_task: "run-build",
      unit_test_task: "run-tests",
    },
  };
}

export function runMaintenance(rootDir: string): MaintenanceResult {
  const configPath = path.join(rootDir, STRICT_WORKFLOW_DIR, "config.yaml");
  if (!existsSync(configPath)) {
    return { valid: true, checksRun: 0, findingsCount: 0, generatedChange: null };
  }

  let config: WorkflowConfig;
  try {
    config = parseYamlFile<WorkflowConfig>(configPath);
  } catch {
    return { valid: false, checksRun: 0, findingsCount: 0, generatedChange: null };
  }

  const maintenanceCfg = config.maintenance;
  if (!maintenanceCfg?.checks?.length) {
    return { valid: true, checksRun: 0, findingsCount: 0, generatedChange: null };
  }

  const findings: MaintenanceFinding[] = [];
  let checksRun = 0;

  for (const check of maintenanceCfg.checks) {
    if (check.type === "roadmap-sync-check") {
      findings.push(...runRoadmapSyncCheck(rootDir));
      checksRun++;
    }
  }

  if (findings.length === 0) {
    return { valid: true, checksRun, findingsCount: 0, generatedChange: null };
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
    stringifyYamlDocument(buildTasksYaml(changeName, findings)),
    "utf8",
  );

  return { valid: true, checksRun, findingsCount: findings.length, generatedChange: changeName };
}
