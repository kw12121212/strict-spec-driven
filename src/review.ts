import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { verifyChange } from "./verify.js";
import { parseYamlDocument } from "./yaml.js";

const STRICT_WORKFLOW_DIR = ".strict-spec-driven";

type ReviewFindingCategory =
  | "requirement-quality"
  | "mapping-coverage"
  | "delta-coherence"
  | "proposal-clarity";

export type ReviewFinding = {
  category: ReviewFindingCategory;
  message: string;
  path?: string;
};

export type ReviewResult = {
  valid: boolean;
  changeName: string;
  findings: ReviewFinding[];
  findingCount: number;
};

type Requirement = {
  id?: unknown;
  statement?: unknown;
  scenarios?: unknown;
};

type DeltaSpecArtifact = {
  target_spec?: unknown;
  mapping?: {
    implementation?: unknown;
    tests?: unknown;
  };
  operations?: {
    ADDED?: Array<{ requirement?: Requirement }>;
    MODIFIED?: Array<{ replacement?: Requirement }>;
    REMOVED?: unknown[];
  };
};

type ParsedDeltaSpec = {
  path: string;
  artifact: DeltaSpecArtifact;
};

type LoadedArtifacts = {
  proposal: Record<string, unknown>;
  deltaSpecs: ParsedDeltaSpec[];
};

function normalizeRepoRelativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function listYamlFiles(directoryPath: string): string[] {
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

function parseYamlArtifact(filePath: string): unknown {
  const raw = readFileSync(filePath, "utf8");
  return parseYamlDocument<unknown>(raw);
}

function readChangeArtifacts(rootDir: string, changeName: string): LoadedArtifacts {
  const changeDir = path.join(rootDir, STRICT_WORKFLOW_DIR, "changes", changeName);
  if (!existsSync(changeDir) || !statSync(changeDir).isDirectory()) {
    throw new Error(`change '${changeName}' not found`);
  }

  const requiredArtifacts = ["proposal.yaml", "design.yaml", "tasks.yaml", "questions.yaml"];
  let proposal: Record<string, unknown> = {};

  for (const artifactName of requiredArtifacts) {
    const artifactPath = path.join(changeDir, artifactName);
    if (!existsSync(artifactPath)) {
      throw new Error(`required artifact '${artifactName}' is missing`);
    }

    try {
      const parsed = parseYamlArtifact(artifactPath);
      if (artifactName === "proposal.yaml") {
        proposal = toObject(parsed);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const displayPath = normalizeRepoRelativePath(rootDir, artifactPath);
      throw new Error(`failed to parse '${displayPath}': ${message}`);
    }
  }

  const specsDir = path.join(changeDir, "specs");
  const deltaSpecs: ParsedDeltaSpec[] = [];
  for (const deltaPath of listYamlFiles(specsDir)) {
    try {
      deltaSpecs.push({
        path: normalizeRepoRelativePath(rootDir, deltaPath),
        artifact: parseYamlArtifact(deltaPath) as DeltaSpecArtifact,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const displayPath = normalizeRepoRelativePath(rootDir, deltaPath);
      throw new Error(`failed to parse '${displayPath}': ${message}`);
    }
  }

  return {
    proposal,
    deltaSpecs,
  };
}

function collectRequirementQualityFindings(deltaSpecs: ParsedDeltaSpec[]): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  for (const delta of deltaSpecs) {
    const operations = delta.artifact.operations ?? {};
    const requirements: Requirement[] = [];

    for (const entry of operations.ADDED ?? []) {
      if (entry?.requirement) {
        requirements.push(entry.requirement);
      }
    }
    for (const entry of operations.MODIFIED ?? []) {
      if (entry?.replacement) {
        requirements.push(entry.replacement);
      }
    }

    for (const requirement of requirements) {
      const id = typeof requirement.id === "string" && requirement.id.length > 0 ? requirement.id : "<missing-id>";
      const statement = typeof requirement.statement === "string" ? requirement.statement.trim() : "";
      const scenarios = requirement.scenarios && typeof requirement.scenarios === "object" && !Array.isArray(requirement.scenarios)
        ? Object.keys(requirement.scenarios) : [];

      if (statement.length < 20) {
        findings.push({
          category: "requirement-quality",
          path: delta.path,
          message: `requirement '${id}' statement is too short to be reviewable`,
        });
      }
      if (scenarios.length === 0) {
        findings.push({
          category: "requirement-quality",
          path: delta.path,
          message: `requirement '${id}' has no scenarios`,
        });
      }
    }
  }

  return findings;
}

function collectMappingCoverageFindings(deltaSpecs: ParsedDeltaSpec[]): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  for (const delta of deltaSpecs) {
    const mapping = delta.artifact.mapping;
    const implementation = Array.isArray(mapping?.implementation) ? mapping?.implementation : [];
    const tests = Array.isArray(mapping?.tests) ? mapping?.tests : [];

    if (implementation.length === 0) {
      findings.push({
        category: "mapping-coverage",
        path: delta.path,
        message: "delta spec mapping.implementation is empty",
      });
    }
    if (tests.length === 0) {
      findings.push({
        category: "mapping-coverage",
        path: delta.path,
        message: "delta spec mapping.tests is empty",
      });
    }
  }

  return findings;
}

function collectDeltaCoherenceFindings(deltaSpecs: ParsedDeltaSpec[]): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  for (const delta of deltaSpecs) {
    const operations = delta.artifact.operations ?? {};
    const added = Array.isArray(operations.ADDED) ? operations.ADDED.length : 0;
    const modified = Array.isArray(operations.MODIFIED) ? operations.MODIFIED.length : 0;
    const removed = Array.isArray(operations.REMOVED) ? operations.REMOVED.length : 0;
    const totalOperations = added + modified + removed;

    if (totalOperations === 0) {
      findings.push({
        category: "delta-coherence",
        path: delta.path,
        message: "delta spec has no ADDED, MODIFIED, or REMOVED operations",
      });
    }

    if (typeof delta.artifact.target_spec !== "string" || delta.artifact.target_spec.length === 0) {
      findings.push({
        category: "delta-coherence",
        path: delta.path,
        message: "delta spec target_spec is missing or empty",
      });
    }
  }

  return findings;
}

function collectProposalClarityFindings(proposal: Record<string, unknown>): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const summary = toObject(proposal.summary);
  const summaryWhat = Array.isArray(summary.what) ? summary.what : [];
  const summaryWhy = Array.isArray(summary.why) ? summary.why : [];
  const unchangedBehavior = Array.isArray(proposal.unchanged_behavior) ? proposal.unchanged_behavior : [];

  if (summaryWhat.length === 0) {
    findings.push({
      category: "proposal-clarity",
      path: "proposal.yaml",
      message: "proposal summary.what is empty",
    });
  }
  if (summaryWhy.length === 0) {
    findings.push({
      category: "proposal-clarity",
      path: "proposal.yaml",
      message: "proposal summary.why is empty",
    });
  }
  if (unchangedBehavior.length === 0) {
    findings.push({
      category: "proposal-clarity",
      path: "proposal.yaml",
      message: "proposal unchanged_behavior is empty",
    });
  }

  return findings;
}

function sortFindings(findings: ReviewFinding[]): ReviewFinding[] {
  return findings.sort((left, right) => {
    const leftKey = [left.category, left.path ?? "", left.message].join("|");
    const rightKey = [right.category, right.path ?? "", right.message].join("|");
    return leftKey.localeCompare(rightKey);
  });
}

export function reviewChange(rootDir: string, changeName: string): ReviewResult {
  const artifacts = readChangeArtifacts(rootDir, changeName);
  const verifyResult = verifyChange(rootDir, changeName);

  const findings: ReviewFinding[] = [
    ...collectRequirementQualityFindings(artifacts.deltaSpecs),
    ...collectMappingCoverageFindings(artifacts.deltaSpecs),
    ...collectDeltaCoherenceFindings(artifacts.deltaSpecs),
    ...collectProposalClarityFindings(artifacts.proposal),
  ];

  if (verifyResult.diagnostics.length > 0) {
    findings.push({
      category: "proposal-clarity",
      message: `verify produced ${verifyResult.diagnostics.length} diagnostic(s); resolve lifecycle blockers separately`,
    });
  }

  const sorted = sortFindings(findings);
  return {
    valid: true,
    changeName,
    findings: sorted,
    findingCount: sorted.length,
  };
}
