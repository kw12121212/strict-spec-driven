import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { normalizeRepoRelativePath } from "./cli/fs.js";
import { readBundledScaffoldTemplate } from "./scaffold.js";
import { loadBundledSchemaByArtifactType, validateArtifact, type ValidationDiagnostic } from "./validation.js";
import { formatYamlParseSummary, getYamlDiagnosticDetails, parseYamlFile } from "./yaml.js";

export const DEBUG_SESSIONS_DIR = ".strict-spec-driven/debug-sessions";
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

  if (!DEBUG_SESSION_ID_PATTERN.test(sessionId)) {
    return {
      ok: false,
      sessionId,
      sessionDir: relativeSessionDir,
      sessionPath: relativeSessionPath,
      evidenceDir: relativeEvidenceDir,
      created: [],
      diagnostics: [
        createDiagnostic(relativeSessionPath, "$.debug_session.id", "debug-session id must be kebab-case", {
          expected: "lowercase letters, numbers, and hyphens",
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
