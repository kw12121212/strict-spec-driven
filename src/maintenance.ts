import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import { parseYamlFile, stringifyYamlDocument } from "./yaml.js";
import { type MaintenanceCheckType } from "./maintenance-check-types.js";
import { buildSeededRequirementQuestions } from "./requirement-questions.js";
import { MAX_ACTIVE_CHANGE_COUNT, initializeStrictChangeScaffold, listActiveChangeNames } from "./scaffold.js";
import { syncRoadmap } from "./roadmap.js";
import type { RoadmapSyncResult } from "./roadmap.js";
import { generateArchitectureDocument } from "./architecture.js";
import { generateDesignDocument } from "./design-system.js";
import { DocumentSourceError, type DocumentRenderResult } from "./document-render.js";
import { listLessons, showLesson } from "./lessons.js";
import {
  exemptPathReason,
  isGeneratedDocument,
  scanSourceForUnregisteredWriters,
  scanTextForPolicyViolations,
} from "./cli-only-yaml-policy.js";

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
export const GENERATED_DOCUMENT_TARGETS: {
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

/**
 * How long a lesson may go without a fresh encounter before its evidence base counts as dated. A
 * lesson whose every occurrence came from work that has since been archived, and that nothing has
 * hit since, is a candidate for review — not a lesson that is automatically wrong.
 */
const LESSON_STALENESS_WINDOW_DAYS = 180;

/** Repo-relative path-like tokens, used to spot a lesson that names a file the repo no longer has. */
const PATH_TOKEN_PATTERN = /(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g;

function referencedPathsThatVanished(rootDir: string, text: string): string[] {
  const missing: string[] = [];
  for (const token of text.match(PATH_TOKEN_PATTERN) ?? []) {
    if (token.includes("://") || token.startsWith("..")) continue;
    if (existsSync(path.join(rootDir, token))) continue;
    if (!missing.includes(token)) missing.push(token);
  }
  return missing;
}

function changeIsArchived(rootDir: string, changeName: string): boolean {
  return existsSync(path.join(getChangesDir(rootDir), "archive", changeName));
}

function daysSince(isoDate: string): number | null {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) return null;
  return (Date.now() - parsed) / (1000 * 60 * 60 * 24);
}

/**
 * Nominates active lessons whose premises look like they no longer hold, so obsolescence review is
 * scheduled work rather than something a human has to remember to do. The check only reports: it
 * never rewrites a lesson, because deciding that experience has expired is a judgment call, and a
 * lesson retired for the wrong reason takes its motivating context with it.
 */
function runLessonStalenessCheck(rootDir: string): MaintenanceFinding[] {
  const findings: MaintenanceFinding[] = [];
  const lessons = listLessons(rootDir).lessons;

  for (const entry of lessons) {
    const shown = showLesson(rootDir, entry.id);
    const lesson = shown.lesson;
    if (!lesson) continue;

    const missingPaths = referencedPathsThatVanished(rootDir, lesson.applies_when);
    if (missingPaths.length > 0) {
      findings.push({
        check: "lesson-staleness-check",
        description: `Review lesson '${entry.id}': its applies_when names ${missingPaths.join(", ")}, which no longer exists in the repository. Retire it with 'strict-spec-cli lesson-obsolete ${entry.id} --reason "<why>"' or update the condition with lesson-edit.`,
      });
      continue;
    }

    const occurrences = lesson.occurrences ?? [];
    if (occurrences.length === 0) continue;

    const everyOriginArchived = occurrences.every((occurrence) => changeIsArchived(rootDir, occurrence.origin));
    if (!everyOriginArchived) continue;

    const ages = occurrences.map((occurrence) => daysSince(occurrence.date)).filter((age): age is number => age !== null);
    if (ages.length === 0) continue;
    const newestAge = Math.min(...ages);
    if (newestAge < LESSON_STALENESS_WINDOW_DAYS) continue;

    findings.push({
      check: "lesson-staleness-check",
      description: `Review lesson '${entry.id}': every recorded occurrence comes from archived work and the most recent is ${Math.floor(newestAge)} days old. Confirm it still applies, or retire it with 'strict-spec-cli lesson-obsolete ${entry.id} --reason "<why>"'.`,
    });
  }

  return findings;
}

/**
 * The prose surfaces the CLI-only YAML policy governs beyond bundled skills, which validate-skills
 * already covers. Each entry names a directory and the file extensions whose text an agent reads
 * as instruction.
 */
const POLICY_TEXT_SURFACES: { dir: string; extensions: string[] }[] = [
  { dir: `${STRICT_WORKFLOW_DIR}/specs`, extensions: [".yaml"] },
  { dir: `${STRICT_WORKFLOW_DIR}/tech`, extensions: [".yaml"] },
  { dir: "src/mcp", extensions: [".ts"] },
  { dir: "docs", extensions: [".md"] },
];

/**
 * Repository-root Markdown, which an agent reads as operator instruction. The set is scanned
 * rather than listed: a hardcoded list silently skips the file it does not name — a translated
 * README, a newly added guide — and a governed surface nobody checks is worse than no check.
 */
function listRootDocuments(rootDir: string): string[] {
  if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) return [];
  return readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function listFilesWithExtensions(rootDir: string, relativeDir: string, extensions: string[]): string[] {
  const absolute = path.join(rootDir, relativeDir);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return [];

  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relativeEntry = path.posix.join(relativeDir, entry.name);
    if (exemptPathReason(relativeEntry) !== undefined) continue;
    if (entry.isDirectory()) {
      files.push(...listFilesWithExtensions(rootDir, relativeEntry, extensions));
      continue;
    }
    if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(relativeEntry);
  }
  return files;
}

/**
 * Applies the CLI-only YAML mutation policy to the surfaces outside bundled skills: strict main
 * specs, technical standards, MCP tool metadata, operator documentation, and repository source
 * code. The check reports rather than exits non-zero, because maintenance's contract is to collect
 * findings and seed a change from them; validate-skills is where a policy violation blocks.
 */
function runCliOnlyYamlPolicyCheck(rootDir: string): MaintenanceFinding[] {
  const findings: MaintenanceFinding[] = [];

  const textFiles = [
    ...POLICY_TEXT_SURFACES.flatMap((surface) => listFilesWithExtensions(rootDir, surface.dir, surface.extensions)),
    ...listRootDocuments(rootDir),
  ];

  for (const relativeFile of textFiles) {
    let text: string;
    try {
      text = readFileSync(path.join(rootDir, relativeFile), "utf8");
    } catch {
      continue;
    }
    // A rendered document is produced by its generator, so its text is not an authored instruction
    // and correcting it there would be overwritten on the next render.
    if (isGeneratedDocument(text)) continue;

    for (const match of scanTextForPolicyViolations(relativeFile, text).matches) {
      findings.push({
        check: "cli-only-yaml-policy",
        description: `${match.file}:${match.line} [${match.category}] describes a YAML mutation outside the CLI ("${match.excerpt}"); ${match.replacement}`,
      });
    }
  }

  for (const match of scanSourceForUnregisteredWriters(rootDir, "src").matches) {
    findings.push({
      check: "cli-only-yaml-policy",
      description: `${match.file}:${match.line} [${match.category}] writes repository-owned YAML without inventory registration ("${match.excerpt}"); ${match.replacement}`,
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

function buildQuestionsYaml(changeName: string): object {
  return {
    schema: "strict-spec-driven/question-list/v1",
    schema_version: 1,
    artifact_type: "question_list",
    schema_file: "templates/strict-spec-driven/schemas/question-list.yaml",
    change: changeName,
    open: buildSeededRequirementQuestions(),
    resolved: [],
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

/**
 * Every configurable check type, mapped to the function that runs it.
 *
 * This is the one place the supported set is stated: the dispatch reads it, and the command
 * metadata's note is checked against it, so a check type cannot be implemented without being
 * documented or documented without being implemented.
 */
const MAINTENANCE_CHECK_RUNNERS: Record<MaintenanceCheckType, (rootDir: string) => MaintenanceFinding[]> = {
  "roadmap-sync-check": runRoadmapSyncCheck,
  "specs-directory-structure-check": runSpecsDirectoryStructureCheck,
  "generated-doc-check": runGeneratedDocCheck,
  "lesson-staleness-check": runLessonStalenessCheck,
  "cli-only-yaml-policy": runCliOnlyYamlPolicyCheck,
};

/**
 * Options for a maintenance run.
 *
 * Seeding is opt-in. The command reads as a check, and every recorded invocation wanted the report,
 * so the bare run reports and writes nothing; a caller that wants the change asks for it.
 */
export type MaintenanceOptions = {
  seed?: boolean;
};

/** The reason reported when findings exist but the caller did not ask for a change to be written. */
const SEEDING_NOT_REQUESTED_REASON =
  "seeding skipped because it was not requested; rerun with --seed to create a maintenance change from these findings";

export function runMaintenance(rootDir: string, options: MaintenanceOptions = {}): MaintenanceResult {
  const seed = options.seed === true;
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
    const runCheck = MAINTENANCE_CHECK_RUNNERS[check.type as MaintenanceCheckType];
    if (!runCheck) continue;
    findings.push(...runCheck(rootDir));
    checksRun++;
  }

  if (findings.length === 0) {
    return { valid: true, checksRun, findingsCount: 0, generatedChange: null, seedingSkippedReason: null };
  }

  if (!seed) {
    return {
      valid: true,
      checksRun,
      findingsCount: findings.length,
      generatedChange: null,
      seedingSkippedReason: SEEDING_NOT_REQUESTED_REASON,
    };
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

  // Maintenance authors only the artifacts it has real content for. design.yaml is left absent
  // rather than seeded, because the approach is a human decision the check results cannot supply;
  // verify reports it as an unauthored required artifact. questions.yaml carries the
  // requirement-interrogation set, which a seeded change needs as much as a hand-proposed one.
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
  writeFileSync(
    path.join(changeDir, "questions.yaml"),
    stringifyYamlDocument(buildQuestionsYaml(changeName)),
    "utf8",
  );

  return { valid: true, checksRun, findingsCount: findings.length, generatedChange: changeName, seedingSkippedReason: null };
}
