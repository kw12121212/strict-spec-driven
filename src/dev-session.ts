import { existsSync } from "fs";
import path from "path";
import { normalizeRepoRelativePath } from "./cli/fs.js";
import { loadBundledSchemaByArtifactType, validateArtifact, type ValidationDiagnostic } from "./validation.js";
import { formatYamlParseSummary, getYamlDiagnosticDetails, parseYamlFile } from "./yaml.js";

export const DEV_SESSION_DECLARATION_PATH = ".strict-spec-driven/dev-session.yaml";

type DevSessionEnvironment = {
  required?: string[];
  optional?: string[];
};

type DevSessionReadiness = {
  type: "http" | "tcp" | "manual";
  url?: string;
  port?: number;
  timeout_seconds: number;
  interval_seconds: number;
  notes?: string[];
};

type DevSessionCleanup = {
  mode: "signal" | "command" | "none";
  signal?: string;
  command?: string;
  grace_period_seconds: number;
};

type DevSessionService = {
  description?: string;
  command: string;
  working_directory: string;
  environment: DevSessionEnvironment;
  urls: string[];
  ports: number[];
  readiness: DevSessionReadiness;
  browser_targets: string[];
  cleanup: DevSessionCleanup;
  unavailable_conditions: string[];
};

type DevSessionBrowserTarget = {
  url: string;
  smoke_paths: string[];
  evidence_labels: string[];
  local_only: boolean;
  service?: string;
  notes?: string[];
};

type DevSessionArtifact = {
  session: {
    id: string;
    description?: string;
    services: Record<string, DevSessionService>;
    browser_targets: Record<string, DevSessionBrowserTarget>;
  };
};

export type DerivedDevSessionPlan = {
  artifactPath: string;
  session: {
    id: string;
    description?: string;
    services: Array<{
      id: string;
      description?: string;
      command: string;
      workingDirectory: string;
      environment: {
        required: string[];
        optional: string[];
      };
      urls: string[];
      ports: number[];
      readiness: {
        type: "http" | "tcp" | "manual";
        url?: string;
        port?: number;
        timeoutSeconds: number;
        intervalSeconds: number;
        notes: string[];
      };
      browserTargets: string[];
      cleanup: {
        mode: "signal" | "command" | "none";
        signal?: string;
        command?: string;
        gracePeriodSeconds: number;
      };
      unavailableConditions: string[];
    }>;
    browserTargets: Array<{
      id: string;
      url: string;
      smokePaths: string[];
      evidenceLabels: string[];
      localOnly: boolean;
      service?: string;
      notes: string[];
    }>;
  };
};

export type DevSessionPlanDiagnostic = {
  source: string;
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
  errorType?: string;
  reason?: string;
  line?: number;
  column?: number;
  snippet?: string;
  offendingCharacter?: string;
};

export type DevSessionPlanResult =
  | (DerivedDevSessionPlan & { valid: true; diagnostics: [] })
  | { valid: false; artifactPath: string; diagnostics: DevSessionPlanDiagnostic[] };

export class DevSessionDeclarationNotFoundError extends Error {
  readonly artifactPath: string;

  constructor(artifactPath: string) {
    super(`dev-session declaration not found at ${artifactPath}`);
    this.name = "DevSessionDeclarationNotFoundError";
    this.artifactPath = artifactPath;
  }
}

export class DevSessionDeclarationValidationError extends Error {
  readonly artifactPath: string;
  readonly diagnostics: ValidationDiagnostic[];

  constructor(artifactPath: string, diagnostics: ValidationDiagnostic[]) {
    super(`dev-session declaration is invalid at ${artifactPath}`);
    this.name = "DevSessionDeclarationValidationError";
    this.artifactPath = artifactPath;
    this.diagnostics = diagnostics;
  }
}

function sortEntries<T>(record: Record<string, T>): Array<[string, T]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

export function deriveDevSessionPlan(rootDir: string): DerivedDevSessionPlan {
  const absolutePath = path.join(rootDir, DEV_SESSION_DECLARATION_PATH);
  const artifactPath = normalizeRepoRelativePath(rootDir, absolutePath);
  if (!existsSync(absolutePath)) {
    throw new DevSessionDeclarationNotFoundError(artifactPath);
  }

  const artifact = parseYamlFile<DevSessionArtifact>(absolutePath);
  const schema = loadBundledSchemaByArtifactType("dev_session");
  const validation = validateArtifact(schema, artifact, artifactPath);
  if (!validation.valid) {
    throw new DevSessionDeclarationValidationError(artifactPath, validation.diagnostics);
  }

  return {
    artifactPath,
    session: {
      id: artifact.session.id,
      description: artifact.session.description,
      services: sortEntries(artifact.session.services).map(([id, service]) => ({
        id,
        description: service.description,
        command: service.command,
        workingDirectory: service.working_directory,
        environment: {
          required: [...(service.environment.required ?? [])],
          optional: [...(service.environment.optional ?? [])],
        },
        urls: [...service.urls],
        ports: [...service.ports],
        readiness: {
          type: service.readiness.type,
          url: service.readiness.url,
          port: service.readiness.port,
          timeoutSeconds: service.readiness.timeout_seconds,
          intervalSeconds: service.readiness.interval_seconds,
          notes: [...(service.readiness.notes ?? [])],
        },
        browserTargets: [...service.browser_targets],
        cleanup: {
          mode: service.cleanup.mode,
          signal: service.cleanup.signal,
          command: service.cleanup.command,
          gracePeriodSeconds: service.cleanup.grace_period_seconds,
        },
        unavailableConditions: [...service.unavailable_conditions],
      })),
      browserTargets: sortEntries(artifact.session.browser_targets).map(([id, target]) => ({
        id,
        url: target.url,
        smokePaths: [...target.smoke_paths],
        evidenceLabels: [...target.evidence_labels],
        localOnly: target.local_only,
        service: target.service,
        notes: [...(target.notes ?? [])],
      })),
    },
  };
}

export function getDevSessionPlanResult(rootDir: string): DevSessionPlanResult {
  const absolutePath = path.join(rootDir, DEV_SESSION_DECLARATION_PATH);
  const artifactPath = normalizeRepoRelativePath(rootDir, absolutePath);

  try {
    const plan = deriveDevSessionPlan(rootDir);
    return {
      valid: true,
      artifactPath: plan.artifactPath,
      diagnostics: [],
      session: plan.session,
    };
  } catch (error) {
    if (error instanceof DevSessionDeclarationNotFoundError) {
      return {
        valid: false,
        artifactPath,
        diagnostics: [{
          source: "filesystem",
          artifactPath,
          fieldPath: "$",
          message: "dev-session declaration file is missing",
          expected: DEV_SESSION_DECLARATION_PATH,
          actual: "missing",
        }],
      };
    }
    if (error instanceof DevSessionDeclarationValidationError) {
      return {
        valid: false,
        artifactPath,
        diagnostics: error.diagnostics,
      };
    }

    return {
      valid: false,
      artifactPath,
      diagnostics: [{
        source: "yaml_parse",
        artifactPath,
        fieldPath: "$",
        message: "dev-session declaration is not parseable YAML",
        expected: "parseable YAML mapping",
        actual: formatYamlParseSummary(error),
        ...(getYamlDiagnosticDetails(error) ?? {}),
      }],
    };
  }
}
