import {
  extractMarkdownFrontmatter,
  extractMarkdownHeading,
  getLegacySpecMapping,
  makeUniqueId,
  normalizeWhitespace,
  parseRequirementStrength,
  toKebabCase,
  type ScenarioStepKind,
  type StrictRequirement,
  type StrictScenarioStep,
  type StrictScenarios,
  type StrictRequirements,
  type StrictSpecMapping,
} from "./shared.js";

const MAIN_SPEC_SCHEMA_FILE = "templates/strict-spec-driven/schemas/main-spec.yaml";
const DELTA_SPEC_SCHEMA_FILE = "templates/strict-spec-driven/schemas/delta-spec.yaml";

export type StrictMainSpecArtifact = {
  schema: "strict-spec-driven/main-spec/v1";
  schema_version: 1;
  artifact_type: "main_spec";
  schema_file: string;
  spec: {
    id: string;
    title: string;
  };
  mapping: StrictSpecMapping;
  requirements: StrictRequirements;
};

export type StrictDeltaSpecArtifact = {
  schema: "strict-spec-driven/delta-spec/v1";
  schema_version: 1;
  artifact_type: "delta_spec";
  schema_file: string;
  target_spec: string;
  mapping: StrictSpecMapping;
  operations: {
    ADDED: Array<{ requirement: StrictRequirement }>;
    MODIFIED: Array<{ target_requirement: string; replacement: StrictRequirement }>;
    REMOVED: Array<{ target_requirement: string; reason: string }>;
  };
};

function buildSpecIdFromRelativePath(relativeSpecPath: string): string {
  return toKebabCase(relativeSpecPath.replace(/\.md$/i, "").replace(/\//g, "-"));
}

function buildStep(kind: ScenarioStepKind, text: string): StrictScenarioStep {
  return { [kind]: text } as StrictScenarioStep;
}

export function parseLegacyMainSpec(
  sourcePath: string,
  content: string,
): StrictMainSpecArtifact {
  const { frontmatter, body } = extractMarkdownFrontmatter(content);
  const mapping = getLegacySpecMapping(frontmatter);
  const title = extractMarkdownHeading(body);
  if (!title) {
    throw new Error(`main spec '${sourcePath}' is missing a top-level '# <title>' heading`);
  }

  const requirements: StrictRequirements = {};
  const requirementIds = new Set<string>();
  let currentRequirementId: string | null = null;
  let currentStatementLines: string[] = [];
  let currentScenarios: StrictScenarios = {};
  let currentScenarioTitle: string | null = null;
  let currentScenarioSteps: StrictScenarioStep[] = [];
  let currentScenarioIds = new Set<string>();

  function flushScenario(): void {
    if (!currentScenarioTitle) {
      return;
    }
    if (currentScenarioSteps.length === 0) {
      throw new Error(`scenario '${currentScenarioTitle}' in '${sourcePath}' is missing steps`);
    }
    const id = makeUniqueId(toKebabCase(currentScenarioTitle), currentScenarioIds);
    currentScenarios[id] = currentScenarioSteps;
    currentScenarioTitle = null;
    currentScenarioSteps = [];
  }

  function flushRequirement(): void {
    if (!currentRequirementId) {
      return;
    }
    flushScenario();
    const statement = normalizeWhitespace(currentStatementLines.join(" "));
    if (statement.length === 0) {
      throw new Error(`requirement '${currentRequirementId}' in '${sourcePath}' is missing a statement`);
    }
    const id = makeUniqueId(currentRequirementId, requirementIds);
    requirements[id] = {
      strength: parseRequirementStrength(statement, `requirement '${currentRequirementId}' in '${sourcePath}'`),
      statement,
      scenarios: currentScenarios,
    };
    currentRequirementId = null;
    currentStatementLines = [];
    currentScenarios = {};
    currentScenarioIds = new Set<string>();
  }

  for (const rawLine of body.split("\n")) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const requirementMatch = trimmed.match(/^### Requirement:\s+(.+)$/);
    if (requirementMatch) {
      flushRequirement();
      currentRequirementId = normalizeWhitespace(requirementMatch[1]);
      continue;
    }

    const scenarioMatch = trimmed.match(/^#### Scenario:\s+(.+)$/);
    if (scenarioMatch) {
      if (!currentRequirementId) {
        throw new Error(`scenario '${scenarioMatch[1]}' in '${sourcePath}' appears before any requirement`);
      }
      flushScenario();
      currentScenarioTitle = normalizeWhitespace(scenarioMatch[1]);
      continue;
    }

    const stepMatch = trimmed.match(/^- (GIVEN|WHEN|THEN|AND)\s+(.+)$/);
    if (stepMatch) {
      if (!currentScenarioTitle) {
        throw new Error(`step '${trimmed}' in '${sourcePath}' appears outside a scenario`);
      }
      currentScenarioSteps.push(buildStep(
        stepMatch[1] as ScenarioStepKind,
        normalizeWhitespace(stepMatch[2]),
      ));
      continue;
    }

    if (trimmed.startsWith("# ")) {
      continue;
    }

    if (currentScenarioTitle && currentScenarioSteps.length > 0) {
      const lastStep = currentScenarioSteps[currentScenarioSteps.length - 1];
      const kind = Object.keys(lastStep)[0] as ScenarioStepKind;
      lastStep[kind] = normalizeWhitespace(`${lastStep[kind]} ${trimmed}`);
      continue;
    }

    if (!currentRequirementId) {
      continue;
    }

    currentStatementLines.push(trimmed);
  }

  flushRequirement();

  if (Object.keys(requirements).length === 0) {
    throw new Error(`main spec '${sourcePath}' does not contain any requirements`);
  }

  const relativeSpecPath = sourcePath.replace(".spec-driven/specs/", "");
  return {
    schema: "strict-spec-driven/main-spec/v1",
    schema_version: 1,
    artifact_type: "main_spec",
    schema_file: MAIN_SPEC_SCHEMA_FILE,
    spec: {
      id: buildSpecIdFromRelativePath(relativeSpecPath),
      title,
    },
    mapping,
    requirements,
  };
}

export function parseLegacyDeltaSpec(
  sourcePath: string,
  content: string,
): StrictDeltaSpecArtifact {
  const { frontmatter, body } = extractMarkdownFrontmatter(content);
  const mapping = getLegacySpecMapping(frontmatter);
  const relativePathMatch = sourcePath.match(/^\.spec-driven\/changes\/(?:archive\/[^/]+\/|[^/]+\/)specs\/(.+)\.md$/);
  if (!relativePathMatch) {
    throw new Error(`delta spec '${sourcePath}' is not under a recognized change specs directory`);
  }

  const operations: StrictDeltaSpecArtifact["operations"] = {
    ADDED: [],
    MODIFIED: [],
    REMOVED: [],
  };
  let currentOperation: keyof StrictDeltaSpecArtifact["operations"] | null = null;
  let currentRequirementId: string | null = null;
  let currentScenarioTitle: string | null = null;
  let currentScenarioSteps: StrictScenarioStep[] = [];
  let currentScenarioIds = new Set<string>();
  let currentStatementLines: string[] = [];
  let currentPreviousLines: string[] = [];
  let currentReasonLines: string[] = [];
  let currentScenarios: StrictScenarios = {};

  function flushScenario(): void {
    if (!currentScenarioTitle || currentScenarioSteps.length === 0) {
      return;
    }
    const id = makeUniqueId(toKebabCase(currentScenarioTitle), currentScenarioIds);
    currentScenarios[id] = currentScenarioSteps;
    currentScenarioTitle = null;
    currentScenarioSteps = [];
  }

  function flushRequirement(): void {
    if (!currentRequirementId || !currentOperation) {
      return;
    }
    flushScenario();

    if (currentOperation === "ADDED") {
      const statement = normalizeWhitespace(currentStatementLines.join(" "));
      if (statement.length === 0) {
        throw new Error(`ADDED requirement '${currentRequirementId}' in '${sourcePath}' is missing a statement`);
      }
      operations.ADDED.push({
        requirement: {
          id: currentRequirementId,
          strength: parseRequirementStrength(statement, `ADDED requirement '${currentRequirementId}' in '${sourcePath}'`),
          statement,
          scenarios: currentScenarios,
        },
      });
    } else if (currentOperation === "MODIFIED") {
      const statement = normalizeWhitespace(currentStatementLines.join(" "));
      if (statement.length === 0) {
        throw new Error(`MODIFIED requirement '${currentRequirementId}' in '${sourcePath}' is missing a replacement statement`);
      }
      operations.MODIFIED.push({
        target_requirement: currentRequirementId,
        replacement: {
          id: currentRequirementId,
          strength: parseRequirementStrength(statement, `MODIFIED requirement '${currentRequirementId}' in '${sourcePath}'`),
          statement,
          scenarios: currentScenarios,
        },
      });
    } else {
      const reason = normalizeWhitespace(currentReasonLines.join(" "));
      if (reason.length === 0) {
        throw new Error(`REMOVED requirement '${currentRequirementId}' in '${sourcePath}' is missing a reason`);
      }
      operations.REMOVED.push({
        target_requirement: currentRequirementId,
        reason,
      });
    }

    currentRequirementId = null;
    currentScenarioTitle = null;
    currentScenarioSteps = [];
    currentScenarioIds = new Set<string>();
    currentStatementLines = [];
    currentPreviousLines = [];
    currentReasonLines = [];
    currentScenarios = {};
  }

  for (const rawLine of body.split("\n")) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const operationMatch = trimmed.match(/^## (ADDED|MODIFIED|REMOVED) Requirements$/);
    if (operationMatch) {
      flushRequirement();
      currentOperation = operationMatch[1] as keyof StrictDeltaSpecArtifact["operations"];
      continue;
    }

    const requirementMatch = trimmed.match(/^### Requirement:\s+(.+)$/);
    if (requirementMatch) {
      if (!currentOperation) {
        throw new Error(`requirement '${requirementMatch[1]}' in '${sourcePath}' appears before any delta operation section`);
      }
      flushRequirement();
      currentRequirementId = normalizeWhitespace(requirementMatch[1]);
      continue;
    }

    const scenarioMatch = trimmed.match(/^#### Scenario:\s+(.+)$/);
    if (scenarioMatch) {
      if (!currentRequirementId || currentOperation === "REMOVED") {
        throw new Error(`scenario '${scenarioMatch[1]}' in '${sourcePath}' is not valid in the current delta section`);
      }
      flushScenario();
      currentScenarioTitle = normalizeWhitespace(scenarioMatch[1]);
      continue;
    }

    const stepMatch = trimmed.match(/^- (GIVEN|WHEN|THEN|AND)\s+(.+)$/);
    if (stepMatch) {
      if (!currentScenarioTitle) {
        throw new Error(`step '${trimmed}' in '${sourcePath}' appears outside a scenario`);
      }
      currentScenarioSteps.push(buildStep(
        stepMatch[1] as ScenarioStepKind,
        normalizeWhitespace(stepMatch[2]),
      ));
      continue;
    }

    if (!currentRequirementId || !currentOperation) {
      continue;
    }

    if (currentScenarioTitle && currentScenarioSteps.length > 0) {
      const lastStep = currentScenarioSteps[currentScenarioSteps.length - 1];
      const kind = Object.keys(lastStep)[0] as ScenarioStepKind;
      lastStep[kind] = normalizeWhitespace(`${lastStep[kind]} ${trimmed}`);
      continue;
    }

    if (currentOperation === "REMOVED") {
      const reasonMatch = trimmed.match(/^Reason:\s*(.+)$/);
      if (reasonMatch) {
        currentReasonLines.push(reasonMatch[1]);
      } else if (currentReasonLines.length > 0) {
        currentReasonLines.push(trimmed);
      } else {
        throw new Error(`REMOVED requirement '${currentRequirementId}' in '${sourcePath}' is missing a 'Reason:' line`);
      }
      continue;
    }

    if (currentOperation === "MODIFIED" && trimmed.startsWith("Previously:")) {
      currentPreviousLines.push(trimmed.slice("Previously:".length).trim());
      continue;
    }

    if (currentOperation === "MODIFIED" && currentStatementLines.length === 0 && currentPreviousLines.length > 0) {
      if (/^The system (MUST|SHOULD|MAY)\b/.test(trimmed)) {
        currentStatementLines.push(trimmed);
      } else {
        currentPreviousLines.push(trimmed);
      }
      continue;
    }

    currentStatementLines.push(trimmed);
  }

  flushRequirement();

  return {
    schema: "strict-spec-driven/delta-spec/v1",
    schema_version: 1,
    artifact_type: "delta_spec",
    schema_file: DELTA_SPEC_SCHEMA_FILE,
    target_spec: buildSpecIdFromRelativePath(relativePathMatch[1]),
    mapping,
    operations,
  };
}
