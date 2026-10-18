/**
 * The document classifier: decides whether a document's declared
 * artifact_type is one the strict schema vocabulary defines, and extracts
 * that declaration from parsed document data.
 *
 * A document's family follows the canonical location it lives under — the
 * traversal places every entry while it walks, so a delta spec inside an
 * active change directory belongs to the changes family exactly as the tree
 * presents it. The declared artifact_type refines what the model knows about
 * a document: a type in the vocabulary routes label derivation and marks the
 * classification known, and a type outside it falls back to the same
 * path-derived placement with the file still listed and its label taken from
 * the file name.
 */

/**
 * Every artifact_type the strict schema vocabulary defines, including the
 * families this repository does not currently carry (SOPs, design system).
 * Delta artifacts (delta_spec, delta_tech, delta_scene) are change-owned:
 * they appear inside an active change directory or an archive.
 */
const KNOWN_ARTIFACT_TYPES: ReadonlySet<string> = new Set([
  "workflow_config",
  "architecture",
  "roadmap_index",
  "roadmap_milestone",
  "planned_change",
  "change_proposal",
  "change_design",
  "task_list",
  "question_list",
  "delta_spec",
  "delta_tech",
  "delta_scene",
  "scenes_index",
  "scene",
  "spec_index",
  "main_spec",
  "tech_index",
  "main_tech",
  "lessons_index",
  "lesson",
  "sops_index",
  "sop_category",
  "sop",
  "design_system",
]);

/** Whether the classifier knows one artifact_type. */
export function isKnownArtifactType(artifactType: string | undefined): boolean {
  return artifactType !== undefined && KNOWN_ARTIFACT_TYPES.has(artifactType);
}

/** The artifact_type a parsed strict document declares, when it declares one. */
export function declaredArtifactType(data: unknown): string | undefined {
  if (typeof data === "object" && data !== null && "artifact_type" in data) {
    const declared = (data as { artifact_type?: unknown }).artifact_type;
    if (typeof declared === "string" && declared.length > 0) {
      return declared;
    }
  }
  return undefined;
}
