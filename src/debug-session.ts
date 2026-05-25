import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "fs";
import path from "path";
import { normalizeRepoRelativePath } from "./cli/fs.js";
import { readBundledScaffoldTemplate } from "./scaffold.js";
import { loadBundledSchemaByArtifactType, validateArtifact, type ValidationDiagnostic } from "./validation.js";
import { formatYamlParseSummary, getYamlDiagnosticDetails, parseYamlFile } from "./yaml.js";

export const DEBUG_SESSIONS_DIR = ".strict-spec-driven/debug-sessions";
export const DEBUG_SESSION_ARCHIVE_DIR = `${DEBUG_SESSIONS_DIR}/archive`;
export const DEBUG_SESSION_FILE_NAME = "session.yaml";
export const DEBUG_SESSION_TEMPLATE_PATH = "debug-sessions/session.yaml";

const DEBUG_SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const TEMPLATE_SESSION_ID_PLACEHOLDER = "{{session_id}}";

export type DebugSessionDiagnostic = Omit<ValidationDiagnostic, "source"> & {
  source: ValidationDiagnostic["source"] | "filesystem" | "yaml";
  errorType?: string;
  reason?: string;
  line?: number;
  column?: number;
  snippet?: string;
  offendingCharacter?: string;
};

export type DebugSessionCreateResult = {
  ok: boolean;
  sessionId: string;
  sessionDir: string;
  sessionPath: string;
  evidenceDir: string;
  created: string[];
  diagnostics: DebugSessionDiagnostic[];
};

export type DebugSessionValidateResult = {
  valid: boolean;
  artifactPath: string;
  diagnostics: DebugSessionDiagnostic[];
};

export type DebugSessionArchiveResult = {
  ok: boolean;
  sessionId: string | null;
  sourceDir: string;
  sourcePath: string;
  archiveDir: string | null;
  archivePath: string | null;
  diagnostics: DebugSessionDiagnostic[];
};

type DebugSessionArtifact = {
  debug_session?: {
    id?: unknown;
    status?: unknown;
  };
};

function createDiagnostic(
  artifactPath: string,
  fieldPath: string,
  message: string,
  options?: {
    source?: DebugSessionDiagnostic["source"];
    expected?: string;
    actual?: string;
  },
): DebugSessionDiagnostic {
  return {
    source: options?.source ?? "filesystem",
    artifactPath,
    fieldPath,
    message,
    expected: options?.expected,
    actual: options?.actual,
  };
}

function normalizeDebugSessionPath(rootDir: string, target: string): { artifactPath: string; absolutePath: string } {
  const normalized = target.split("\\").join("/");
  const looksLikePath = normalized.includes("/") || normalized.endsWith(".yaml");
  const repoRelativePath = looksLikePath
    ? normalized
    : `${DEBUG_SESSIONS_DIR}/${normalized}/${DEBUG_SESSION_FILE_NAME}`;
  const absolutePath = path.resolve(rootDir, repoRelativePath);
  return {
    artifactPath: normalizeRepoRelativePath(rootDir, absolutePath),
    absolutePath,
  };
}

function formatLocalDate(date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDebugSessionArchiveDestination(rootDir: string, sessionId: string): string {
  const archiveRoot = path.join(rootDir, DEBUG_SESSION_ARCHIVE_DIR);
  mkdirSync(archiveRoot, { recursive: true });

  const baseName = `${formatLocalDate()}-${sessionId}`;
  let candidate = path.join(archiveRoot, baseName);
  let sequence = 2;

  while (existsSync(candidate)) {
    candidate = path.join(archiveRoot, `${baseName}-${sequence}`);
    sequence += 1;
  }

  return candidate;
}

function isDirectory(filePath: string): boolean {
  return existsSync(filePath) && statSync(filePath).isDirectory();
}

function yamlDiagnosticFromError(artifactPath: string, error: unknown): DebugSessionDiagnostic {
  const details = getYamlDiagnosticDetails(error);
  return {
    source: "yaml",
    artifactPath,
    fieldPath: "$",
    message: formatYamlParseSummary(error),
    actual: "invalid-yaml",
    errorType: details?.errorType,
    reason: details?.reason,
    line: details?.line,
    column: details?.column,
    snippet: details?.snippet,
    offendingCharacter: details?.offendingCharacter,
  };
}

export function createDebugSession(rootDir: string, sessionId: string): DebugSessionCreateResult {
  const sessionDir = path.join(rootDir, DEBUG_SESSIONS_DIR, sessionId);
  const sessionPath = path.join(sessionDir, DEBUG_SESSION_FILE_NAME);
  const evidenceDir = path.join(sessionDir, "evidence");
  const relativeSessionDir = normalizeRepoRelativePath(rootDir, sessionDir);
  const relativeSessionPath = normalizeRepoRelativePath(rootDir, sessionPath);
  const relativeEvidenceDir = normalizeRepoRelativePath(rootDir, evidenceDir);

  if (!DEBUG_SESSION_ID_PATTERN.test(sessionId) || sessionId === "archive") {
    return {
      ok: false,
      sessionId,
      sessionDir: relativeSessionDir,
      sessionPath: relativeSessionPath,
      evidenceDir: relativeEvidenceDir,
      created: [],
      diagnostics: [
        createDiagnostic(relativeSessionPath, "$.debug_session.id", "debug-session id must be kebab-case and not reserved", {
          expected: "lowercase letters, numbers, hyphens, and not 'archive'",
          actual: sessionId,
        }),
      ],
    };
  }

  if (existsSync(sessionPath) || existsSync(evidenceDir)) {
    return {
      ok: false,
      sessionId,
      sessionDir: relativeSessionDir,
      sessionPath: relativeSessionPath,
      evidenceDir: relativeEvidenceDir,
      created: [],
      diagnostics: [
        createDiagnostic(relativeSessionPath, "$", "debug-session already exists", {
          expected: "new debug-session directory",
          actual: relativeSessionDir,
        }),
      ],
    };
  }

  mkdirSync(evidenceDir, { recursive: true });
  const template = readBundledScaffoldTemplate(DEBUG_SESSION_TEMPLATE_PATH);
  writeFileSync(sessionPath, template.replaceAll(TEMPLATE_SESSION_ID_PLACEHOLDER, sessionId), "utf8");

  return {
    ok: true,
    sessionId,
    sessionDir: relativeSessionDir,
    sessionPath: relativeSessionPath,
    evidenceDir: `${relativeEvidenceDir}/`,
    created: [relativeSessionPath, `${relativeEvidenceDir}/`],
    diagnostics: [],
  };
}

export function validateDebugSession(rootDir: string, target: string): DebugSessionValidateResult {
  const { artifactPath, absolutePath } = normalizeDebugSessionPath(rootDir, target);
  if (!existsSync(absolutePath)) {
    return {
      valid: false,
      artifactPath,
      diagnostics: [
        createDiagnostic(artifactPath, "$", "debug-session artifact not found", {
          expected: "session.yaml file",
          actual: "missing",
        }),
      ],
    };
  }

  let artifact: unknown;
  try {
    artifact = parseYamlFile(absolutePath);
  } catch (error) {
    return {
      valid: false,
      artifactPath,
      diagnostics: [yamlDiagnosticFromError(artifactPath, error)],
    };
  }

  const schema = loadBundledSchemaByArtifactType("debug_session");
  const result = validateArtifact(schema, artifact, artifactPath);
  return {
    valid: result.valid,
    artifactPath,
    diagnostics: result.diagnostics,
  };
}

export function archiveDebugSession(rootDir: string, target: string): DebugSessionArchiveResult {
  const { artifactPath, absolutePath } = normalizeDebugSessionPath(rootDir, target);
  const sourceDir = path.dirname(absolutePath);
  const relativeSourceDir = normalizeRepoRelativePath(rootDir, sourceDir);

  const missingResult = {
    ok: false,
    sessionId: null,
    sourceDir: relativeSourceDir,
    sourcePath: artifactPath,
    archiveDir: null,
    archivePath: null,
  };

  if (!existsSync(absolutePath)) {
    return {
      ...missingResult,
      diagnostics: [
        createDiagnostic(artifactPath, "$", "debug-session artifact not found", {
          expected: "session.yaml file",
          actual: "missing",
        }),
      ],
    };
  }

  const activeRoot = path.resolve(rootDir, DEBUG_SESSIONS_DIR);
  const sourceParent = path.dirname(path.resolve(sourceDir));
  if (path.basename(absolutePath) !== DEBUG_SESSION_FILE_NAME || sourceParent !== activeRoot || !isDirectory(sourceDir)) {
    return {
      ...missingResult,
      diagnostics: [
        createDiagnostic(artifactPath, "$", "debug-session archive target must be an active session.yaml artifact", {
          expected: `${DEBUG_SESSIONS_DIR}/<session-id>/${DEBUG_SESSION_FILE_NAME}`,
          actual: artifactPath,
        }),
      ],
    };
  }

  const validation = validateDebugSession(rootDir, artifactPath);
  if (!validation.valid) {
    return {
      ...missingResult,
      diagnostics: validation.diagnostics,
    };
  }

  let artifact: DebugSessionArtifact;
  try {
    artifact = parseYamlFile(absolutePath) as DebugSessionArtifact;
  } catch (error) {
    return {
      ...missingResult,
      diagnostics: [yamlDiagnosticFromError(artifactPath, error)],
    };
  }

  const sessionId = artifact.debug_session?.id;
  const status = artifact.debug_session?.status;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return {
      ...missingResult,
      diagnostics: [
        createDiagnostic(artifactPath, "$.debug_session.id", "debug-session artifact is missing a session id", {
          expected: "non-empty debug_session.id",
          actual: typeof sessionId,
        }),
      ],
    };
  }

  if (sessionId === "archive") {
    return {
      ...missingResult,
      sessionId,
      diagnostics: [
        createDiagnostic(artifactPath, "$.debug_session.id", "debug-session id is reserved for archived sessions", {
          expected: "non-reserved debug-session id",
          actual: sessionId,
        }),
      ],
    };
  }

  if (path.basename(sourceDir) !== sessionId) {
    return {
      ...missingResult,
      sessionId,
      diagnostics: [
        createDiagnostic(artifactPath, "$.debug_session.id", "debug-session id must match its active directory name", {
          expected: path.basename(sourceDir),
          actual: sessionId,
        }),
      ],
    };
  }

  if (status !== "resolved" && status !== "blocked") {
    return {
      ...missingResult,
      sessionId,
      diagnostics: [
        createDiagnostic(artifactPath, "$.debug_session.status", "debug-session must be resolved or blocked before archive", {
          expected: "resolved or blocked",
          actual: typeof status === "string" ? status : typeof status,
        }),
      ],
    };
  }

  const archiveDestination = buildDebugSessionArchiveDestination(rootDir, sessionId);
  const archivePath = path.join(archiveDestination, DEBUG_SESSION_FILE_NAME);
  renameSync(sourceDir, archiveDestination);

  return {
    ok: true,
    sessionId,
    sourceDir: relativeSourceDir,
    sourcePath: artifactPath,
    archiveDir: normalizeRepoRelativePath(rootDir, archiveDestination),
    archivePath: normalizeRepoRelativePath(rootDir, archivePath),
    diagnostics: [],
  };
}
