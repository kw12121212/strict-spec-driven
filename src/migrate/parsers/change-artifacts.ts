import {
  extractBacktickCommand,
  extractMarkdownHeading,
  extractMarkdownSections,
  makeUniqueId,
  normalizeWhitespace,
  parseMarkdownItems,
  parseScopeItems,
  splitFirstSentence,
  toKebabCase,
} from "./shared.js";

const CHANGE_PROPOSAL_SCHEMA_FILE = "templates/strict-spec-driven/schemas/change-proposal.yaml";
const CHANGE_DESIGN_SCHEMA_FILE = "templates/strict-spec-driven/schemas/change-design.yaml";
const TASK_LIST_SCHEMA_FILE = "templates/strict-spec-driven/schemas/task-list.yaml";
const QUESTION_LIST_SCHEMA_FILE = "templates/strict-spec-driven/schemas/question-list.yaml";

const MAX_DECISION_ID_LENGTH = 60;

function truncateId(id: string, maxLen: number): string {
  if (id.length <= maxLen) return id;
  const words = id.split("-");
  let result = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${result}-${words[i]}`;
    if (candidate.length <= maxLen) {
      result = candidate;
    } else {
      break;
    }
  }
  return result.length > 0 ? result : id.slice(0, maxLen).replace(/-+$/, "");
}

export type StrictChangeProposalArtifact = {
  schema: "strict-spec-driven/change-proposal/v1";
  schema_version: 1;
  artifact_type: "change_proposal";
  schema_file: string;
  change: {
    id: string;
    status: "active" | "complete";
  };
  summary: {
    what: string[];
    why: string[];
  };
  scope: {
    in: string[];
    out: string[];
  };
  unchanged_behavior: string[];
};

export type StrictChangeDesignArtifact = {
  schema: "strict-spec-driven/change-design/v1";
  schema_version: 1;
  artifact_type: "change_design";
  schema_file: string;
  change: string;
  approach: string[];
  decisions: Record<string, {
    decision: string;
    rationale: string;
  }>;
  alternatives: Array<{
    option: string;
    reason: string;
  }>;
  risks?: string[];
};

export type StrictTaskListArtifact = {
  schema: "strict-spec-driven/task-list/v2";
  schema_version: 2;
  artifact_type: "task_list";
  schema_file: string;
  change: string;
  sections: Record<string, Record<string, { text: string; status: string; command?: string }>>;
  testing_gates: {
    validation_task: string;
    unit_test_task: string;
  };
};

export type StrictQuestionListArtifact = {
  schema: "strict-spec-driven/question-list/v1";
  schema_version: 1;
  artifact_type: "question_list";
  schema_file: string;
  change: string;
  open: Array<{
    id: string;
    question: string;
    context: string;
    status: "open";
  }>;
  resolved: Array<{
    id: string;
    question: string;
    context: string;
    answer: string;
    status: "resolved";
  }>;
};

export function parseLegacyProposal(
  sourcePath: string,
  content: string,
  fallbackChangeId: string,
  archived: boolean,
): StrictChangeProposalArtifact {
  const body = content.replace(/\r\n/g, "\n");
  const sections = extractMarkdownSections(body);
  const what = parseMarkdownItems(sections.get("What") ?? "");
  const why = parseMarkdownItems(sections.get("Why") ?? "");
  const scope = parseScopeItems(sections.get("Scope") ?? "");
  const unchangedBehavior = parseMarkdownItems(sections.get("Unchanged Behavior") ?? "")
    .filter((item) => item !== "Behaviors that must not change as a result of this change (leave blank if nothing is at risk):");
  const heading = extractMarkdownHeading(body);
  const changeId = heading ? toKebabCase(heading) : fallbackChangeId;

  if (what.length === 0) {
    throw new Error(`proposal '${sourcePath}' is missing ## What content`);
  }
  if (why.length === 0) {
    throw new Error(`proposal '${sourcePath}' is missing ## Why content`);
  }

  return {
    schema: "strict-spec-driven/change-proposal/v1",
    schema_version: 1,
    artifact_type: "change_proposal",
    schema_file: CHANGE_PROPOSAL_SCHEMA_FILE,
    change: {
      id: changeId,
      status: archived ? "complete" : "active",
    },
    summary: {
      what,
      why,
    },
    scope: {
      in: scope.inScope,
      out: scope.outOfScope,
    },
    unchanged_behavior: unchangedBehavior,
  };
}

export function parseLegacyDesign(
  sourcePath: string,
  content: string,
  changeId: string,
): StrictChangeDesignArtifact {
  const sections = extractMarkdownSections(content.replace(/\r\n/g, "\n"));
  const approach = parseMarkdownItems(sections.get("Approach") ?? "", "approach");
  const decisionItems = parseMarkdownItems(sections.get("Key Decisions") ?? "");
  const alternativeItems = parseMarkdownItems(sections.get("Alternatives Considered") ?? "");
  const riskItems = parseMarkdownItems(sections.get("Risks") ?? "");

  if (approach.length === 0) {
    throw new Error(`design '${sourcePath}' is missing ## Approach content`);
  }

  const usedDecisionIds = new Set<string>();
  const decisions: Record<string, { decision: string; rationale: string }> = {};
  for (const item of decisionItems) {
    const boldMatch = item.match(/^\*\*(.+?)\*\*:\s*(.+)$/);
    const decisionText = boldMatch ? boldMatch[2] : item;
    const { first, rest } = splitFirstSentence(decisionText);
    const idSource = boldMatch ? boldMatch[1] : first;
    const rawId = toKebabCase(idSource);
    const truncatedId = rawId.length > MAX_DECISION_ID_LENGTH ? truncateId(rawId, MAX_DECISION_ID_LENGTH) : rawId;
    const id = makeUniqueId(truncatedId, usedDecisionIds);
    decisions[id] = {
      decision: first,
      rationale: rest.length > 0 ? rest : normalizeWhitespace(decisionText),
    };
  }

  const alternatives = alternativeItems.map((item) => {
    const boldMatch = item.match(/^\*\*(.+?)\*\*:\s*(.+)$/);
    const optionText = boldMatch ? boldMatch[1] : splitFirstSentence(item).first;
    const reasonText = boldMatch ? boldMatch[2] : splitFirstSentence(item).rest || item;
    return {
      option: normalizeWhitespace(optionText),
      reason: normalizeWhitespace(reasonText),
    };
  });

  return {
    schema: "strict-spec-driven/change-design/v1",
    schema_version: 1,
    artifact_type: "change_design",
    schema_file: CHANGE_DESIGN_SCHEMA_FILE,
    change: changeId,
    approach,
    decisions,
    alternatives,
    risks: riskItems.length > 0 ? riskItems : undefined,
  };
}

export function parseLegacyTasks(
  sourcePath: string,
  content: string,
  changeId: string,
): StrictTaskListArtifact {
  const sections = extractMarkdownSections(content.replace(/\r\n/g, "\n"));

  type ParsedTask = { id: string; text: string; status: string; command?: string };

  function parseTaskSection(
    sectionName: "Implementation" | "Testing" | "Verification",
  ): ParsedTask[] {
    const sectionText = sections.get(sectionName) ?? "";
    const tasks: ParsedTask[] = [];
    let currentText = "";
    let currentStatus: "pending" | "complete" | null = null;
    let index = 0;

    function flushCurrent(): void {
      if (!currentStatus) {
        return;
      }
      const text = normalizeWhitespace(currentText);
      if (text.length === 0) {
        throw new Error(`${sectionName} task in '${sourcePath}' is missing text`);
      }
      index += 1;
      const task: ParsedTask = {
        id: `${toKebabCase(sectionName)}-${index}`,
        text,
        status: currentStatus,
      };
      if (sectionName === "Testing") {
        const command = extractBacktickCommand(text);
        if (!command) {
          throw new Error(`Testing task '${text}' in '${sourcePath}' is missing a backticked command`);
        }
        task.command = command;
      }
      tasks.push(task);
      currentText = "";
      currentStatus = null;
    }

    for (const rawLine of sectionText.split("\n")) {
      const trimmed = rawLine.trim();
      if (trimmed.length === 0 || trimmed.startsWith("<!--")) {
        continue;
      }
      const taskMatch = trimmed.match(/^- \[(x| )\]\s+(.+)$/i);
      if (taskMatch) {
        flushCurrent();
        currentStatus = taskMatch[1].toLowerCase() === "x" ? "complete" : "pending";
        currentText = taskMatch[2];
        continue;
      }
      if (!currentStatus) {
        continue;
      }
      currentText = `${currentText} ${trimmed}`.trim();
    }

    flushCurrent();

    if (tasks.length === 0) {
      throw new Error(`tasks '${sourcePath}' is missing the required ${sectionName} tasks`);
    }
    return tasks;
  }

  const implementationTasks = parseTaskSection("Implementation");
  const testingTasks = parseTaskSection("Testing");
  const verificationTasks = parseTaskSection("Verification");

  if (testingTasks.length < 2) {
    throw new Error(`tasks '${sourcePath}' must contain at least two Testing tasks for validation and unit test gates`);
  }

  function toTaskMap(tasks: ParsedTask[]): Record<string, { text: string; status: string; command?: string }> {
    const map: Record<string, { text: string; status: string; command?: string }> = {};
    for (const t of tasks) {
      const { id, ...rest } = t;
      map[id] = rest;
    }
    return map;
  }

  return {
    schema: "strict-spec-driven/task-list/v2",
    schema_version: 2,
    artifact_type: "task_list",
    schema_file: TASK_LIST_SCHEMA_FILE,
    change: changeId,
    sections: {
      Implementation: toTaskMap(implementationTasks),
      Testing: toTaskMap(testingTasks),
      Verification: toTaskMap(verificationTasks),
    },
    testing_gates: {
      validation_task: testingTasks[0].id,
      unit_test_task: testingTasks[1].id,
    },
  };
}

export function parseLegacyQuestions(
  sourcePath: string,
  content: string,
  changeId: string,
): StrictQuestionListArtifact {
  const sections = extractMarkdownSections(content.replace(/\r\n/g, "\n"));
  const usedIds = new Set<string>();

  function parseQuestionSection(sectionName: "Open" | "Resolved"): Array<{
    id: string;
    question: string;
    context: string;
    answer?: string;
    status: "open" | "resolved";
  }> {
    const results: Array<{
      id: string;
      question: string;
      context: string;
      answer?: string;
      status: "open" | "resolved";
    }> = [];
    let currentQuestion = "";
    let contextLines: string[] = [];
    let answerLines: string[] = [];
    let currentField: "question" | "context" | "answer" | null = null;

    function flushCurrent(): void {
      const question = normalizeWhitespace(currentQuestion);
      if (question.length === 0) {
        currentQuestion = "";
        contextLines = [];
        answerLines = [];
        currentField = null;
        return;
      }

      const context = normalizeWhitespace(contextLines.join(" "));
      if (context.length === 0) {
        throw new Error(`question '${question}' in '${sourcePath}' is missing Context`);
      }

      const record = {
        id: makeUniqueId(toKebabCase(question), usedIds),
        question,
        context,
        status: sectionName === "Open" ? "open" as const : "resolved" as const,
      };

      if (sectionName === "Resolved") {
        const answer = normalizeWhitespace(answerLines.join(" "));
        if (answer.length === 0) {
          throw new Error(`resolved question '${question}' in '${sourcePath}' is missing an answer`);
        }
        results.push({
          ...record,
          answer,
        });
      } else {
        results.push(record);
      }

      currentQuestion = "";
      contextLines = [];
      answerLines = [];
      currentField = null;
    }

    const sectionText = sections.get(sectionName) ?? "";
    for (const rawLine of sectionText.split("\n")) {
      const trimmed = rawLine.trim();
      if (trimmed.length === 0 || trimmed.startsWith("<!--")) {
        continue;
      }
      const questionMatch = trimmed.match(/^- \[(x| )\]\s+Q:\s+(.+)$/i);
      if (questionMatch) {
        flushCurrent();
        currentQuestion = questionMatch[2];
        currentField = "question";
        continue;
      }
      const contextMatch = trimmed.match(/^Context:\s+(.+)$/);
      if (contextMatch) {
        contextLines.push(contextMatch[1]);
        currentField = "context";
        continue;
      }
      const answerMatch = trimmed.match(/^A:\s+(.+)$/);
      if (answerMatch) {
        answerLines.push(answerMatch[1]);
        currentField = "answer";
        continue;
      }
      if (currentField === "context") {
        contextLines.push(trimmed);
      } else if (currentField === "answer") {
        answerLines.push(trimmed);
      } else if (currentField === "question") {
        currentQuestion = `${currentQuestion} ${trimmed}`.trim();
      }
    }

    flushCurrent();
    return results;
  }

  const openQuestions = parseQuestionSection("Open");
  const resolvedQuestions = parseQuestionSection("Resolved");

  return {
    schema: "strict-spec-driven/question-list/v1",
    schema_version: 1,
    artifact_type: "question_list",
    schema_file: QUESTION_LIST_SCHEMA_FILE,
    change: changeId,
    open: openQuestions.map((entry) => ({
      id: entry.id,
      question: entry.question,
      context: entry.context,
      status: "open" as const,
    })),
    resolved: resolvedQuestions.map((entry) => ({
      id: entry.id,
      question: entry.question,
      context: entry.context,
      answer: entry.answer ?? "",
      status: "resolved" as const,
    })),
  };
}
