import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { parseYamlDocument } from "../yaml.js";
import { listFilesRecursive, normalizePathSeparators, normalizeRepoRelativePath } from "./fs.js";

const STRICT_SPECS_DIR = path.join(".strict-spec-driven", "specs");

const FORBIDDEN_SPEC_SUBDIRS = new Set([".strict-spec-driven", "changes", "archive"]);
const EXCLUDED_MAPPING_SPEC_BASENAMES = new Set(["INDEX.yaml"]);

type MappingField = "implementation" | "tests";

export type MappingAuditDiagnostic = {
  source: "mapping_input" | "mapping_coverage" | "unmapped_evidence";
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
};

export type VerifySpecMappingsResult = {
  valid: boolean;
  diagnostics: MappingAuditDiagnostic[];
  summary: {
    specCount: number;
    mappedImplementationCount: number;
    mappedTestCount: number;
    candidateImplementationCount: number;
    candidateTestCount: number;
    unmappedImplementationCount: number;
    unmappedTestCount: number;
  };
};

function makeMappingDiagnostic(
  source: MappingAuditDiagnostic["source"],
  artifactPath: string,
  fieldPath: string,
  message: string,
  expected?: string,
  actual?: string,
): MappingAuditDiagnostic {
  return { source, artifactPath, fieldPath, message, expected, actual };
}

function normalizeMappedPath(
  rootDir: string,
  artifactPath: string,
  field: MappingField,
  index: number,
  rawPath: unknown,
  diagnostics: MappingAuditDiagnostic[],
): string | null {
  const fieldPath = `$.mapping.${field}[${index}]`;
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        fieldPath,
        "mapping entry must be a non-empty string",
        "non-empty repo-relative path",
        String(rawPath),
      ),
    );
    return null;
  }

  const normalizedInput = rawPath.trim().replaceAll("\\", "/");
  if (path.isAbsolute(normalizedInput)) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        fieldPath,
        "mapping entry must be repo-relative",
        "repo-relative path",
        normalizedInput,
      ),
    );
    return null;
  }

  const resolved = path.resolve(rootDir, normalizedInput);
  const repoRelative = normalizeRepoRelativePath(rootDir, resolved);
  if (repoRelative === ".." || repoRelative.startsWith("../")) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        fieldPath,
        "mapping entry cannot traverse outside repository",
        "path inside repository",
        normalizedInput,
      ),
    );
    return null;
  }

  if (repoRelative !== normalizedInput) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        fieldPath,
        "mapping entry must be normalized repo-relative path",
        repoRelative,
        normalizedInput,
      ),
    );
    return null;
  }

  if (!existsSync(path.join(rootDir, repoRelative))) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        fieldPath,
        "mapping entry points to a file that does not exist",
        "existing file path",
        normalizedInput,
      ),
    );
    return null;
  }

  return repoRelative;
}

function parseSpecMapping(
  rootDir: string,
  specPath: string,
  diagnostics: MappingAuditDiagnostic[],
): { implementation: string[]; tests: string[] } | null {
  const artifactPath = normalizeRepoRelativePath(rootDir, specPath);
  const content = readFileSync(specPath, "utf8");

  let doc: unknown;
  try {
    doc = parseYamlDocument<unknown>(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        "$.mapping",
        "spec file is not valid YAML",
        "parseable YAML mapping",
        message,
      ),
    );
    return null;
  }

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        "$.mapping",
        "spec file must contain a YAML mapping",
        "YAML mapping",
      ),
    );
    return null;
  }

  const mappingValue = (doc as Record<string, unknown>).mapping;
  if (!mappingValue || typeof mappingValue !== "object" || Array.isArray(mappingValue)) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_coverage",
        artifactPath,
        "$.mapping",
        "spec must define mapping.implementation and mapping.tests arrays",
        "mapping object",
      ),
    );
    return null;
  }

  const mapping = mappingValue as Record<string, unknown>;
  const normalized: { implementation: string[]; tests: string[] } = {
    implementation: [],
    tests: [],
  };

  for (const field of ["implementation", "tests"] as const) {
    const value = mapping[field];
    const fieldPath = `$.mapping.${field}`;

    if (!Array.isArray(value)) {
      diagnostics.push(
        makeMappingDiagnostic(
          "mapping_coverage",
          artifactPath,
          fieldPath,
          `mapping.${field} must be an array`,
          "array of repo-relative paths",
          String(value),
        ),
      );
      continue;
    }

    if (value.length === 0) {
      diagnostics.push(
        makeMappingDiagnostic(
          "mapping_coverage",
          artifactPath,
          fieldPath,
          `mapping.${field} must contain at least one mapped path`,
          "non-empty array",
          "[]",
        ),
      );
      continue;
    }

    value.forEach((entry, index) => {
      const mappedPath = normalizeMappedPath(rootDir, artifactPath, field, index, entry, diagnostics);
      if (mappedPath) {
        normalized[field].push(mappedPath);
      }
    });
  }

  return normalized;
}

function collectEvidenceCandidates(rootDir: string): { implementation: string[]; tests: string[] } {
  const implementation = listFilesRecursive(path.join(rootDir, "src"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => normalizeRepoRelativePath(rootDir, file));
  for (const file of ["package.json", "tsconfig.json"]) {
    if (existsSync(path.join(rootDir, file))) {
      implementation.push(file);
    }
  }

  const tests = listFilesRecursive(path.join(rootDir, "test"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => normalizeRepoRelativePath(rootDir, file));

  const dedupeSort = (values: string[]) => [...new Set(values.map((value) => normalizePathSeparators(value)))].sort();
  return {
    implementation: dedupeSort(implementation),
    tests: dedupeSort(tests),
  };
}

function sortMappingDiagnostics(diagnostics: MappingAuditDiagnostic[]): MappingAuditDiagnostic[] {
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

export function verifySpecMappings(rootDir: string): VerifySpecMappingsResult {
  const diagnostics: MappingAuditDiagnostic[] = [];
  const specsDir = path.join(rootDir, STRICT_SPECS_DIR);

  const mapped = {
    implementation: new Set<string>(),
    tests: new Set<string>(),
  };

  if (!existsSync(specsDir) || !statSync(specsDir).isDirectory()) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_input",
        STRICT_SPECS_DIR,
        "$",
        "spec mapping inputs are unavailable because .strict-spec-driven/specs/ does not exist",
        "existing .strict-spec-driven/specs/ directory",
      ),
    );
  }

  if (diagnostics.length === 0) {
    for (const entry of readdirSync(specsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && FORBIDDEN_SPEC_SUBDIRS.has(entry.name)) {
        diagnostics.push(
          makeMappingDiagnostic(
            "mapping_input",
            path.join(STRICT_SPECS_DIR, entry.name),
            "$",
            `.strict-spec-driven/specs/ must not contain a '${entry.name}' subdirectory; workflow state directories belong under .strict-spec-driven/ directly`,
            `no '${entry.name}' subdirectory under .strict-spec-driven/specs/`,
            `found .strict-spec-driven/specs/${entry.name}/`,
          ),
        );
      }
    }
  }

  const specFiles =
    diagnostics.length === 0
      ? listFilesRecursive(specsDir).filter((filePath) => {
          const basename = path.basename(filePath);
          return basename.endsWith(".yaml") && !EXCLUDED_MAPPING_SPEC_BASENAMES.has(basename);
        })
      : [];

  if (diagnostics.length === 0 && specFiles.length === 0) {
    diagnostics.push(
      makeMappingDiagnostic(
        "mapping_input",
        STRICT_SPECS_DIR,
        "$",
        "spec mapping inputs are unavailable because no main spec files were found",
        "at least one main spec YAML file",
      ),
    );
  }

  for (const specFile of specFiles) {
    const mapping = parseSpecMapping(rootDir, specFile, diagnostics);
    if (!mapping) {
      continue;
    }
    mapping.implementation.forEach((value) => mapped.implementation.add(value));
    mapping.tests.forEach((value) => mapped.tests.add(value));
  }

  let evidenceCandidates = { implementation: [] as string[], tests: [] as string[] };
  let unmappedImplementation: string[] = [];
  let unmappedTests: string[] = [];
  const hasInputErrors = diagnostics.some((diagnostic) => diagnostic.source === "mapping_input");
  if (!hasInputErrors) {
    evidenceCandidates = collectEvidenceCandidates(rootDir);
    unmappedImplementation = evidenceCandidates.implementation.filter((file) => !mapped.implementation.has(file));
    unmappedTests = evidenceCandidates.tests.filter((file) => !mapped.tests.has(file));

    for (const unmappedPath of unmappedImplementation) {
      diagnostics.push(
        makeMappingDiagnostic(
          "unmapped_evidence",
          unmappedPath,
          "$",
          "implementation file is not referenced by any spec mapping",
          "mapped by at least one spec mapping.implementation entry",
          "unmapped",
        ),
      );
    }
    for (const unmappedPath of unmappedTests) {
      diagnostics.push(
        makeMappingDiagnostic(
          "unmapped_evidence",
          unmappedPath,
          "$",
          "test file is not referenced by any spec mapping",
          "mapped by at least one spec mapping.tests entry",
          "unmapped",
        ),
      );
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics: sortMappingDiagnostics(diagnostics),
    summary: {
      specCount: specFiles.length,
      mappedImplementationCount: mapped.implementation.size,
      mappedTestCount: mapped.tests.size,
      candidateImplementationCount: evidenceCandidates.implementation.length,
      candidateTestCount: evidenceCandidates.tests.length,
      unmappedImplementationCount: unmappedImplementation.length,
      unmappedTestCount: unmappedTests.length,
    },
  };
}
