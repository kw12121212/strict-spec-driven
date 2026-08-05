import { existsSync } from "fs";
import path from "path";
import { readBundledScaffoldTemplate } from "./scaffold.js";
import { loadBundledSchemaByArtifactType, validateArtifact } from "./validation.js";
import { commitYamlMutation, type YamlMutationResult } from "./yaml-mutation.js";
import { parseYamlDocument, parseYamlFile } from "./yaml.js";

const DESIGN_SCHEMA_ID = "strict-spec-driven/design-system/v1";
const DESIGN_ARTIFACT_PATH = ".strict-spec-driven/design-system.yaml";
const TOKEN_GROUPS = new Set(["colors", "typography", "layout", "elevation", "shapes"]);

type RawRecord = Record<string, unknown>;

export type DesignSystemAuthorInput = {
  id?: string;
  title?: string;
  token?: { group: string; name: string; value?: string; properties: string[] };
  component?: { id: string; title?: string; description?: string; tokens: string[]; implementation: string[]; snapshots: string[] };
  overview?: string;
  dos: string[];
  donts: string[];
  removeTokens: string[];
  removeComponents: string[];
  removeComponentTokens: string[];
  removeImplementations: string[];
  removeSnapshots: string[];
  removeDos: string[];
  removeDonts: string[];
  delete: boolean;
};

export type DesignSystemAuthorResult = YamlMutationResult & {
  artifactPath: string;
  operation: "create" | "update" | "delete";
  generatedDocument: { path: "DESIGN.md"; command: "strict-spec-cli design-generate"; required: boolean };
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

function splitPair(value: string, label: string): [string, string] {
  const delimiter = value.indexOf(":");
  if (delimiter <= 0 || delimiter === value.length - 1) throw new Error(`${label} requires owner:value, received '${value}'`);
  return [value.slice(0, delimiter), value.slice(delimiter + 1)];
}

function splitProperty(value: string): [string, string] {
  const delimiter = value.indexOf("=");
  if (delimiter <= 0 || delimiter === value.length - 1) throw new Error(`token and component token properties require name=value, received '${value}'`);
  return [value.slice(0, delimiter), value.slice(delimiter + 1)];
}

function hasEditIntent(input: DesignSystemAuthorInput): boolean {
  return input.id !== undefined || input.title !== undefined || input.token !== undefined || input.component !== undefined
    || input.overview !== undefined || input.dos.length > 0 || input.donts.length > 0 || input.removeTokens.length > 0
    || input.removeComponents.length > 0 || input.removeComponentTokens.length > 0 || input.removeImplementations.length > 0
    || input.removeSnapshots.length > 0 || input.removeDos.length > 0 || input.removeDonts.length > 0;
}

function validateCandidate(value: unknown, artifactPath: string) {
  return validateArtifact(loadBundledSchemaByArtifactType("design_system"), value, artifactPath).diagnostics.map((entry) => ({
    code: entry.source,
    fieldPath: entry.fieldPath,
    message: entry.message,
    expected: entry.expected,
    actual: entry.actual,
  }));
}

export function commitDesignSystemCandidate(
  rootDir: string,
  candidate: RawRecord,
  operation: "create" | "update",
): YamlMutationResult {
  const absolutePath = path.join(rootDir, DESIGN_ARTIFACT_PATH);
  return commitYamlMutation({
    rootDir,
    mutations: [{
      artifactFamily: "design-system-state",
      artifactId: "design-system",
      schemaId: DESIGN_SCHEMA_ID,
      familyRoot: path.join(rootDir, ".strict-spec-driven"),
      absolutePath,
      operation,
      candidate,
      validateCandidate: (value, context) => validateCandidate(value, context.artifactPath),
    }],
  });
}

export function initializeDesignSystemThroughMutation(rootDir: string): YamlMutationResult {
  const candidate = parseYamlDocument<RawRecord>(readBundledScaffoldTemplate("design-system.yaml"), { source: DESIGN_ARTIFACT_PATH });
  return commitDesignSystemCandidate(rootDir, candidate, "create");
}

function baseArtifact(input: DesignSystemAuthorInput): RawRecord {
  if (input.id === undefined || input.title === undefined || input.overview === undefined) {
    throw new Error("new design-system artifacts require --id, --title, and --overview");
  }
  return {
    schema: DESIGN_SCHEMA_ID,
    schema_version: 1,
    artifact_type: "design_system",
    schema_file: "templates/strict-spec-driven/schemas/design-system.yaml",
    design_system: { id: input.id, title: input.title },
    tokens: {},
    components: {},
    guidance: { overview: input.overview },
  };
}

export function authorDesignSystem(rootDir: string, input: DesignSystemAuthorInput): DesignSystemAuthorResult {
  const absolutePath = path.join(rootDir, DESIGN_ARTIFACT_PATH);
  const exists = existsSync(absolutePath);
  const operation = input.delete ? "delete" : exists ? "update" : "create";
  if (input.delete && hasEditIntent(input)) throw new Error("--delete cannot be combined with design-system editing flags");
  if (!input.delete && !hasEditIntent(input)) throw new Error("design-edit requires semantic fields, named removals, or --delete");

  let candidate: RawRecord | undefined;
  if (!input.delete) {
    candidate = exists ? parseYamlFile<RawRecord>(absolutePath) : baseArtifact(input);
    const header = asRecord(candidate.design_system);
    if (input.id !== undefined) header.id = input.id;
    if (input.title !== undefined) header.title = input.title;
    candidate.design_system = header;
    const tokens = asRecord(candidate.tokens);
    if (input.token !== undefined) {
      if (!TOKEN_GROUPS.has(input.token.group)) throw new Error(`unknown token group '${input.token.group}'`);
      const group = asRecord(tokens[input.token.group]);
      if (input.token.group === "typography") {
        if (input.token.properties.length === 0) throw new Error("typography tokens require at least one --token-property name=value");
        const entry = asRecord(group[input.token.name]);
        for (const property of input.token.properties) {
          const [name, value] = splitProperty(property);
          if (!["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"].includes(name)) {
            throw new Error(`unsupported typography property '${name}'`);
          }
          entry[name] = value;
        }
        group[input.token.name] = entry;
      } else {
        if (input.token.value === undefined) throw new Error("scalar token groups require --token-value");
        group[input.token.name] = input.token.value;
      }
      tokens[input.token.group] = group;
    }
    for (const encoded of input.removeTokens) {
      const [groupName, tokenName] = splitPair(encoded, "--remove-token");
      const group = asRecord(tokens[groupName]);
      delete group[tokenName];
      if (Object.keys(group).length === 0) delete tokens[groupName];
      else tokens[groupName] = group;
    }
    candidate.tokens = tokens;

    const components = asRecord(candidate.components);
    if (input.component !== undefined) {
      const current = asRecord(components[input.component.id]);
      if (Object.keys(current).length === 0 && input.component.title === undefined) throw new Error("a new design component requires --component-title");
      const component = { ...current };
      if (input.component.title !== undefined) component.title = input.component.title;
      if (input.component.description !== undefined) component.description = input.component.description;
      const tokenMappings = asRecord(component.tokens);
      for (const encoded of input.component.tokens) {
        const [name, value] = splitProperty(encoded);
        tokenMappings[name] = value;
      }
      component.tokens = tokenMappings;
      const mapping = asRecord(component.mapping);
      mapping.implementation = appendUnique(strings(mapping.implementation), input.component.implementation);
      mapping.snapshots = appendUnique(strings(mapping.snapshots), input.component.snapshots);
      component.mapping = mapping;
      components[input.component.id] = component;
    }
    for (const id of input.removeComponents) delete components[id];
    for (const encoded of input.removeComponentTokens) {
      const [componentId, tokenName] = splitPair(encoded, "--remove-component-token");
      const component = asRecord(components[componentId]);
      const tokenMappings = asRecord(component.tokens);
      delete tokenMappings[tokenName];
      component.tokens = tokenMappings;
      components[componentId] = component;
    }
    for (const [values, field, label] of [
      [input.removeImplementations, "implementation", "--remove-implementation"],
      [input.removeSnapshots, "snapshots", "--remove-snapshot"],
    ] as const) {
      for (const encoded of values) {
        const [componentId, value] = splitPair(encoded, label);
        const component = asRecord(components[componentId]);
        const mapping = asRecord(component.mapping);
        mapping[field] = strings(mapping[field]).filter((entry) => entry !== value);
        component.mapping = mapping;
        components[componentId] = component;
      }
    }
    candidate.components = components;
    const guidance = asRecord(candidate.guidance);
    if (input.overview !== undefined) guidance.overview = input.overview;
    guidance.do = input.removeDos.reduce((values, value) => values.filter((entry) => entry !== value), appendUnique(strings(guidance.do), input.dos));
    guidance.dont = input.removeDonts.reduce((values, value) => values.filter((entry) => entry !== value), appendUnique(strings(guidance.dont), input.donts));
    candidate.guidance = guidance;
  }

  const mutation = candidate === undefined
    ? commitYamlMutation({
      rootDir,
      mutations: [{ artifactFamily: "design-system-state", artifactId: "design-system", schemaId: DESIGN_SCHEMA_ID, familyRoot: path.join(rootDir, ".strict-spec-driven"), absolutePath, operation }],
    })
    : commitDesignSystemCandidate(rootDir, candidate, operation as "create" | "update");
  const changed = mutation.changes.some((entry) => entry.changed);
  return {
    ...mutation,
    artifactPath: DESIGN_ARTIFACT_PATH,
    operation,
    generatedDocument: { path: "DESIGN.md", command: "strict-spec-cli design-generate", required: changed },
  };
}
