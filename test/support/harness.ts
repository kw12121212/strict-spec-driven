import { spawnSync } from "child_process";
import { cpSync, mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, "..", "..");
const CLI = path.join(ROOT, "dist", "strict-spec-cli.js");
const VALIDATION_FIXTURE_ROOT = path.join(ROOT, "test", "fixtures", "validation");
const PROJECT_FIXTURE_ROOT = path.join(ROOT, "test", "fixtures", "projects");

export type YamlModule = {
  parseYamlDocument<T>(input: string): T;
  stringifyYamlDocument(value: unknown): string;
  parseYamlFile<T>(path: string): T;
};

export type ValidationDiagnostic = {
  source: string;
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
};

export type ValidationModule = {
  loadBundledSchema<T extends object = Record<string, unknown>>(schemaFile: string): T;
  loadBundledSchemaByArtifactType(artifactType: string): Record<string, unknown>;
  loadBundledSchemaBySchemaId(schemaId: string): Record<string, unknown>;
  validateWithSchema(schema: object, artifact: unknown, artifactPath: string): { valid: boolean; diagnostics: ValidationDiagnostic[] };
  runDuplicateIdChecks(
    artifact: unknown,
    artifactPath: string,
    rules: Array<{ collectionPath: string; idField: string; description?: string }>,
  ): ValidationDiagnostic[];
  runReferenceChecks(
    artifact: unknown,
    artifactPath: string,
    rules: Array<{
      sourceCollectionPath: string;
      sourceField: string;
      targetCollectionPath: string;
      targetField: string;
      description?: string;
    }>,
  ): ValidationDiagnostic[];
  validateArtifact(
    schema: object,
    artifact: unknown,
    artifactPath: string,
    options?: {
      duplicateIdRules?: Array<{ collectionPath: string; idField: string; description?: string }>;
      referenceRules?: Array<{
        sourceCollectionPath: string;
        sourceField: string;
        targetCollectionPath: string;
        targetField: string;
        description?: string;
      }>;
    },
  ): { valid: boolean; diagnostics: ValidationDiagnostic[] };
};

export type ScaffoldModule = {
  getBundledScaffoldPath(relativePath: string): string;
  readBundledScaffoldTemplate(relativePath: string): string;
  loadBundledScaffoldYaml<T>(relativePath: string): T;
  getRequiredBundledScaffoldAssets(): string[];
  getRequiredBundledChangeTemplateAssets(): string[];
  findMissingRequiredScaffoldAssets(): string[];
};

export type SkillValidationModule = {
  validateStrictSkillPackaging(rootDir: string): {
    valid: boolean;
    diagnostics: Array<{ code: string; path: string; message: string; expected?: string; actual?: string }>;
    summary: {
      skillCount: number;
      marketplaceCount: number;
      diagnosticsCount: number;
    };
  };
};

export type RoadmapConversionResult<T> =
  | { ok: true; artifact: T }
  | { ok: false; reason: string; recommendation: string };

export type RoadmapIndexArtifact = {
  schema: string;
  schema_version: number;
  artifact_type: string;
  milestones: Array<{ id: string; title: string; path: string; status: string }>;
};

export type RoadmapMilestoneArtifact = {
  schema: string;
  schema_version: number;
  artifact_type: string;
  milestone: { id: string; title: string };
  goal: string;
  scope: { in: string[]; out: string[] };
  done_criteria: string[];
  planned_changes: Array<{ id: string; status: string; summary: string; depends_on: string[] }>;
  dependencies: string[];
  risks: string[];
  status: string;
  notes: string[];
};

export type SpecsIndexArtifact = {
  schema: string;
  schema_version: number;
  artifact_type: string;
  specs: Array<{ id: string; title: string; path: string }>;
};

export type RoadmapConverterModule = {
  convertRoadmapIndex(markdown: string): RoadmapConversionResult<RoadmapIndexArtifact>;
  convertRoadmapMilestone(markdown: string, filename: string): RoadmapConversionResult<RoadmapMilestoneArtifact>;
  convertSpecsIndex(markdown: string): RoadmapConversionResult<SpecsIndexArtifact>;
};

export type MigrateConverterModule = {
  parseLegacyProposal(
    sourcePath: string,
    content: string,
    fallbackChangeId: string,
    archived: boolean,
  ): {
    change: { id: string; status: string };
    summary: { what: string[]; why: string[] };
    scope: { in: string[]; out: string[] };
    unchanged_behavior: string[];
  };
  parseLegacyDesign(
    sourcePath: string,
    content: string,
    changeId: string,
  ): {
    change: string;
    approach: string[];
    decisions: Array<{ id: string; decision: string; rationale: string }>;
    alternatives: Array<{ option: string; reason: string }>;
  };
  parseLegacyTasks(
    sourcePath: string,
    content: string,
    changeId: string,
  ): {
    change: string;
    sections: Array<{ name: string; tasks: Array<{ status: string; command?: string }> }>;
    testing_gates: { validation_task: string; unit_test_task: string };
  };
  parseLegacyQuestions(
    sourcePath: string,
    content: string,
    changeId: string,
  ): {
    change: string;
    open: Array<{ question: string; context: string; status: string }>;
    resolved: Array<{ question: string; answer: string; status: string }>;
  };
};

export type CommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

export class TestContext {
  private passedCount = 0;
  private failedCount = 0;

  section(title: string): void {
    console.log(`\n${title}`);
  }

  assert(condition: boolean, label: string, details = ""): void {
    if (condition) {
      console.log(`  PASS ${label}`);
      this.passedCount += 1;
      return;
    }

    console.log(`  FAIL ${label}${details ? ` (${details})` : ""}`);
    this.failedCount += 1;
  }

  get passed(): number {
    return this.passedCount;
  }

  get failed(): number {
    return this.failedCount;
  }

  get total(): number {
    return this.passedCount + this.failedCount;
  }
}

export function runCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd: options?.cwd,
    env: options?.env,
  });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function cli(args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): CommandResult {
  return runCommand("node", [CLI, ...args], options);
}

export function fixturePath(fileName: string): string {
  return path.join(VALIDATION_FIXTURE_ROOT, fileName);
}

export function projectFixturePath(...segments: string[]): string {
  return path.join(PROJECT_FIXTURE_ROOT, ...segments);
}

export function createCopiedProjectWorkspace(fixtureName: string): { workspaceRoot: string; cleanup: () => void } {
  const fixtureRoot = projectFixturePath(fixtureName);
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), `strict-project-fixture-${fixtureName}-`));
  const workspaceRoot = path.join(tempRoot, fixtureName);
  cpSync(fixtureRoot, workspaceRoot, { recursive: true });
  return {
    workspaceRoot,
    cleanup: () => {
      rmSync(tempRoot, { recursive: true, force: true });
    },
  };
}

export function projectWorkspaceCli(
  workspaceRoot: string,
  args: string[],
): CommandResult {
  return cli(args, { cwd: workspaceRoot });
}

export async function loadDistModule<T>(fileName: string): Promise<T> {
  const moduleUrl = pathToFileURL(path.join(ROOT, "dist", fileName)).href;
  return (await import(moduleUrl)) as T;
}

export function formatLocalDateStamp(date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function printFinalSummary(context: TestContext): void {
  console.log("");
  if (context.failed === 0) {
    console.log(`All ${context.total} tests passed.`);
    return;
  }

  console.log(`${context.failed}/${context.total} tests failed.`);
  process.exit(1);
}
