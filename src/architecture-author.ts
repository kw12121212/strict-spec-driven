import { existsSync } from "fs";
import path from "path";
import { getArchitectureArtifactPath } from "./architecture.js";
import { loadBundledSchemaByArtifactType, validateArtifact } from "./validation.js";
import { commitYamlMutation, type YamlMutationResult } from "./yaml-mutation.js";
import { parseYamlFile } from "./yaml.js";

const ARCHITECTURE_SCHEMA_ID = "strict-spec-driven/architecture/v1";
const ARCHITECTURE_ARTIFACT_PATH = ".strict-spec-driven/architecture.yaml";

type RawRecord = Record<string, unknown>;

export type ArchitectureAuthorInput = {
  id?: string;
  title?: string;
  component?: { id: string; title?: string; responsibility?: string; boundaries: string[]; dependsOn: string[]; implementation: string[] };
  dataFlow?: { id: string; title?: string; trigger?: string; steps: string[]; components: string[] };
  decision?: { id: string; title?: string; statement?: string; rationale?: string; status?: string; alternatives: string[] };
  removeComponents: string[];
  removeDataFlows: string[];
  removeDecisions: string[];
  removeBoundaries: string[];
  removeDependencies: string[];
  removeImplementations: string[];
  removeFlowSteps: string[];
  removeFlowComponents: string[];
  removeAlternatives: string[];
  delete: boolean;
};

export type ArchitectureAuthorResult = YamlMutationResult & {
  artifactPath: string;
  operation: "create" | "update" | "delete";
  generatedDocument: { path: "ARCHITECTURE.md"; command: "strict-spec-cli architecture-generate"; required: boolean };
};

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawRecord : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function appendUnique(existing: string[], additions: string[]): string[] {
  return [...new Set([...existing, ...additions])];
}

function splitScoped(value: string): [string, string] {
  const delimiter = value.indexOf(":");
  if (delimiter <= 0 || delimiter === value.length - 1) throw new Error(`expected owner:value, received '${value}'`);
  return [value.slice(0, delimiter), value.slice(delimiter + 1)];
}

function removeScoped(collection: RawRecord, encoded: string, field: string): void {
  const [owner, value] = splitScoped(encoded);
  const entry = asRecord(collection[owner]);
  entry[field] = strings(entry[field]).filter((item) => item !== value);
  collection[owner] = entry;
}

function hasEditIntent(input: ArchitectureAuthorInput): boolean {
  return input.id !== undefined || input.title !== undefined || input.component !== undefined || input.dataFlow !== undefined
    || input.decision !== undefined || input.removeComponents.length > 0 || input.removeDataFlows.length > 0
    || input.removeDecisions.length > 0 || input.removeBoundaries.length > 0 || input.removeDependencies.length > 0
    || input.removeImplementations.length > 0 || input.removeFlowSteps.length > 0 || input.removeFlowComponents.length > 0
    || input.removeAlternatives.length > 0;
}

function baseArtifact(input: ArchitectureAuthorInput): RawRecord {
  if (input.id === undefined || input.title === undefined) {
    throw new Error("new architecture artifacts require --id and --title");
  }
  return {
    schema: ARCHITECTURE_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "architecture",
    schema_file: "templates/strict-spec-driven/schemas/architecture.yaml",
    architecture: { id: input.id, title: input.title },
    components: {},
    data_flows: {},
    decisions: {},
  };
}

function relationshipIssues(candidate: RawRecord): Array<{ code: string; fieldPath: string; message: string; expected: string; actual: string }> {
  const issues: Array<{ code: string; fieldPath: string; message: string; expected: string; actual: string }> = [];
  const components = asRecord(candidate.components);
  const ids = Object.keys(components);
  for (const [id, rawComponent] of Object.entries(components)) {
    for (const dependency of strings(asRecord(rawComponent).depends_on)) {
      if (dependency === id || !(dependency in components)) {
        issues.push({ code: "reference", fieldPath: `$.components.${id}.depends_on`, message: "component dependencies must name another declared component", expected: ids.filter((value) => value !== id).join(", "), actual: dependency });
      }
    }
  }
  for (const [id, rawFlow] of Object.entries(asRecord(candidate.data_flows))) {
    for (const component of strings(asRecord(rawFlow).components)) {
      if (!(component in components)) {
        issues.push({ code: "reference", fieldPath: `$.data_flows.${id}.components`, message: "data-flow components must name declared architecture components", expected: ids.join(", "), actual: component });
      }
    }
  }
  return issues;
}

export function authorArchitecture(rootDir: string, input: ArchitectureAuthorInput): ArchitectureAuthorResult {
  const absolutePath = getArchitectureArtifactPath(rootDir);
  const exists = existsSync(absolutePath);
  const operation = input.delete ? "delete" : exists ? "update" : "create";
  if (input.delete && hasEditIntent(input)) throw new Error("--delete cannot be combined with architecture editing flags");
  if (!input.delete && !hasEditIntent(input)) throw new Error("architecture-edit requires semantic fields, named removals, or --delete");

  let candidate: RawRecord | undefined;
  if (!input.delete) {
    candidate = exists ? parseYamlFile<RawRecord>(absolutePath) : baseArtifact(input);
    const header = asRecord(candidate.architecture);
    if (input.id !== undefined) header.id = input.id;
    if (input.title !== undefined) header.title = input.title;
    candidate.architecture = header;
    const components = asRecord(candidate.components);
    if (input.component !== undefined) {
      const current = asRecord(components[input.component.id]);
      if (Object.keys(current).length === 0 && (input.component.title === undefined || input.component.responsibility === undefined)) {
        throw new Error("a new component requires --component-title and --component-responsibility");
      }
      const component = { ...current };
      if (input.component.title !== undefined) component.title = input.component.title;
      if (input.component.responsibility !== undefined) component.responsibility = input.component.responsibility;
      component.boundaries = appendUnique(strings(component.boundaries), input.component.boundaries);
      component.depends_on = appendUnique(strings(component.depends_on), input.component.dependsOn);
      const mapping = asRecord(component.mapping);
      mapping.implementation = appendUnique(strings(mapping.implementation), input.component.implementation);
      component.mapping = mapping;
      components[input.component.id] = component;
    }
    for (const id of input.removeComponents) delete components[id];
    input.removeBoundaries.forEach((value) => removeScoped(components, value, "boundaries"));
    input.removeDependencies.forEach((value) => removeScoped(components, value, "depends_on"));
    for (const encoded of input.removeImplementations) {
      const [owner, value] = splitScoped(encoded);
      const component = asRecord(components[owner]);
      const mapping = asRecord(component.mapping);
      mapping.implementation = strings(mapping.implementation).filter((item) => item !== value);
      component.mapping = mapping;
      components[owner] = component;
    }
    candidate.components = components;

    const dataFlows = asRecord(candidate.data_flows);
    if (input.dataFlow !== undefined) {
      const current = asRecord(dataFlows[input.dataFlow.id]);
      if (Object.keys(current).length === 0 && (input.dataFlow.title === undefined || input.dataFlow.trigger === undefined || input.dataFlow.steps.length === 0)) {
        throw new Error("a new data flow requires --flow-title, --flow-trigger, and at least one --flow-step");
      }
      const flow = { ...current };
      if (input.dataFlow.title !== undefined) flow.title = input.dataFlow.title;
      if (input.dataFlow.trigger !== undefined) flow.trigger = input.dataFlow.trigger;
      flow.steps = appendUnique(strings(flow.steps), input.dataFlow.steps);
      flow.components = appendUnique(strings(flow.components), input.dataFlow.components);
      dataFlows[input.dataFlow.id] = flow;
    }
    for (const id of input.removeDataFlows) delete dataFlows[id];
    input.removeFlowSteps.forEach((value) => removeScoped(dataFlows, value, "steps"));
    input.removeFlowComponents.forEach((value) => removeScoped(dataFlows, value, "components"));
    candidate.data_flows = dataFlows;

    const decisions = asRecord(candidate.decisions);
    if (input.decision !== undefined) {
      const current = asRecord(decisions[input.decision.id]);
      if (Object.keys(current).length === 0 && (input.decision.title === undefined || input.decision.statement === undefined || input.decision.rationale === undefined || input.decision.status === undefined)) {
        throw new Error("a new decision requires --decision-title, --decision-statement, --decision-rationale, and --decision-status");
      }
      const decision = { ...current };
      if (input.decision.title !== undefined) decision.title = input.decision.title;
      if (input.decision.statement !== undefined) decision.statement = input.decision.statement;
      if (input.decision.rationale !== undefined) decision.rationale = input.decision.rationale;
      if (input.decision.status !== undefined) decision.status = input.decision.status;
      decision.alternatives = appendUnique(strings(decision.alternatives), input.decision.alternatives);
      decisions[input.decision.id] = decision;
    }
    for (const id of input.removeDecisions) delete decisions[id];
    input.removeAlternatives.forEach((value) => removeScoped(decisions, value, "alternatives"));
    candidate.decisions = decisions;
  }

  const mutation = commitYamlMutation({
    rootDir,
    mutations: [{
      artifactFamily: "architecture-state",
      artifactId: "architecture",
      schemaId: ARCHITECTURE_SCHEMA_ID,
      familyRoot: path.join(rootDir, ".strict-spec-driven"),
      absolutePath,
      operation,
      ...(candidate === undefined ? {} : {
        candidate,
        validateCandidate: (value: unknown, context: { artifactPath: string }) => {
          const validation = validateArtifact(loadBundledSchemaByArtifactType("architecture"), value, context.artifactPath);
          return [
            ...validation.diagnostics.map((entry) => ({ code: entry.source, fieldPath: entry.fieldPath, message: entry.message, expected: entry.expected, actual: entry.actual })),
            ...relationshipIssues(asRecord(value)),
          ];
        },
      }),
    }],
  });
  const changed = mutation.changes.some((entry) => entry.changed);
  return {
    ...mutation,
    artifactPath: ARCHITECTURE_ARTIFACT_PATH,
    operation,
    generatedDocument: { path: "ARCHITECTURE.md", command: "strict-spec-cli architecture-generate", required: changed },
  };
}
