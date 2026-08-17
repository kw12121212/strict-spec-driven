import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { CANONICAL_REQUIREMENT_QUESTIONS } from "./requirement-questions.js";
import { flattenTasks } from "./task-list.js";
import { parseYamlDocument } from "./yaml.js";
import { verifyChange, type VerifyDiagnostic } from "./verify.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";
// Exported so a regression can assert that the ids the readiness message advertises are exactly the
// ids this check accepts, in both directions. Without access to the declaration itself a test can
// only confirm the message matches the set as it read at the time the test was written.
export const EMPTY_SPEC_DECISION_IDS = new Set([
  "no-delta-spec",
  "no-spec-impact",
  "technical-only-no-spec",
  "empty-spec-decision",
]);

type QuestionEntry = {
  id?: unknown;
  question?: unknown;
  context?: unknown;
  kind?: unknown;
  answered_by?: unknown;
};

type QuestionListArtifact = {
  open?: QuestionEntry[];
  resolved?: QuestionEntry[];
};

type ProposalArtifact = {
  scope?: {
    in?: unknown[];
    out?: unknown[];
  };
  unchanged_behavior?: unknown[];
};

type DesignArtifact = {
  decisions?: Record<string, unknown>;
};

export type WorkflowSuggestion = {
  command: string;
  reason: string;
};

export type WorkflowStateResult = {
  changeName: string;
  valid: boolean;
  totalTasks: number;
  completeTasks: number;
  remainingPending: number;
  openQuestionCount: number;
  blockers: VerifyDiagnostic[];
  suggestions: WorkflowSuggestion[];
};

export type ProposalReadinessResult = {
  changeName: string;
  ready: boolean;
  diagnostics: VerifyDiagnostic[];
  suggestions: WorkflowSuggestion[];
};

function changeDir(rootDir: string, changeName: string): string {
  return path.join(rootDir, STRICT_WORKFLOW_DIR, "changes", changeName);
}

function toRepoPath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function listDeltaSpecFiles(rootDir: string, changeName: string): string[] {
  const specsDir = path.join(changeDir(rootDir, changeName), "specs");
  if (!existsSync(specsDir)) return [];
  const files: string[] = [];

  function walk(currentPath: string): void {
    for (const entry of readdirSync(currentPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
        files.push(toRepoPath(rootDir, fullPath));
      }
    }
  }

  walk(specsDir);
  return files;
}

function hasExplicitEmptySpecDecision(rootDir: string, changeName: string): boolean {
  const design = readChangeArtifact<DesignArtifact>(rootDir, changeName, "design.yaml");
  if (!design?.decisions) return false;
  return Object.keys(design.decisions).some((decisionId) => EMPTY_SPEC_DECISION_IDS.has(decisionId.toLowerCase()));
}

function readChangeArtifact<T>(rootDir: string, changeName: string, artifactName: string): T | undefined {
  const artifactPath = path.join(changeDir(rootDir, changeName), artifactName);
  if (!existsSync(artifactPath)) return undefined;
  try {
    return parseYamlDocument<T>(readFileSync(artifactPath, "utf8"), {
      source: toRepoPath(rootDir, artifactPath),
    });
  } catch {
    return undefined;
  }
}

function readOpenQuestionIds(rootDir: string, changeName: string): string[] {
  const questionsPath = path.join(changeDir(rootDir, changeName), "questions.yaml");
  if (!existsSync(questionsPath)) return [];
  const artifact = parseYamlDocument<QuestionListArtifact>(readFileSync(questionsPath, "utf8"), {
    source: toRepoPath(rootDir, questionsPath),
  });
  return (artifact.open ?? [])
    .map((question) => question.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .sort();
}

function readFirstPendingTask(rootDir: string, changeName: string):
  | { sectionName: string; taskId: string; text: string; command?: string }
  | undefined {
  const tasksPath = path.join(changeDir(rootDir, changeName), "tasks.yaml");
  if (!existsSync(tasksPath)) return undefined;
  const artifact = parseYamlDocument<unknown>(readFileSync(tasksPath, "utf8"), { source: toRepoPath(rootDir, tasksPath) });
  return flattenTasks(artifact as { sections?: unknown }).find((task) => task.status !== "complete");
}

function hasEntries(value: unknown[] | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}

function proposalReadinessDiagnostic(
  changeName: string,
  artifactPath: string,
  fieldPath: string,
  message: string,
  expected: string,
  actual: string,
): VerifyDiagnostic {
  return {
    source: "proposal_readiness",
    artifactPath: `.strict-spec-driven/changes/${changeName}/${artifactPath}`,
    fieldPath,
    message,
    expected,
    actual,
  };
}

function checkRequirementIntakeEvidence(rootDir: string, changeName: string): VerifyDiagnostic[] {
  const artifact = readChangeArtifact<QuestionListArtifact>(rootDir, changeName, "questions.yaml");
  if (!artifact) return [];
  const artifactPath = `.strict-spec-driven/changes/${changeName}/questions.yaml`;
  const open = Array.isArray(artifact.open) ? artifact.open : [];
  const resolved = Array.isArray(artifact.resolved) ? artifact.resolved : [];
  const diagnostics: VerifyDiagnostic[] = [];

  for (const canonical of CANONICAL_REQUIREMENT_QUESTIONS) {
    const resolvedEntry = resolved.find((entry) => entry?.id === canonical.id);
    if (resolvedEntry) {
      // A canonical requirement entry can only be authored after this contract exists, so unlike
      // legacy technical questions it must carry attribution — otherwise an unattributed answer
      // would slip past the assumption check and the gate would grade only the writing.
      if (resolvedEntry.answered_by !== "human" && resolvedEntry.answered_by !== "roadmap") {
        const isAssumption = resolvedEntry.answered_by === "assumption";
        diagnostics.push({
          source: "requirement_intake",
          artifactPath,
          fieldPath: `$.resolved[?(@.id=='${canonical.id}')].answered_by`,
          message:
            `requirement question '${canonical.id}' asks ${canonical.asks}, and its answer is `
            + (isAssumption
              ? "attributed to an agent assumption rather than to the requester"
              : "missing an answered_by attribution naming where the answer came from")
            + `. Ask the requester, then re-record the answer with: strict-spec-cli generate ${changeName} `
            + `questions --resolved ${canonical.id} --question "<question text>" --context "<why it is asked>" `
            + `--answer "<the requester's answer>" --kind requirement --answered-by human. `
            + "Use --answered-by roadmap instead only when the answer is replayed from roadmap planned-change or milestone detail.",
          expected: "answered_by human or roadmap",
          actual: isAssumption ? "answered_by assumption" : "no answered_by attribution",
        });
      }
      continue;
    }

    const isOpen = open.some((entry) => entry?.id === canonical.id);
    diagnostics.push({
      source: "requirement_intake",
      artifactPath,
      fieldPath: isOpen ? `$.open[?(@.id=='${canonical.id}')]` : "$.resolved",
      message:
        `requirement question '${canonical.id}' asks ${canonical.asks}, and is ${isOpen ? "still unanswered" : "missing"}; `
        + `resolve it with: strict-spec-cli generate ${changeName} questions --resolve ${canonical.id} --answer <answer> --answered-by human`,
      expected: `resolved '${canonical.id}' answered by the requester`,
      actual: isOpen ? "open requirement question" : "no such requirement question",
    });
  }

  return diagnostics;
}

function checkDeterministicQuestionGateEvidence(rootDir: string, changeName: string): VerifyDiagnostic[] {
  const diagnostics: VerifyDiagnostic[] = [];
  const proposal = readChangeArtifact<ProposalArtifact>(rootDir, changeName, "proposal.yaml");
  if (proposal) {
    if (!hasEntries(proposal.scope?.in)) {
      diagnostics.push(proposalReadinessDiagnostic(
        changeName,
        "proposal.yaml",
        "$.scope.in",
        "proposal must record what is included before implementation handoff",
        "at least one included scope item",
        "empty or missing scope.in",
      ));
    }
    if (!hasEntries(proposal.scope?.out)) {
      diagnostics.push(proposalReadinessDiagnostic(
        changeName,
        "proposal.yaml",
        "$.scope.out",
        "proposal must record what is left out before implementation handoff",
        "at least one out-of-scope item",
        "empty or missing scope.out",
      ));
    }
    if (!hasEntries(proposal.unchanged_behavior)) {
      diagnostics.push(proposalReadinessDiagnostic(
        changeName,
        "proposal.yaml",
        "$.unchanged_behavior",
        "proposal must record behavior that must stay the same before implementation handoff",
        "at least one unchanged behavior item",
        "empty or missing unchanged_behavior",
      ));
    }
  }

  const design = readChangeArtifact<DesignArtifact>(rootDir, changeName, "design.yaml");
  if (design && (!design.decisions || Object.keys(design.decisions).length === 0)) {
    diagnostics.push(proposalReadinessDiagnostic(
      changeName,
      "design.yaml",
      "$.decisions",
      "design must record at least one decision before implementation handoff",
      "at least one design decision",
      "empty or missing decisions",
    ));
  }

  return diagnostics;
}

function suggestionsForDiagnostics(rootDir: string, changeName: string, diagnostics: VerifyDiagnostic[]): WorkflowSuggestion[] {
  const suggestions: WorkflowSuggestion[] = [];
  const openQuestionIds = readOpenQuestionIds(rootDir, changeName);
  for (const questionId of openQuestionIds) {
    suggestions.push({
      command: `strict-spec-cli generate ${changeName} questions --resolve ${questionId} --answer <answer>`,
      reason: `Resolve open question '${questionId}' after a human supplies the answer.`,
    });
  }

  const firstPendingTask = readFirstPendingTask(rootDir, changeName);
  if (firstPendingTask) {
    if (firstPendingTask.command) {
      suggestions.push({
        command: firstPendingTask.command,
        reason: `Run the command for pending task '${firstPendingTask.taskId}' before marking it complete.`,
      });
    }
    suggestions.push({
      command: `strict-spec-cli apply ${changeName}`,
      reason: `Mark pending task '${firstPendingTask.taskId}' complete after the work is done.`,
    });
  }

  if (diagnostics.some((diagnostic) => diagnostic.source !== "task_completion" && diagnostic.source !== "open_questions")) {
    suggestions.push({
      command: `strict-spec-cli verify ${changeName}`,
      reason: "Rerun strict verification after fixing reported artifact or workflow diagnostics.",
    });
  }

  if (diagnostics.length === 0) {
    suggestions.push({
      command: `/strict-spec-review ${changeName}`,
      reason: "Perform skill-driven code review after the change verifies cleanly.",
    });
  }

  return suggestions;
}

export function getWorkflowState(rootDir: string, changeName: string): WorkflowStateResult {
  const verification = verifyChange(rootDir, changeName);
  return {
    changeName,
    valid: verification.valid,
    totalTasks: verification.totalTasks,
    completeTasks: verification.completeTasks,
    remainingPending: verification.remainingPending,
    openQuestionCount: verification.openQuestionCount,
    blockers: verification.diagnostics,
    suggestions: suggestionsForDiagnostics(rootDir, changeName, verification.diagnostics),
  };
}

// Shared remediation message for a change that has no delta spec files and no
// explicit empty-spec design decision. Readiness offers two ways forward, but
// only one of them used to be discoverable: the accepted decision ids exist
// nowhere outside this module, so naming the alternative without naming its ids
// sent the reader to the CLI source, which is absent in an installed project.
// The accepted-id clause is built from EMPTY_SPEC_DECISION_IDS rather than
// restated, so the guidance can never advertise an id the check rejects or omit
// one it accepts.
export function formatMissingDeltaSpecMessage(changeName: string): string {
  const acceptedIds = [...EMPTY_SPEC_DECISION_IDS];
  const specsDir = `${STRICT_WORKFLOW_DIR}/changes/${changeName}/specs/`;
  const emptySpecDecisionCommand = formatEmptySpecDecisionCommand(changeName);
  return (
    `change '${changeName}' has no delta spec files in '${specsDir}' and records no design decision that ` +
    `counts as an explicit empty-spec decision, so proposal handoff is blocked. Fix one of the following: ` +
    `(A) If this change has strict spec impact, author a delta spec by running: ` +
    `strict-spec-cli generate ${changeName} delta-spec --target-spec <spec-id> --operation ADDED ` +
    `--requirement <requirement-id> --strength MUST --statement "<observable behavior>", where <spec-id> is ` +
    `an existing spec id listed in ${STRICT_WORKFLOW_DIR}/specs/INDEX.yaml. ` +
    `(B) If this change is technical-only and no main spec requirement changes, record that decision ` +
    `explicitly by running: ${emptySpecDecisionCommand}. ` +
    `The decision ids accepted as an explicit empty-spec decision are: ${acceptedIds.join(", ")}.`
  );
}

// The generate design invocation that records an empty-spec decision, offered
// alongside the delta-spec suggestion so the machine-readable suggestions list
// carries both remedies the message describes.
export function formatEmptySpecDecisionCommand(changeName: string): string {
  const [firstAcceptedId] = [...EMPTY_SPEC_DECISION_IDS];
  return (
    `strict-spec-cli generate ${changeName} design --decision ${firstAcceptedId} `
    + `--decision-text "<what was decided>" --rationale "<why no main spec requirement changes>"`
  );
}

export function checkProposalReadiness(rootDir: string, changeName: string): ProposalReadinessResult {
  const verification = verifyChange(rootDir, changeName);
  // Pending tasks and not-yet-authored task detail are expected at proposal-handoff time; task
  // completeness is an archive-time gate owned by verify, so it does not block ready.
  const diagnostics = verification.diagnostics.filter(
    (diagnostic) => diagnostic.source !== "task_completion" && diagnostic.source !== "task_completeness",
  );
  diagnostics.push(...checkDeterministicQuestionGateEvidence(rootDir, changeName));
  diagnostics.push(...checkRequirementIntakeEvidence(rootDir, changeName));
  const hasMissingDeltaSpecDiagnostic = listDeltaSpecFiles(rootDir, changeName).length === 0
    && !hasExplicitEmptySpecDecision(rootDir, changeName);
  if (hasMissingDeltaSpecDiagnostic) {
    diagnostics.push({
      source: "proposal_readiness",
      artifactPath: `.strict-spec-driven/changes/${changeName}/specs/`,
      fieldPath: "$",
      message: formatMissingDeltaSpecMessage(changeName),
      expected: "at least one delta spec file or an explicit empty-spec decision",
      actual: "no delta spec files",
    });
  }
  diagnostics.sort((a, b) => {
    const aKey = [a.source, a.artifactPath, a.fieldPath, a.message].join("|");
    const bKey = [b.source, b.artifactPath, b.fieldPath, b.message].join("|");
    return aKey.localeCompare(bKey);
  });

  const suggestions = suggestionsForDiagnostics(rootDir, changeName, diagnostics);
  if (hasMissingDeltaSpecDiagnostic) {
    suggestions.push({
      command: `strict-spec-cli generate ${changeName} delta-spec --target-spec <spec-id> ...`,
      reason: "Create a target-spec-scoped delta spec when the change has strict spec impact.",
    });
    suggestions.push({
      command: formatEmptySpecDecisionCommand(changeName),
      reason: "Record an explicit empty-spec decision when the change is technical-only and no main spec requirement changes.",
    });
  }

  return {
    changeName,
    ready: diagnostics.length === 0,
    diagnostics,
    suggestions,
  };
}
