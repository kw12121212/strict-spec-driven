import AjvModule, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormatsModule from "ajv-formats";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readEmbeddedTemplate } from "./embedded-templates.js";
import { parseYamlDocument } from "./yaml.js";

export type ValidatorLike = {
  compile(schema: object): ValidateFunction;
};

type SchemaRegistryEntry = {
  schema_id: string;
  artifact_type: string;
  schema_file: string;
};

type SchemaRegistry = {
  entries: SchemaRegistryEntry[];
};

export type ValidationDiagnosticSource = "schema" | "duplicate_id" | "reference";

export type ValidationDiagnostic = {
  source: ValidationDiagnosticSource;
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
};

export type ValidationResult = {
  valid: boolean;
  diagnostics: ValidationDiagnostic[];
};

export type DuplicateIdRule = {
  collectionPath: string;
  idField: string;
  description?: string;
};

export type ReferenceCheckRule = {
  sourceCollectionPath: string;
  sourceField: string;
  targetCollectionPath: string;
  targetField: string;
  description?: string;
};

function getBundledDir(...segments: string[]): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(thisDir, "templates", ...segments);
  if (existsSync(distPath)) return distPath;
  return path.join(thisDir, "..", "templates", ...segments);
}

const BUNDLED_SCHEMA_DIR = getBundledDir("strict-spec-driven", "schemas");

function schemaTemplateKey(schemaFile: string): string {
  return `strict-spec-driven/schemas/${schemaFile}`;
}

function readBundledSchemaContent(schemaFile: string): string {
  const embedded = readEmbeddedTemplate(schemaTemplateKey(schemaFile));
  if (embedded !== undefined) return embedded;
  return readFileSync(getBundledSchemaPath(schemaFile), "utf8");
}

function resolveAjvConstructor(): new (options: Record<string, unknown>) => ValidatorLike {
  const value = AjvModule as unknown as {
    default?: new (options: Record<string, unknown>) => ValidatorLike;
  };
  return value.default ?? (AjvModule as unknown as new (options: Record<string, unknown>) => ValidatorLike);
}

function resolveFormatsPlugin(): (validator: ValidatorLike) => void {
  const value = addFormatsModule as unknown as {
    default?: (validator: ValidatorLike) => void;
  };
  return value.default ?? (addFormatsModule as unknown as (validator: ValidatorLike) => void);
}

function asObject(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} must be a YAML mapping`);
  }
  return value as Record<string, unknown>;
}

function asSequence(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringifyValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function escapeJsonPointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function decodeJsonPointerSegment(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function jsonPointerToFieldPath(pointer: string): string {
  if (!pointer || pointer === "/") {
    return "$";
  }

  const segments = pointer
    .split("/")
    .slice(1)
    .map(decodeJsonPointerSegment)
    .map((segment) => (/^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`));
  return `$${segments.join("")}`;
}

function dotPathToFieldRoot(pathValue: string): string {
  if (!pathValue.trim()) {
    return "$";
  }
  return `$${pathValue
    .split(".")
    .map((segment) => `.${segment}`)
    .join("")}`;
}

function getValueByDotPath(root: unknown, dotPath: string): unknown {
  if (!dotPath.trim()) {
    return root;
  }

  let current: unknown = root;
  for (const segment of dotPath.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function getObjectCollection(root: unknown, dotPath: string): Array<Record<string, unknown>> {
  const value = getValueByDotPath(root, dotPath);
  return asSequence(value).filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function normalizeDiagnostics(diagnostics: ValidationDiagnostic[]): ValidationDiagnostic[] {
  return diagnostics.sort((left, right) => {
    const leftKey = [
      left.source,
      left.artifactPath,
      left.fieldPath,
      left.message,
      left.expected ?? "",
      left.actual ?? "",
    ].join("|");
    const rightKey = [
      right.source,
      right.artifactPath,
      right.fieldPath,
      right.message,
      right.expected ?? "",
      right.actual ?? "",
    ].join("|");
    return leftKey.localeCompare(rightKey);
  });
}

function fieldPathForCollectionItem(collectionPath: string, index: number, fieldName: string): string {
  return `${dotPathToFieldRoot(collectionPath)}[${index}].${fieldName}`;
}

function schemaExpectedValue(error: ErrorObject): string | undefined {
  const params = error.params as Record<string, unknown>;
  if (error.keyword === "required") {
    return "required property";
  }
  if (error.keyword === "additionalProperties") {
    return "no additional properties";
  }
  if (error.keyword === "type" && typeof params.type !== "undefined") {
    return stringifyValue(params.type);
  }
  if (error.keyword === "enum" && Array.isArray(params.allowedValues)) {
    return stringifyValue(params.allowedValues);
  }
  if (error.keyword === "const" && typeof params.allowedValue !== "undefined") {
    return stringifyValue(params.allowedValue);
  }
  return undefined;
}

function schemaActualValue(error: ErrorObject): string | undefined {
  const params = error.params as Record<string, unknown>;
  if (error.keyword === "required") {
    return "missing";
  }
  if (error.keyword === "additionalProperties" && typeof params.additionalProperty !== "undefined") {
    return stringifyValue(params.additionalProperty);
  }
  if ("data" in error) {
    return stringifyValue((error as ErrorObject & { data?: unknown }).data);
  }
  return undefined;
}

function schemaFieldPath(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  if (error.keyword === "required" && typeof params.missingProperty === "string") {
    const pointer = `${error.instancePath}/${escapeJsonPointerSegment(params.missingProperty)}`;
    return jsonPointerToFieldPath(pointer);
  }
  if (error.keyword === "additionalProperties" && typeof params.additionalProperty === "string") {
    const pointer = `${error.instancePath}/${escapeJsonPointerSegment(params.additionalProperty)}`;
    return jsonPointerToFieldPath(pointer);
  }
  return jsonPointerToFieldPath(error.instancePath);
}

function schemaErrorToDiagnostic(error: ErrorObject, artifactPath: string): ValidationDiagnostic {
  return {
    source: "schema",
    artifactPath,
    fieldPath: schemaFieldPath(error),
    message: error.message ?? "schema validation failure",
    expected: schemaExpectedValue(error),
    actual: schemaActualValue(error),
  };
}

export function createSchemaValidator(): ValidatorLike {
  const AjvCtor = resolveAjvConstructor();
  const validator = new AjvCtor({ allErrors: true, strict: false, verbose: true });
  resolveFormatsPlugin()(validator);
  return validator;
}

export function compileSchema(schema: object): ValidateFunction {
  return createSchemaValidator().compile(schema);
}

export function getBundledSchemaPath(schemaFile: string): string {
  return path.join(BUNDLED_SCHEMA_DIR, schemaFile);
}

export function loadBundledSchema<T extends object = Record<string, unknown>>(schemaFile: string): T {
  const raw = parseYamlDocument<Record<string, unknown>>(readBundledSchemaContent(schemaFile));
  if ("json_schema" in raw && raw.json_schema && typeof raw.json_schema === "object") {
    return raw.json_schema as T;
  }
  return asObject(raw, `Schema file ${schemaFile}`) as T;
}

export function loadBundledSchemaRegistry(): SchemaRegistry {
  const registry = loadBundledSchema<Record<string, unknown>>("registry.yaml");
  const objectRegistry = asObject(registry, "Bundled schema registry");
  const entries = objectRegistry.entries;
  if (!Array.isArray(entries)) {
    throw new Error("Bundled schema registry is missing an entries sequence");
  }
  return objectRegistry as unknown as SchemaRegistry;
}

export function loadBundledSchemaByArtifactType(artifactType: string): Record<string, unknown> {
  const registry = loadBundledSchemaRegistry();
  const entry = registry.entries.find((candidate) => candidate.artifact_type === artifactType);
  if (!entry) {
    throw new Error(`No bundled schema found for artifact type '${artifactType}'`);
  }
  return loadBundledSchema<Record<string, unknown>>(entry.schema_file);
}

export function loadBundledSchemaBySchemaId(schemaId: string): Record<string, unknown> {
  const registry = loadBundledSchemaRegistry();
  const entry = registry.entries.find((candidate) => candidate.schema_id === schemaId);
  if (!entry) {
    throw new Error(`No bundled schema found for schema id '${schemaId}'`);
  }
  return loadBundledSchema<Record<string, unknown>>(entry.schema_file);
}

export function validateWithSchema(
  schema: object,
  artifact: unknown,
  artifactPath: string,
): ValidationResult {
  const validator = compileSchema(schema);
  const valid = validator(artifact) === true;
  const diagnostics = normalizeDiagnostics((validator.errors ?? []).map((error) => schemaErrorToDiagnostic(error, artifactPath)));
  return { valid: valid && diagnostics.length === 0, diagnostics };
}

export function runDuplicateIdChecks(
  artifact: unknown,
  artifactPath: string,
  rules: DuplicateIdRule[],
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  for (const rule of rules) {
    const seen = new Set<string>();
    const collection = getObjectCollection(artifact, rule.collectionPath);
    for (const [index, item] of collection.entries()) {
      const idValue = item[rule.idField];
      if (typeof idValue !== "string" || idValue.length === 0) {
        continue;
      }
      if (seen.has(idValue)) {
        diagnostics.push({
          source: "duplicate_id",
          artifactPath,
          fieldPath: fieldPathForCollectionItem(rule.collectionPath, index, rule.idField),
          message: rule.description ?? `duplicate identifier '${idValue}'`,
          expected: "unique identifier",
          actual: idValue,
        });
        continue;
      }
      seen.add(idValue);
    }
  }

  return normalizeDiagnostics(diagnostics);
}

export function runReferenceChecks(
  artifact: unknown,
  artifactPath: string,
  rules: ReferenceCheckRule[],
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  for (const rule of rules) {
    const targetCollection = getObjectCollection(artifact, rule.targetCollectionPath);
    const targetValues = new Set(
      targetCollection
        .map((item) => item[rule.targetField])
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    );

    const sourceCollection = getObjectCollection(artifact, rule.sourceCollectionPath);
    for (const [index, item] of sourceCollection.entries()) {
      const sourceValue = item[rule.sourceField];
      if (typeof sourceValue !== "string" || sourceValue.length === 0) {
        continue;
      }
      if (targetValues.has(sourceValue)) {
        continue;
      }

      diagnostics.push({
        source: "reference",
        artifactPath,
        fieldPath: fieldPathForCollectionItem(rule.sourceCollectionPath, index, rule.sourceField),
        message: rule.description ?? `missing reference '${sourceValue}'`,
        expected: `${rule.targetCollectionPath}.${rule.targetField}`,
        actual: sourceValue,
      });
    }
  }

  return normalizeDiagnostics(diagnostics);
}

export function validateArtifact(
  schema: object,
  artifact: unknown,
  artifactPath: string,
  options: {
    duplicateIdRules?: DuplicateIdRule[];
    referenceRules?: ReferenceCheckRule[];
  } = {},
): ValidationResult {
  const schemaResult = validateWithSchema(schema, artifact, artifactPath);
  const duplicateDiagnostics = runDuplicateIdChecks(artifact, artifactPath, options.duplicateIdRules ?? []);
  const referenceDiagnostics = runReferenceChecks(artifact, artifactPath, options.referenceRules ?? []);
  const diagnostics = normalizeDiagnostics([
    ...schemaResult.diagnostics,
    ...duplicateDiagnostics,
    ...referenceDiagnostics,
  ]);
  return { valid: diagnostics.length === 0, diagnostics };
}
