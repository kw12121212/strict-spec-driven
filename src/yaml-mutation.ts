import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";
import { resolveYamlArtifactIdentifiers, type YamlArtifactIdentifiers } from "./yaml-mutation-surface.js";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";

export type YamlMutationOperation = "create" | "update" | "delete";
export type YamlMutationRole = "artifact" | "reference" | "generated";
export type YamlMutationPhase = "planning" | "validation" | "staging" | "commit" | "rollback";

export type YamlMutationValidationIssue = {
  code?: string;
  artifactPath?: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
};

export type YamlMutationDiagnostic = Required<Pick<YamlMutationValidationIssue, "fieldPath" | "message">>
  & Omit<YamlMutationValidationIssue, "fieldPath" | "message">
  & YamlArtifactIdentifiers
  & {
    code: string;
    artifactPath: string;
    phase: YamlMutationPhase;
  };

export type YamlMutationRequest = {
  artifactFamily: string;
  artifactId: string;
  schemaId: string;
  familyRoot: string;
  absolutePath: string;
  operation: YamlMutationOperation;
  role?: YamlMutationRole;
  candidate?: unknown;
  validateCandidate?: (
    candidate: unknown,
    context: { artifactPath: string; schemaId: string },
  ) => readonly YamlMutationValidationIssue[];
};

export type PlannedYamlMutation = {
  artifactFamily: string;
  artifactId: string;
  schemaId: string;
  artifactPath: string;
  absolutePath: string;
  operation: YamlMutationOperation;
  role: YamlMutationRole;
  candidate?: unknown;
  serializedCandidate?: string;
  previousContent: string | null;
  changed: boolean;
};

export type YamlMutationChange = Pick<
  PlannedYamlMutation,
  "artifactFamily" | "artifactId" | "schemaId" | "artifactPath" | "operation" | "role" | "changed"
> & YamlArtifactIdentifiers;

export type YamlMutationRelationshipContext = {
  mutations: readonly PlannedYamlMutation[];
  getCandidate(artifactFamily: string, artifactId: string): unknown | undefined;
};

export type YamlMutationFileSystem = {
  exists(filePath: string): boolean;
  read(filePath: string): string;
  mkdir(directoryPath: string): void;
  writeExclusive(filePath: string, content: string): void;
  rename(sourcePath: string, destinationPath: string): void;
  remove(filePath: string): void;
  removeEmptyDirectory(directoryPath: string): void;
};

export type CommitYamlMutationOptions = {
  rootDir: string;
  mutations: readonly YamlMutationRequest[];
  validateRelationships?: (
    context: YamlMutationRelationshipContext,
  ) => readonly YamlMutationValidationIssue[];
  fileSystem?: YamlMutationFileSystem;
};

export type YamlMutationResult = {
  valid: boolean;
  committed: boolean;
  exitStatus: 0 | 1;
  changes: YamlMutationChange[];
  diagnostics: YamlMutationDiagnostic[];
};

const nodeFileSystem: YamlMutationFileSystem = {
  exists: existsSync,
  read: (filePath) => readFileSync(filePath, "utf8"),
  mkdir: (directoryPath) => mkdirSync(directoryPath),
  writeExclusive: (filePath, content) => writeFileSync(filePath, content, { encoding: "utf8", flag: "wx" }),
  rename: renameSync,
  remove: (filePath) => rmSync(filePath, { force: true }),
  removeEmptyDirectory: rmdirSync,
};

let transactionSequence = 0;

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function isWithin(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function nearestExistingPath(candidatePath: string): string {
  let cursor = candidatePath;
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return cursor;
    cursor = parent;
  }
  return cursor;
}

function physicalConfinementDiagnostic(
  rootDir: string,
  familyRoot: string,
  absolutePath: string,
  artifactPath: string,
): YamlMutationDiagnostic | null {
  try {
    const realRoot = realpathSync(rootDir);
    const familyAnchor = nearestExistingPath(familyRoot);
    const realFamilyAnchor = realpathSync(familyAnchor);
    if (!isWithin(realRoot, realFamilyAnchor)) {
      return diagnostic(
        artifactPath,
        "planning",
        "family-root-symlink-escape",
        "$.familyRoot",
        "declared artifact-family location resolves outside the repository root",
      );
    }
    if (existsSync(familyRoot) && !statSync(familyRoot).isDirectory()) {
      return diagnostic(
        artifactPath,
        "planning",
        "family-root-not-directory",
        "$.familyRoot",
        "declared artifact-family location must be a directory",
      );
    }

    const realFamilyBoundary = existsSync(familyRoot) ? realpathSync(familyRoot) : realFamilyAnchor;
    const targetAnchor = nearestExistingPath(existsSync(absolutePath) ? absolutePath : path.dirname(absolutePath));
    const realTargetAnchor = realpathSync(targetAnchor);
    if (!isWithin(realFamilyBoundary, realTargetAnchor)) {
      return diagnostic(
        artifactPath,
        "planning",
        "target-symlink-escape",
        "$.absolutePath",
        "mutation target resolves outside its declared repository-owned artifact family",
      );
    }
    return null;
  } catch (error) {
    return diagnostic(
      artifactPath,
      "planning",
      "path-resolution-failed",
      "$.absolutePath",
      "failed to resolve the physical mutation target path",
      { actual: errorCode(error) },
    );
  }
}

function compareMutations(left: PlannedYamlMutation, right: PlannedYamlMutation): number {
  return [left.artifactFamily, left.artifactId, left.artifactPath, left.operation]
    .join("\u0000")
    .localeCompare([right.artifactFamily, right.artifactId, right.artifactPath, right.operation].join("\u0000"));
}

function compareDiagnostics(left: YamlMutationDiagnostic, right: YamlMutationDiagnostic): number {
  return [left.artifactPath, left.phase, left.code, left.fieldPath, left.message]
    .join("\u0000")
    .localeCompare([right.artifactPath, right.phase, right.code, right.fieldPath, right.message].join("\u0000"));
}

function diagnostic(
  artifactPath: string,
  phase: YamlMutationPhase,
  code: string,
  fieldPath: string,
  message: string,
  details: Pick<YamlMutationDiagnostic, "expected" | "actual"> = {},
): YamlMutationDiagnostic {
  return { artifactPath, phase, code, fieldPath, message, ...details };
}

function validationDiagnostic(
  issue: YamlMutationValidationIssue,
  defaultArtifactPath: string,
  phase: YamlMutationPhase,
  defaultCode: string,
): YamlMutationDiagnostic {
  return {
    artifactPath: issue.artifactPath ?? defaultArtifactPath,
    phase,
    code: issue.code ?? defaultCode,
    fieldPath: issue.fieldPath,
    message: issue.message,
    ...(issue.expected !== undefined ? { expected: issue.expected } : {}),
    ...(issue.actual !== undefined ? { actual: issue.actual } : {}),
  };
}

function isMeaningfulArtifact(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).length > 0;
}

/**
 * Identifiers are attached at result time rather than at each diagnostic site, so a planning
 * failure that never produced a planned mutation still reports the schema and example a caller
 * needs to correct the request.
 */
function result(
  planned: readonly PlannedYamlMutation[],
  diagnostics: readonly YamlMutationDiagnostic[],
  committed: boolean,
  identifiersByArtifactPath: ReadonlyMap<string, YamlArtifactIdentifiers> = new Map(),
): YamlMutationResult {
  return {
    valid: committed && diagnostics.length === 0,
    committed,
    exitStatus: committed && diagnostics.length === 0 ? 0 : 1,
    changes: [...planned].sort(compareMutations).map((mutation) => ({
      artifactFamily: mutation.artifactFamily,
      artifactId: mutation.artifactId,
      schemaId: mutation.schemaId,
      artifactPath: mutation.artifactPath,
      operation: mutation.operation,
      role: mutation.role,
      changed: mutation.changed,
      ...resolveYamlArtifactIdentifiers(mutation.schemaId),
    })),
    diagnostics: [...diagnostics].sort(compareDiagnostics).map((entry) => ({
      ...identifiersByArtifactPath.get(entry.artifactPath),
      ...entry,
    })),
  };
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return error instanceof Error ? error.name : "unknown-error";
}

function createOwnedDirectories(
  rootDir: string,
  directoryPath: string,
  fileSystem: YamlMutationFileSystem,
  createdDirectories: string[],
): void {
  const missing: string[] = [];
  let cursor = directoryPath;
  while (cursor !== rootDir && !fileSystem.exists(cursor)) {
    if (!isWithin(rootDir, cursor)) {
      throw new Error("directory escaped the repository root");
    }
    missing.push(cursor);
    cursor = path.dirname(cursor);
  }
  for (const missingDirectory of missing.reverse()) {
    fileSystem.mkdir(missingDirectory);
    createdDirectories.push(missingDirectory);
  }
}

function removeCreatedDirectories(createdDirectories: readonly string[], fileSystem: YamlMutationFileSystem): void {
  for (const directoryPath of [...createdDirectories].reverse()) {
    try {
      fileSystem.removeEmptyDirectory(directoryPath);
    } catch {
      // A directory that is no longer empty or was already removed is not owned cleanup work.
    }
  }
}

type CommitEntry = {
  mutation: PlannedYamlMutation;
  temporaryPath?: string;
  backupPath?: string;
  targetInstalled: boolean;
  backupCreated: boolean;
};

function siblingWorkPath(
  targetPath: string,
  transactionId: string,
  index: number,
  suffix: "stage" | "backup" | "restore",
): string {
  return path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.strict-spec-${transactionId}-${index}.${suffix}`);
}

function rollbackEntries(
  entries: readonly CommitEntry[],
  fileSystem: YamlMutationFileSystem,
  transactionId: string,
): YamlMutationDiagnostic[] {
  const diagnostics: YamlMutationDiagnostic[] = [];
  for (const entry of [...entries].reverse()) {
    const { mutation } = entry;
    try {
      if (entry.targetInstalled && fileSystem.exists(mutation.absolutePath)) {
        fileSystem.remove(mutation.absolutePath);
      }
      if (entry.backupCreated && entry.backupPath && fileSystem.exists(entry.backupPath)) {
        fileSystem.rename(entry.backupPath, mutation.absolutePath);
      } else if (entry.backupCreated && mutation.previousContent !== null) {
        const restorePath = siblingWorkPath(mutation.absolutePath, transactionId, 0, "restore");
        if (fileSystem.exists(restorePath)) fileSystem.remove(restorePath);
        fileSystem.writeExclusive(restorePath, mutation.previousContent);
        fileSystem.rename(restorePath, mutation.absolutePath);
      }
      if (entry.temporaryPath && fileSystem.exists(entry.temporaryPath)) {
        fileSystem.remove(entry.temporaryPath);
      }
    } catch (error) {
      diagnostics.push(diagnostic(
        mutation.artifactPath,
        "rollback",
        "rollback-failed",
        "$",
        "failed to restore the pre-mutation filesystem state",
        { actual: errorCode(error) },
      ));
    }
  }
  return diagnostics;
}

/**
 * Validate and commit one artifact-aware YAML mutation transaction.
 *
 * Callers retain ownership of domain-specific merge semantics and supply complete candidate
 * artifacts. This boundary owns confined-path checks, candidate and relationship validation,
 * deterministic reporting, same-directory staging, commit, and best-effort rollback.
 */
export function commitYamlMutation(options: CommitYamlMutationOptions): YamlMutationResult {
  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const rootDir = path.resolve(options.rootDir);
  const diagnostics: YamlMutationDiagnostic[] = [];
  const seenPaths = new Set<string>();
  const planned: PlannedYamlMutation[] = [];
  const transactionId = `${process.pid}-${++transactionSequence}`;
  const identifiersByArtifactPath = new Map<string, YamlArtifactIdentifiers>();

  // Built from every request, not only the ones that survive planning, and keyed by both labels a
  // diagnostic can carry so a rejected target still resolves to its schema and example.
  for (const request of options.mutations) {
    const identifiers = resolveYamlArtifactIdentifiers(request.schemaId);
    if (Object.keys(identifiers).length === 0) continue;
    const artifactPath = toPosix(path.relative(rootDir, path.resolve(request.absolutePath)));
    identifiersByArtifactPath.set(request.artifactId, identifiers);
    if (artifactPath) identifiersByArtifactPath.set(artifactPath, identifiers);
  }

  if (options.mutations.length === 0) {
    diagnostics.push(diagnostic(
      "<transaction>",
      "planning",
      "empty-transaction",
      "$.mutations",
      "a YAML mutation transaction must contain at least one artifact operation",
    ));
    return result(planned, diagnostics, false, identifiersByArtifactPath);
  }

  for (const request of options.mutations) {
    const familyRoot = path.resolve(rootDir, request.familyRoot);
    const absolutePath = path.resolve(request.absolutePath);
    const artifactPath = toPosix(path.relative(rootDir, absolutePath));
    const artifactLabel = artifactPath && !artifactPath.startsWith("../") ? artifactPath : request.artifactId;

    if (!isWithin(rootDir, familyRoot) || !isWithin(familyRoot, absolutePath) || absolutePath === familyRoot) {
      diagnostics.push(diagnostic(
        artifactLabel,
        "planning",
        "path-outside-family",
        "$.absolutePath",
        "mutation target must be a file inside its declared repository-owned artifact family",
        { expected: toPosix(path.relative(rootDir, familyRoot)), actual: artifactPath },
      ));
      continue;
    }
    const confinementDiagnostic = physicalConfinementDiagnostic(rootDir, familyRoot, absolutePath, artifactPath);
    if (confinementDiagnostic) {
      diagnostics.push(confinementDiagnostic);
      continue;
    }
    if (seenPaths.has(absolutePath)) {
      diagnostics.push(diagnostic(
        artifactPath,
        "planning",
        "duplicate-target",
        "$.absolutePath",
        "a mutation transaction may name each target path only once",
      ));
      continue;
    }
    seenPaths.add(absolutePath);

    let exists = false;
    let previousContent: string | null = null;
    try {
      exists = fileSystem.exists(absolutePath);
      previousContent = exists ? fileSystem.read(absolutePath) : null;
    } catch (error) {
      diagnostics.push(diagnostic(
        artifactPath,
        "planning",
        "target-read-failed",
        "$",
        "failed to read the current YAML artifact before planning its mutation",
        { actual: errorCode(error) },
      ));
      continue;
    }
    let serializedCandidate: string | undefined;
    let validatedCandidate = request.candidate;

    if (request.operation === "create" && exists) {
      diagnostics.push(diagnostic(artifactPath, "planning", "target-exists", "$", "create requires an absent target"));
    } else if ((request.operation === "update" || request.operation === "delete") && !exists) {
      diagnostics.push(diagnostic(artifactPath, "planning", "target-missing", "$", `${request.operation} requires an existing target`));
    }

    if (request.operation !== "delete") {
      if (!isMeaningfulArtifact(request.candidate)) {
        diagnostics.push(diagnostic(
          artifactPath,
          "validation",
          "empty-candidate",
          "$",
          "create and update require a non-empty YAML mapping candidate",
        ));
      } else if (!request.validateCandidate) {
        diagnostics.push(diagnostic(
          artifactPath,
          "validation",
          "missing-candidate-validator",
          "$",
          "create and update require complete-candidate schema validation",
        ));
      } else {
        try {
          serializedCandidate = stringifyYamlDocument(request.candidate);
          const serializedArtifact = parseYamlDocument<unknown>(serializedCandidate, { source: artifactPath });
          validatedCandidate = serializedArtifact;
          for (const issue of request.validateCandidate(serializedArtifact, { artifactPath, schemaId: request.schemaId })) {
            diagnostics.push(validationDiagnostic(issue, artifactPath, "validation", "candidate-invalid"));
          }
        } catch (error) {
          diagnostics.push(diagnostic(
            artifactPath,
            "validation",
            "candidate-validation-failed",
            "$",
            "failed to serialize or validate the complete YAML candidate",
            { actual: errorCode(error) },
          ));
        }
      }
    } else if (request.candidate !== undefined || request.validateCandidate !== undefined) {
      diagnostics.push(diagnostic(
        artifactPath,
        "planning",
        "delete-with-edit",
        "$",
        "whole-artifact deletion cannot be combined with candidate edits or validation",
      ));
    }

    planned.push({
      artifactFamily: request.artifactFamily,
      artifactId: request.artifactId,
      schemaId: request.schemaId,
      artifactPath,
      absolutePath,
      operation: request.operation,
      role: request.role ?? "artifact",
      candidate: validatedCandidate,
      serializedCandidate,
      previousContent,
      changed: request.operation === "delete" ? exists : previousContent !== serializedCandidate,
    });
  }

  planned.sort(compareMutations);
  if (diagnostics.length === 0 && options.validateRelationships) {
    const candidateByIdentity = new Map(
      planned.map((mutation) => [`${mutation.artifactFamily}\u0000${mutation.artifactId}`, mutation.candidate] as const),
    );
    try {
      const relationshipIssues = options.validateRelationships({
        mutations: planned,
        getCandidate: (artifactFamily, artifactId) => candidateByIdentity.get(`${artifactFamily}\u0000${artifactId}`),
      });
      for (const issue of relationshipIssues) {
        diagnostics.push(validationDiagnostic(issue, "<transaction>", "validation", "relationship-invalid"));
      }
    } catch (error) {
      diagnostics.push(diagnostic(
        "<transaction>",
        "validation",
        "relationship-validation-failed",
        "$.relationships",
        "failed to validate YAML mutation relationships and side effects",
        { actual: errorCode(error) },
      ));
    }
  }
  if (diagnostics.length > 0) {
    return result(planned, diagnostics, false, identifiersByArtifactPath);
  }

  const activeMutations = planned.filter((mutation) => mutation.changed);
  if (activeMutations.length === 0) {
    return result(planned, [], true, identifiersByArtifactPath);
  }

  const createdDirectories: string[] = [];
  const entries: CommitEntry[] = activeMutations.map((mutation) => ({
    mutation,
    targetInstalled: false,
    backupCreated: false,
  }));

  try {
    for (const [index, entry] of entries.entries()) {
      if (entry.mutation.operation === "delete") continue;
      createOwnedDirectories(rootDir, path.dirname(entry.mutation.absolutePath), fileSystem, createdDirectories);
      const temporaryPath = siblingWorkPath(entry.mutation.absolutePath, transactionId, index, "stage");
      if (fileSystem.exists(temporaryPath)) fileSystem.remove(temporaryPath);
      entry.temporaryPath = temporaryPath;
      fileSystem.writeExclusive(temporaryPath, entry.mutation.serializedCandidate ?? "");
    }
  } catch (error) {
    diagnostics.push(diagnostic(
      "<transaction>",
      "staging",
      "stage-failed",
      "$",
      "failed to stage the complete YAML mutation transaction",
      { actual: errorCode(error) },
    ));
    diagnostics.push(...rollbackEntries(entries, fileSystem, transactionId));
    removeCreatedDirectories(createdDirectories, fileSystem);
    return result(planned, diagnostics, false, identifiersByArtifactPath);
  }

  try {
    for (const [index, entry] of entries.entries()) {
      const { mutation } = entry;
      if (mutation.operation === "update" || mutation.operation === "delete") {
        const backupPath = siblingWorkPath(mutation.absolutePath, transactionId, index, "backup");
        if (fileSystem.exists(backupPath)) fileSystem.remove(backupPath);
        fileSystem.rename(mutation.absolutePath, backupPath);
        entry.backupPath = backupPath;
        entry.backupCreated = true;
      }
      if (mutation.operation === "create" || mutation.operation === "update") {
        fileSystem.rename(entry.temporaryPath ?? "", mutation.absolutePath);
        entry.targetInstalled = true;
        entry.temporaryPath = undefined;
      }
    }
  } catch (error) {
    diagnostics.push(diagnostic(
      "<transaction>",
      "commit",
      "commit-failed",
      "$",
      "failed to commit the complete YAML mutation transaction",
      { actual: errorCode(error) },
    ));
    diagnostics.push(...rollbackEntries(entries, fileSystem, transactionId));
    removeCreatedDirectories(createdDirectories, fileSystem);
    return result(planned, diagnostics, false, identifiersByArtifactPath);
  }

  try {
    for (const entry of entries) {
      if (entry.backupPath && fileSystem.exists(entry.backupPath)) {
        fileSystem.remove(entry.backupPath);
      }
    }
  } catch (error) {
    diagnostics.push(diagnostic(
      "<transaction>",
      "commit",
      "cleanup-failed",
      "$",
      "failed to remove transaction backups after commit",
      { actual: errorCode(error) },
    ));
    diagnostics.push(...rollbackEntries(entries, fileSystem, transactionId));
    removeCreatedDirectories(createdDirectories, fileSystem);
    return result(planned, diagnostics, false, identifiersByArtifactPath);
  }
  return result(planned, [], true, identifiersByArtifactPath);
}
