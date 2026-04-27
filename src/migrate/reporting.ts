import { sortByDeterministicKey } from "../diagnostics.js";
import { LEGACY_WORKFLOW_DIR, type DeferredLegacyArtifact } from "./shared.js";

export type MigrationConvertedArtifact = {
  kind:
    | "workflow_config"
    | "strict_scaffold_asset"
    | "main_spec"
    | "delta_spec"
    | "change_proposal"
    | "change_design"
    | "task_list"
    | "question_list"
    | "roadmap_index"
    | "roadmap_milestone"
    | "spec_index";
  targetPath: string;
  sourcePath?: string;
  note: string;
};

export type MigrationSkippedArtifact = {
  kind: "legacy_markdown_artifact" | "legacy_project_state";
  sourcePath: string;
  reason: string;
};

export type MigrationDiagnostic = {
  code: string;
  message: string;
  sourcePath?: string;
  targetPath?: string;
};

export type MigrationManualFollowUp = {
  sourcePath: string;
  reason: string;
  recommendation: string;
};

export type MigrationResult = {
  valid: boolean;
  targetRoot: string;
  converted: MigrationConvertedArtifact[];
  skipped: MigrationSkippedArtifact[];
  warnings: MigrationDiagnostic[];
  errors: MigrationDiagnostic[];
  manualFollowUp: MigrationManualFollowUp[];
};

export function describeDeferredLegacyArtifact(repoRelativePath: string): DeferredLegacyArtifact {
  if (repoRelativePath === `${LEGACY_WORKFLOW_DIR}/specs/INDEX.md`) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy specs index content is a project-state artifact that still requires a dedicated strict YAML converter.",
      recommendation: "Implement roadmap and project-state migration converters before attempting to migrate specs index state.",
    };
  }
  if (repoRelativePath.startsWith(`${LEGACY_WORKFLOW_DIR}/changes/`)) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy change artifacts require dedicated migration converters before they can become strict YAML change artifacts.",
      recommendation: "Implement the core-workflow migration converters before attempting to self-host migrated changes.",
    };
  }
  if (repoRelativePath.startsWith(`${LEGACY_WORKFLOW_DIR}/roadmap/`)) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy roadmap artifacts require dedicated migration converters before they can become strict roadmap YAML artifacts.",
      recommendation: "Implement roadmap and project-state migration converters before attempting to migrate roadmap state.",
    };
  }
  if (repoRelativePath.startsWith(`${LEGACY_WORKFLOW_DIR}/specs/`)) {
    return {
      kind: "legacy_markdown_artifact",
      reason: "Legacy spec artifacts require dedicated migration converters before they can become strict YAML specs and deltas.",
      recommendation: "Implement spec and delta migration converters before attempting to migrate legacy spec content.",
    };
  }

  return {
    kind: repoRelativePath.endsWith(".md") ? "legacy_markdown_artifact" : "legacy_project_state",
    reason: "This legacy workflow artifact does not have a dedicated migration converter in the current migrate command.",
    recommendation: "Add a dedicated migration converter for this artifact type before treating the migration as complete.",
  };
}

export function sortMigrationResult(result: MigrationResult): MigrationResult {
  sortByDeterministicKey(
    result.converted,
    (artifact) => [artifact.targetPath, artifact.sourcePath ?? "", artifact.kind, artifact.note],
  );
  sortByDeterministicKey(
    result.skipped,
    (artifact) => [artifact.sourcePath, artifact.kind, artifact.reason],
  );
  sortByDeterministicKey(
    result.warnings,
    (diagnostic) => [diagnostic.code, diagnostic.sourcePath ?? "", diagnostic.targetPath ?? "", diagnostic.message],
  );
  sortByDeterministicKey(
    result.errors,
    (diagnostic) => [diagnostic.code, diagnostic.sourcePath ?? "", diagnostic.targetPath ?? "", diagnostic.message],
  );
  sortByDeterministicKey(
    result.manualFollowUp,
    (entry) => [entry.sourcePath, entry.reason, entry.recommendation],
  );
  return result;
}
