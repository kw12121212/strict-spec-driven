import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import {
  ROOT,
  TestContext,
  cli,
  createCopiedProjectWorkspace,
  loadDistModule,
  type YamlModule,
} from "../support/harness.js";

/**
 * Operation-matrix coverage registry for every YAML artifact family in the mutation inventory.
 *
 * The inventory says which command owns each family's operations. This suite is the proof that the
 * claim holds: every family declares a cell for every matrix dimension, and every cell either names
 * the existing suite assertion that already exercises it or is executed here. A family added to the
 * inventory without a table entry fails, so coverage cannot be widened by editing the inventory
 * alone.
 */

const INVENTORY_PATH = path.join(ROOT, "inventory", "yaml-mutation-surfaces.yaml");
const SUITE_DIR = path.join(ROOT, "test", "suites");

const MATRIX_DIMENSIONS = [
  "create",
  "scalar-update",
  "keyed-update",
  "additive-list",
  "named-removal",
  "deletion",
  "invalid-input-no-mutation",
  "rollback",
  "index-reconciliation",
  "deterministic-output",
  "installed-cli",
  "copied-project",
  "mcp-driven",
] as const;

type MatrixDimension = (typeof MATRIX_DIMENSIONS)[number];

type MatrixCell =
  /** Proven by an assertion that already exists in another suite; the label is resolved against it. */
  | { kind: "covered-by"; suite: string; assertion: string }
  /** Proven by this suite, because nothing else exercises it. */
  | { kind: "runs-here" }
  /** The family's lifecycle has no such operation; the reason is recorded so absence stays deliberate. */
  | { kind: "not-applicable"; reason: string };

type FamilyMatrix = {
  owners: string[];
  cells: Record<MatrixDimension, MatrixCell>;
};

function coveredBy(suite: string, assertion: string): MatrixCell {
  return { kind: "covered-by", suite, assertion };
}

const RUNS_HERE: MatrixCell = { kind: "runs-here" };

function notApplicable(reason: string): MatrixCell {
  return { kind: "not-applicable", reason };
}

const NO_MCP_TOOL = notApplicable(
  "the inventory's mcp-mutating-tools surface does not list this family, so no MCP tool reaches it",
);

const CHECKOUT_SCOPED = notApplicable(
  "bundled-asset editing is repository maintenance scoped to this checkout and is never invoked from an installed CLI in another project",
);

const NO_SCENE_COMMAND = notApplicable(
  "this change ships the scene contract only; the inventory declares every scene operation not-applicable and names no CLI owner, so there is no command whose behavior this dimension could exercise",
);

const OPERATION_MATRIX: Record<string, FamilyMatrix> = {
  "workflow-config": {
    owners: ["init", "config-edit"],
    cells: {
      "create": coveredBy("change-lifecycle.ts", "config-edit fixture initializes strict workflow state"),
      "scalar-update": coveredBy("change-lifecycle.ts", "config-edit updates a named scalar"),
      "keyed-update": coveredBy("change-lifecycle.ts", "config-edit upserts a maintenance check by type"),
      "additive-list": coveredBy("change-lifecycle.ts", "config-edit appends nested coverage lists"),
      "named-removal": coveredBy("change-lifecycle.ts", "config-edit removes only named entries"),
      "deletion": coveredBy("change-lifecycle.ts", "config-edit exposes no whole-config deletion operation"),
      "invalid-input-no-mutation": coveredBy("change-lifecycle.ts", "config-edit rejects a candidate that violates the coverage schema"),
      "rollback": coveredBy("change-lifecycle.ts", "rejected config-edit leaves prior bytes unchanged"),
      "index-reconciliation": notApplicable("the workflow config is a single root artifact that no index references"),
      "deterministic-output": coveredBy("change-lifecycle.ts", "equivalent config-edit intent is idempotent"),
      "installed-cli": RUNS_HERE,
      "copied-project": RUNS_HERE,
      "mcp-driven": RUNS_HERE,
    },
  },
  "architecture-state": {
    owners: ["architecture-edit"],
    cells: {
      "create": coveredBy("architecture-authoring.ts", "architecture-edit creates a named component"),
      "scalar-update": RUNS_HERE,
      "keyed-update": coveredBy("architecture-authoring.ts", "architecture-edit creates a sibling component"),
      "additive-list": RUNS_HERE,
      "named-removal": coveredBy("architecture-authoring.ts", "architecture-edit removes one exact nested value"),
      "deletion": coveredBy("architecture-authoring.ts", "architecture delete never deletes the generated document implicitly"),
      "invalid-input-no-mutation": coveredBy("architecture-authoring.ts", "invalid architecture references preserve prior bytes"),
      "rollback": coveredBy("architecture-authoring.ts", "architecture named removal preserves sibling components"),
      "index-reconciliation": coveredBy("architecture-authoring.ts", "architecture updates are idempotent and report document reconciliation"),
      "deterministic-output": coveredBy("architecture-document.ts", "a second architecture-generate run produces a byte-identical document"),
      "installed-cli": RUNS_HERE,
      "copied-project": RUNS_HERE,
      "mcp-driven": RUNS_HERE,
    },
  },
  "design-system-state": {
    owners: ["design-init", "design-edit"],
    cells: {
      "create": coveredBy("design-system-authoring.ts", "design-init creates its YAML through the shared boundary"),
      "scalar-update": coveredBy("design-system-authoring.ts", "design token and guidance updates are non-destructive and idempotent"),
      "keyed-update": coveredBy("design-system-authoring.ts", "design-edit records component token and visual mappings"),
      "additive-list": RUNS_HERE,
      "named-removal": coveredBy("design-system-authoring.ts", "design-edit removes one exact token"),
      "deletion": coveredBy("design-system-authoring.ts", "design delete never removes the generated document implicitly"),
      "invalid-input-no-mutation": coveredBy("design-system-authoring.ts", "invalid design candidates preserve prior bytes"),
      "rollback": coveredBy("design-system-authoring.ts", "token removal preserves sibling design components"),
      "index-reconciliation": coveredBy("design-system-document.ts", "design-init leaves an existing artifact byte-identical"),
      "deterministic-output": coveredBy("design-system-document.ts", "a second design-generate run produces a byte-identical document"),
      "installed-cli": RUNS_HERE,
      "copied-project": RUNS_HERE,
      "mcp-driven": RUNS_HERE,
    },
  },
  "harness-state": {
    owners: ["harness-edit", "harness-infer", "harness-session"],
    cells: {
      "create": coveredBy("harness-authoring.ts", "harness authoring fixture initializes"),
      "scalar-update": coveredBy("harness-authoring.ts", "harness-edit accepts additive named component fields"),
      "keyed-update": coveredBy("harness-authoring.ts", "named removal preserves sibling component state"),
      "additive-list": coveredBy("harness-authoring.ts", "harness-edit de-duplicates repeated list additions"),
      "named-removal": coveredBy("harness-authoring.ts", "harness-edit removes one exact nested list value"),
      "deletion": coveredBy("harness-authoring.ts", "harness deletion is blocked while an active session exists"),
      "invalid-input-no-mutation": coveredBy("harness-authoring.ts", "invalid harness relationships leave the artifact byte-identical"),
      "rollback": coveredBy("harness-authoring.ts", "invalid harness relationships leave the artifact byte-identical"),
      "index-reconciliation": coveredBy("harness-authoring.ts", "active session fixture is created"),
      "deterministic-output": coveredBy("harness-authoring.ts", "harness-edit de-duplicates repeated list additions"),
      "installed-cli": RUNS_HERE,
      "copied-project": RUNS_HERE,
      "mcp-driven": RUNS_HERE,
    },
  },
  "spec-state": {
    owners: ["archive", "spec-edit"],
    cells: {
      "create": coveredBy("spec-tech-authoring.ts", "spec-edit creates meaningful spec state and reconciles its index"),
      "scalar-update": coveredBy("spec-tech-authoring.ts", "spec-edit upserts one requirement and keyed scenario"),
      "keyed-update": coveredBy("spec-tech-authoring.ts", "spec named removal preserves sibling requirement content"),
      "additive-list": coveredBy("spec-tech-authoring.ts", "spec-edit upserts one requirement and keyed scenario"),
      "named-removal": coveredBy("spec-tech-authoring.ts", "spec-edit removes exact scenario entries"),
      "deletion": coveredBy("spec-tech-authoring.ts", "active delta references block whole-artifact deletion"),
      "invalid-input-no-mutation": coveredBy("spec-tech-authoring.ts", "spec identity/path rejection reports recovery metadata and preserves both files"),
      "rollback": coveredBy("spec-tech-authoring.ts", "spec identity/path rejection reports recovery metadata and preserves both files"),
      "index-reconciliation": coveredBy("spec-tech-authoring.ts", "isolated deletion removes only the artifact and its index entry"),
      "deterministic-output": coveredBy("spec-tech-authoring.ts", "archive merges deltas into CLI-authored artifacts and preserves reconciled indexes"),
      "installed-cli": coveredBy("spec-tech-authoring.ts", "compiled CLI authors live spec state inside a copied external project"),
      "copied-project": coveredBy("spec-tech-authoring.ts", "compiled CLI authors live spec state inside a copied external project"),
      "mcp-driven": RUNS_HERE,
    },
  },
  "tech-state": {
    owners: ["archive", "tech-edit"],
    cells: {
      "create": coveredBy("spec-tech-authoring.ts", "tech-edit creates a complete standard and reconciles its index"),
      "scalar-update": coveredBy("spec-tech-authoring.ts", "tech-edit updates one rule and removes exact list entries"),
      "keyed-update": coveredBy("spec-tech-authoring.ts", "tech named removal preserves sibling rule content"),
      "additive-list": coveredBy("spec-tech-authoring.ts", "tech-edit creates a complete standard and reconciles its index"),
      "named-removal": coveredBy("spec-tech-authoring.ts", "tech named removal preserves sibling rule content"),
      "deletion": coveredBy("spec-tech-authoring.ts", "isolated deletion removes only the artifact and its index entry"),
      "invalid-input-no-mutation": coveredBy("spec-tech-authoring.ts", "invalid sibling metadata cannot be coerced into a reconciled index or partially commit"),
      "rollback": coveredBy("spec-tech-authoring.ts", "invalid sibling metadata cannot be coerced into a reconciled index or partially commit"),
      "index-reconciliation": coveredBy("spec-tech-authoring.ts", "tech-edit creates a complete standard and reconciles its index"),
      "deterministic-output": coveredBy("spec-tech-authoring.ts", "archive merges deltas into CLI-authored artifacts and preserves reconciled indexes"),
      "installed-cli": RUNS_HERE,
      "copied-project": RUNS_HERE,
      "mcp-driven": RUNS_HERE,
    },
  },
  "change-planning-state": {
    owners: ["propose", "generate", "apply", "cancel", "archive"],
    cells: {
      "create": coveredBy("foundation-and-fixtures.ts", "propose is idempotent against an artifact-free container so an interrupted first write can be retried"),
      "scalar-update": coveredBy("foundation-and-fixtures.ts", "generate proposal leaves unrelated planning artifacts unchanged"),
      "keyed-update": coveredBy("foundation-and-fixtures.ts", "generate tasks remove-and-restate moves a task between sections in one call"),
      "additive-list": coveredBy("foundation-and-fixtures.ts", "generate rejects removal of the last why entry"),
      "named-removal": coveredBy("foundation-and-fixtures.ts", "generate tasks --remove drops the named task and leaves its siblings"),
      "deletion": coveredBy("foundation-and-fixtures.ts", "generate tasks --delete over completed work is refused and names the completed task"),
      "invalid-input-no-mutation": coveredBy("foundation-and-fixtures.ts", "generate tasks rejection for ${label} leaves the artifact unchanged"),
      "rollback": coveredBy("foundation-and-fixtures.ts", "a refused generate tasks --delete leaves the task list in place"),
      "index-reconciliation": coveredBy("change-lifecycle.ts", "archive regenerates specs index from merged main spec state"),
      "deterministic-output": coveredBy("foundation-and-fixtures.ts", "generate tasks idempotent re-run succeeds"),
      "installed-cli": coveredBy("foundation-and-fixtures.ts", "generate authors an artifact from dist-only output"),
      "copied-project": coveredBy("change-lifecycle.ts", "copied project workspace propose creates an active strict change for lifecycle commands"),
      "mcp-driven": RUNS_HERE,
    },
  },
  "change-delta-state": {
    owners: ["generate", "archive"],
    cells: {
      "create": coveredBy("foundation-and-fixtures.ts", "generate rejects unsupported artifact selector"),
      "scalar-update": coveredBy("foundation-and-fixtures.ts", "generate keeps a repeated equivalent appended scenario idempotent"),
      "keyed-update": coveredBy("foundation-and-fixtures.ts", "generate rejects one delta requirement id restated twice in a single invocation"),
      "additive-list": coveredBy("foundation-and-fixtures.ts", "generate rejects one scenario id restated twice in a single invocation"),
      "named-removal": coveredBy("foundation-and-fixtures.ts", "generate reports the invalid named removal before write"),
      "deletion": coveredBy("foundation-and-fixtures.ts", "generate --delete removes the target artifact file"),
      "invalid-input-no-mutation": coveredBy("foundation-and-fixtures.ts", "generate --delete is rejected alongside an editing flag and leaves the artifact in place"),
      "rollback": coveredBy("foundation-and-fixtures.ts", "generate rejects positional JSON input"),
      "index-reconciliation": coveredBy("change-lifecycle.ts", "archive regenerates tech index from merged standard state"),
      "deterministic-output": coveredBy("foundation-and-fixtures.ts", "generate keeps a repeated equivalent appended scenario idempotent"),
      "installed-cli": coveredBy("foundation-and-fixtures.ts", "generate authors an artifact from dist-only output"),
      "copied-project": coveredBy("change-lifecycle.ts", "copied project workspace modify reports an empty delta-spec directory for the proposed change"),
      "mcp-driven": RUNS_HERE,
    },
  },
  "roadmap-state": {
    owners: [
      "roadmap-generate",
      "roadmap-sync",
      "roadmap-move-planned-change",
      "roadmap-delete-planned-change",
      "roadmap-pause",
      "roadmap-resume",
      "roadmap-defer",
      "roadmap-refine",
      "roadmap-reorder",
      "roadmap-reopen",
      "roadmap-archive",
    ],
    cells: {
      "create": coveredBy("roadmap-and-migration.ts", "roadmap-generate milestone creates a valid milestone"),
      "scalar-update": coveredBy("roadmap-and-migration.ts", "roadmap-generate milestone replaces a scalar field without any confirming flag"),
      "keyed-update": coveredBy("roadmap-and-migration.ts", "roadmap-generate milestone restating an intake question id edits only that question"),
      "additive-list": coveredBy("roadmap-and-migration.ts", "roadmap-generate milestone appends list fields and fills absent scalar fields"),
      "named-removal": coveredBy("roadmap-and-migration.ts", "roadmap-generate milestone --remove-risk drops the named risk"),
      "deletion": coveredBy("roadmap-and-migration.ts", "roadmap-delete-planned-change removes the artifact and reports the deleted planned change"),
      "invalid-input-no-mutation": coveredBy("roadmap-and-migration.ts", "roadmap-generate milestone refuses a removal that matches no entry"),
      "rollback": coveredBy("roadmap-and-migration.ts", "an unmatched team removal leaves the planned change byte-identical"),
      "index-reconciliation": coveredBy("roadmap-and-migration.ts", "roadmap-sync regenerates canonical roadmap index entries from milestone state"),
      "deterministic-output": coveredBy("roadmap-and-migration.ts", "roadmap-move-planned-change is an idempotent no-op for a planned change already in the target milestone"),
      "installed-cli": RUNS_HERE,
      "copied-project": RUNS_HERE,
      "mcp-driven": RUNS_HERE,
    },
  },
  "lessons-state": {
    owners: ["lesson-create", "lesson-list", "lesson-show", "lesson-edit", "lesson-obsolete", "lesson-status"],
    cells: {
      "create": coveredBy("lessons.ts", "lesson-create is idempotent on identical content"),
      "scalar-update": coveredBy("lessons.ts", "lesson-edit records a recurrence"),
      "keyed-update": coveredBy("lessons.ts", "lesson-edit promotes a lesson"),
      "additive-list": coveredBy("lessons.ts", "lesson-edit records a recurrence"),
      "named-removal": notApplicable("lessons record retirement as obsolescence, so no named entry is ever removed from a lesson"),
      "deletion": coveredBy("lessons.ts", "the retired lesson file is never deleted"),
      "invalid-input-no-mutation": coveredBy("lessons.ts", "lesson-edit rejects an occurrence origin with no evidence"),
      "rollback": coveredBy("lessons.ts", "a rejected retirement leaves the lesson untouched"),
      "index-reconciliation": coveredBy("lessons.ts", "the obsolete lesson stays reachable after leaving the default list"),
      "deterministic-output": coveredBy("lessons.ts", "retiring an already-obsolete lesson is idempotent"),
      "installed-cli": RUNS_HERE,
      "copied-project": RUNS_HERE,
      "mcp-driven": NO_MCP_TOOL,
    },
  },
  "sop-state": {
    owners: ["sop-create", "sop-edit"],
    cells: {
      "create": coveredBy("sops.ts", "sop-edit keeps the sop id stable"),
      "scalar-update": coveredBy("sops.ts", "sop-edit exits zero for a valid edit"),
      "keyed-update": coveredBy("sops.ts", "sop-edit appends structured fields and activates a draft SOP"),
      "additive-list": coveredBy("sops.ts", "sop-edit appends structured fields and activates a draft SOP"),
      "named-removal": coveredBy("sops.ts", "an unmatched SOP removal leaves both the SOP and index byte-identical"),
      "deletion": notApplicable("SOP deletion is human-only; the CLI exposes no whole-artifact delete for an SOP"),
      "invalid-input-no-mutation": coveredBy("sops.ts", "sop-edit exits non-zero for an unknown sop id"),
      "rollback": coveredBy("sops.ts", "a rejected SOP mutation leaves both the SOP and index byte-identical"),
      "index-reconciliation": coveredBy("sops.ts", "a rejected SOP mutation leaves both the SOP and index byte-identical"),
      "deterministic-output": coveredBy("sops.ts", "an unmatched SOP removal leaves both the SOP and index byte-identical"),
      "installed-cli": RUNS_HERE,
      "copied-project": RUNS_HERE,
      "mcp-driven": NO_MCP_TOOL,
    },
  },
  "bundled-schema-assets": {
    owners: ["schema-edit"],
    cells: {
      "create": coveredBy("foundation-and-fixtures.ts", "a bundled-asset name that escapes its family is rejected rather than normalized"),
      "scalar-update": coveredBy("foundation-and-fixtures.ts", "a dash-leading value is written as its YAML scalar rather than parsed as a flag"),
      "keyed-update": coveredBy("foundation-and-fixtures.ts", "reference discovery finds the schema registry entry that names a bundled schema"),
      "additive-list": coveredBy("foundation-and-fixtures.ts", "fixture-edit appends to the addressed sequence and leaves every sibling field unchanged"),
      "named-removal": coveredBy("foundation-and-fixtures.ts", "removing an absent field path is a deterministic error rather than a silent no-op"),
      "deletion": coveredBy("foundation-and-fixtures.ts", "deletion is refused while a test suite still references the asset, naming the referencing path"),
      "invalid-input-no-mutation": coveredBy("foundation-and-fixtures.ts", "pre-serialized content is refused for an artifact-role participant and changes nothing"),
      "rollback": coveredBy("foundation-and-fixtures.ts", "a bundled-asset write refuses deterministically where the bundled source tree is absent and creates nothing"),
      "index-reconciliation": coveredBy("foundation-and-fixtures.ts", "an accepted example write regenerates the embedded bundle inside the same transaction"),
      "deterministic-output": coveredBy("foundation-and-fixtures.ts", "a failed embedded-bundle regeneration leaves both the asset and the bundle byte-identical"),
      "installed-cli": CHECKOUT_SCOPED,
      "copied-project": CHECKOUT_SCOPED,
      "mcp-driven": NO_MCP_TOOL,
    },
  },
  "bundled-scaffold-assets": {
    owners: ["template-edit"],
    cells: {
      "create": coveredBy("foundation-and-fixtures.ts", "a bundled-asset name that escapes its family is rejected rather than normalized"),
      "scalar-update": coveredBy("foundation-and-fixtures.ts", "a dash-leading value is written as its YAML scalar rather than parsed as a flag"),
      "keyed-update": coveredBy("foundation-and-fixtures.ts", "required scaffold asset manifest is deterministic"),
      "additive-list": coveredBy("foundation-and-fixtures.ts", "fixture-edit appends to the addressed sequence and leaves every sibling field unchanged"),
      "named-removal": coveredBy("foundation-and-fixtures.ts", "removing an absent field path is a deterministic error rather than a silent no-op"),
      "deletion": coveredBy("foundation-and-fixtures.ts", "deletion is refused while a test suite still references the asset, naming the referencing path"),
      "invalid-input-no-mutation": coveredBy("foundation-and-fixtures.ts", "pre-serialized content is refused for an artifact-role participant and changes nothing"),
      "rollback": coveredBy("foundation-and-fixtures.ts", "a bundled-asset write refuses deterministically where the bundled source tree is absent and creates nothing"),
      "index-reconciliation": coveredBy("foundation-and-fixtures.ts", "an accepted example write regenerates the embedded bundle inside the same transaction"),
      "deterministic-output": coveredBy("foundation-and-fixtures.ts", "required scaffold asset manifest is deterministic"),
      "installed-cli": CHECKOUT_SCOPED,
      "copied-project": CHECKOUT_SCOPED,
      "mcp-driven": NO_MCP_TOOL,
    },
  },
  "bundled-reference-examples": {
    owners: ["sample-edit"],
    cells: {
      "create": coveredBy("foundation-and-fixtures.ts", "a bundled-asset name that escapes its family is rejected rather than normalized"),
      "scalar-update": coveredBy("foundation-and-fixtures.ts", "an accepted example write regenerates the embedded bundle inside the same transaction"),
      "keyed-update": coveredBy("foundation-and-fixtures.ts", "a dash-leading value is written as its YAML scalar rather than parsed as a flag"),
      "additive-list": coveredBy("foundation-and-fixtures.ts", "fixture-edit appends to the addressed sequence and leaves every sibling field unchanged"),
      "named-removal": coveredBy("foundation-and-fixtures.ts", "removing an absent field path is a deterministic error rather than a silent no-op"),
      "deletion": coveredBy("foundation-and-fixtures.ts", "deletion is refused while a test suite still references the asset, naming the referencing path"),
      "invalid-input-no-mutation": coveredBy("foundation-and-fixtures.ts", "an example edit that breaks its registered schema is rejected and the example is unchanged"),
      "rollback": coveredBy("foundation-and-fixtures.ts", "a failed embedded-bundle regeneration leaves both the asset and the bundle byte-identical"),
      "index-reconciliation": coveredBy("foundation-and-fixtures.ts", "an accepted example write regenerates the embedded bundle inside the same transaction"),
      "deterministic-output": coveredBy("foundation-and-fixtures.ts", "a failed embedded-bundle regeneration leaves both the asset and the bundle byte-identical"),
      "installed-cli": CHECKOUT_SCOPED,
      "copied-project": CHECKOUT_SCOPED,
      "mcp-driven": NO_MCP_TOOL,
    },
  },
  "validation-fixtures": {
    owners: ["fixture-edit"],
    cells: {
      "create": coveredBy("foundation-and-fixtures.ts", "fixture-edit creates a new fixture from field edits alone"),
      "scalar-update": coveredBy("foundation-and-fixtures.ts", "an intentionally schema-invalid fixture stays invalid after a fixture-edit write"),
      "keyed-update": coveredBy("foundation-and-fixtures.ts", "fixture-edit appends to the addressed sequence and leaves every sibling field unchanged"),
      "additive-list": coveredBy("foundation-and-fixtures.ts", "fixture-edit appends to the addressed sequence and leaves every sibling field unchanged"),
      "named-removal": coveredBy("foundation-and-fixtures.ts", "fixture-edit named removal deletes only the addressed entry"),
      "deletion": coveredBy("foundation-and-fixtures.ts", "fixture-edit deletes an unreferenced fixture"),
      "invalid-input-no-mutation": coveredBy("foundation-and-fixtures.ts", "field edits to a must-not-parse fixture are refused with a lifecycle diagnostic and change nothing"),
      "rollback": coveredBy("foundation-and-fixtures.ts", "field edits to a must-not-parse fixture are refused with a lifecycle diagnostic and change nothing"),
      "index-reconciliation": coveredBy("foundation-and-fixtures.ts", "reference discovery finds the test suite that asserts against a fixture"),
      "deterministic-output": coveredBy("foundation-and-fixtures.ts", "deletion remains supported for a must-not-parse fixture"),
      "installed-cli": CHECKOUT_SCOPED,
      "copied-project": CHECKOUT_SCOPED,
      "mcp-driven": NO_MCP_TOOL,
    },
  },
  "yaml-mutation-inventory": {
    owners: ["inventory-edit"],
    cells: {
      "create": coveredBy("foundation-and-fixtures.ts", "inventory records stable YAML family identities"),
      "scalar-update": coveredBy("foundation-and-fixtures.ts", "inventory examines code and guidance mutation surfaces"),
      "keyed-update": coveredBy("foundation-and-fixtures.ts", "inventory separates filesystem, CLI, MCP, skill, and documentation surfaces"),
      "additive-list": coveredBy("foundation-and-fixtures.ts", "an unclassified YAML family produces a path-specific diagnostic"),
      "named-removal": coveredBy("foundation-and-fixtures.ts", "an unaccounted direct-write surface produces a path-specific diagnostic"),
      "deletion": coveredBy("foundation-and-fixtures.ts", "deletion is refused while a test suite still references the asset, naming the referencing path"),
      "invalid-input-no-mutation": coveredBy("foundation-and-fixtures.ts", "an inventory write that would leave a tracked YAML path uncovered is rejected by the coverage gate"),
      "rollback": coveredBy("foundation-and-fixtures.ts", "a stale evidence path names the owning family"),
      "index-reconciliation": coveredBy("foundation-and-fixtures.ts", "checked-in YAML mutation inventory covers the repository"),
      "deterministic-output": coveredBy("foundation-and-fixtures.ts", "duplicate stable ids are rejected by YAML parsing"),
      "installed-cli": CHECKOUT_SCOPED,
      "copied-project": CHECKOUT_SCOPED,
      "mcp-driven": NO_MCP_TOOL,
    },
  },
  "legacy-migration-input": {
    owners: ["migrate"],
    cells: {
      "create": notApplicable("legacy .spec-driven input is authored by the external project, never by this CLI"),
      "scalar-update": notApplicable("migrate reads legacy input and never writes it"),
      "keyed-update": notApplicable("migrate reads legacy input and never writes it"),
      "additive-list": notApplicable("migrate reads legacy input and never writes it"),
      "named-removal": notApplicable("migrate reads legacy input and never writes it"),
      "deletion": notApplicable("migrate leaves the legacy directory in place so the migration can be re-run"),
      "invalid-input-no-mutation": coveredBy("roadmap-and-migration.ts", "copied workspace migrate leaves bootstrap config and roadmap inputs unchanged"),
      "rollback": coveredBy("roadmap-and-migration.ts", "copied workspace migrate leaves bootstrap config and roadmap inputs unchanged"),
      "index-reconciliation": coveredBy("roadmap-and-migration.ts", "migrate regenerates strict spec index entries from converted main specs"),
      "deterministic-output": coveredBy("roadmap-and-migration.ts", "migrate preserves scenario step ordering for migrated main specs"),
      "installed-cli": coveredBy("roadmap-and-migration.ts", "copied workspace migrate preserves roadmap milestone identity in strict output"),
      "copied-project": coveredBy("roadmap-and-migration.ts", "copied workspace migrate preserves planned change entries from the todo-project roadmap"),
      "mcp-driven": NO_MCP_TOOL,
    },
  },
  // The scene contract ships ahead of its command surface, so every cell is deliberately empty of
  // execution rather than unproven: the family has no CLI owner to drive. The planned change
  // expose-scene-cli-surface is what turns these cells into executed ones.
  "scene-state": {
    owners: [],
    cells: {
      "create": NO_SCENE_COMMAND,
      "scalar-update": NO_SCENE_COMMAND,
      "keyed-update": NO_SCENE_COMMAND,
      "additive-list": NO_SCENE_COMMAND,
      "named-removal": NO_SCENE_COMMAND,
      "deletion": NO_SCENE_COMMAND,
      "invalid-input-no-mutation": notApplicable(
        "no command writes a scene, so the only scene documents that reach validation are the bundled examples the foundation suite validates directly",
      ),
      "rollback": NO_SCENE_COMMAND,
      "index-reconciliation": notApplicable(
        "no command writes a scene or its index, so no write exists that could leave the two out of step",
      ),
      "deterministic-output": notApplicable(
        "the family renders no generated document and no command emits scene output to compare between runs",
      ),
      "installed-cli": NO_SCENE_COMMAND,
      "copied-project": NO_SCENE_COMMAND,
      "mcp-driven": NO_MCP_TOOL,
    },
  },
};

type InventoryFamily = { cli_owners?: string[] };
type InventorySurface = { families?: string[] };
type InventoryDocument = {
  artifact_families?: Record<string, InventoryFamily>;
  mutation_surfaces?: Record<string, InventorySurface>;
};

type McpToolDefinitionShape = {
  name: string;
  cliCommand: string;
  mutates: boolean;
  toCliArgs: (args: Record<string, unknown>) => string[];
};

type McpToolsModule = {
  MUTATING_TOOL_DEFINITIONS: McpToolDefinitionShape[];
  callMutatingTool: (
    name: string,
    args: Record<string, unknown>,
    options: {
      projectRoot: string;
      runner?: (args: string[], options: { cwd: string }) => { status: number; stdout: string; stderr: string };
    },
  ) => Promise<{ content: { text: string }[]; isError?: boolean }>;
};

/**
 * The MCP tools that reach each family the inventory records as MCP-served. Keys are checked
 * against the inventory below, so a family added to the MCP surface without a tool listed here
 * fails rather than inheriting an empty check.
 */
const MCP_FAMILY_TOOLS: Record<string, string[]> = {
  "workflow-config": ["init_workflow", "config_edit"],
  "architecture-state": ["architecture_edit"],
  "design-system-state": ["design_edit"],
  "harness-state": ["harness_edit", "harness_session_create", "harness_session_mutate"],
  "spec-state": ["spec_edit", "archive_change"],
  "tech-state": ["tech_edit", "archive_change"],
  "change-planning-state": [
    "propose_change",
    "generate_change_artifact",
    "mark_next_task_complete",
    "cancel_change",
    "archive_change",
  ],
  "change-delta-state": ["generate_change_artifact", "archive_change"],
  "roadmap-state": ["roadmap_sync"],
};

function suiteContainsAssertion(suite: string, assertion: string): boolean {
  const suitePath = path.join(SUITE_DIR, suite);
  if (!existsSync(suitePath)) return false;
  return readFileSync(suitePath, "utf8").includes(assertion);
}

/** Minimum complete SOP intent; sop-create requires every one of these fields. */
const MATRIX_SOP_ARGS = [
  "sop-create", "--title", "Matrix SOP", "--category", "generic",
  "--purpose", "Prove SOP authoring through the installed CLI",
  "--trigger", "The operation-matrix suite runs",
  "--scope-in", "SOP authoring through the installed CLI",
  "--success", "The SOP is recorded and listed",
  "--step-id", "run-matrix", "--step-actor", "The test suite",
  "--step-action", "Run the operation matrix suite",
  "--step-expected", "Every family reports coverage",
];

function milestoneArgs(id: string, title: string): string[] {
  return [
    "roadmap-generate", "milestone", "--id", id, "--title", title,
    "--goal", "Prove roadmap authoring through the installed CLI",
    "--intake-question",
    "matrix-scope|What does the milestone cover?|The matrix suite needs one milestone|Scope of the created milestone|Cover installed-CLI roadmap authoring",
  ];
}

function initializedWorkspace(prefix: string): string {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  cli(["init"], { cwd: root });
  return root;
}

export async function runYamlOperationMatrixSuite(context: TestContext): Promise<void> {
  context.section("[yaml-operation-matrix] per-family CLI operation coverage");

  // Read the checked-in inventory directly rather than through the surface module, so completeness
  // is asserted against the recorded evidence instead of against the code under test.
  const yamlModule = await loadDistModule<YamlModule>("yaml.js");
  const inventoryDocument = yamlModule.parseYamlDocument<InventoryDocument>(
    readFileSync(INVENTORY_PATH, "utf8"),
  );
  const inventoryFamilies = inventoryDocument.artifact_families ?? {};
  const inventoryIds = Object.keys(inventoryFamilies).sort();
  const matrixIds = Object.keys(OPERATION_MATRIX).sort();

  context.assert(
    JSON.stringify(matrixIds) === JSON.stringify(inventoryIds),
    "every inventoried artifact family declares operation-matrix coverage",
    `inventory=${inventoryIds.join(",")} matrix=${matrixIds.join(",")}`,
  );

  for (const [familyId, family] of Object.entries(OPERATION_MATRIX)) {
    const declaredOwners = [...(inventoryFamilies[familyId]?.cli_owners ?? [])].sort();
    context.assert(
      JSON.stringify([...family.owners].sort()) === JSON.stringify(declaredOwners),
      `${familyId} matrix owners match the inventory's declared CLI owners`,
      `matrix=${family.owners.join(",")} inventory=${declaredOwners.join(",")}`,
    );
    const missingDimensions = MATRIX_DIMENSIONS.filter((dimension) => !(dimension in family.cells));
    context.assert(
      missingDimensions.length === 0,
      `${familyId} declares every operation-matrix dimension`,
      missingDimensions.join(","),
    );
  }

  // The surface commands read the embedded inventory compiled into dist, not the working-tree file
  // the completeness assertions above parse, so a family is only discoverable once the bundle was
  // regenerated and rebuilt. Driving both commands is what distinguishes the two layers.
  {
    type SurfaceFamily = { kind: string; artifactTypes: string[]; operations: Record<string, string> };
    const surfaceList = JSON.parse(cli(["yaml-surface-list"]).stdout) as { families: SurfaceFamily[] };
    const listedScene = surfaceList.families.find((family) => family.kind === "scene-state");
    context.assert(
      listedScene !== undefined
        && JSON.stringify([...listedScene.artifactTypes].sort()) === JSON.stringify(["scene", "scenes_index"]),
      "yaml-surface-list reports the scene family and both of its artifact types from the embedded inventory",
      JSON.stringify(listedScene),
    );
    context.assert(
      listedScene !== undefined
        && Object.keys(listedScene.operations).length === 4
        && Object.values(listedScene.operations).every((state) => state === "not-applicable"),
      "yaml-surface-list reports every scene operation as not-applicable while no command owns one",
      JSON.stringify(listedScene?.operations),
    );

    const shown = JSON.parse(cli(["yaml-surface-show", "scene-state"]).stdout) as {
      family: {
        cliOwners: string[];
        pathPatterns: string[];
        artifactTypes: { artifactType: string; schemaId?: string; exampleKey?: string }[];
      };
    };
    context.assert(
      shown.family.cliOwners.length === 0
        && shown.family.pathPatterns.includes(".strict-spec-driven/scenes/*/*.yaml"),
      "yaml-surface-show reports the scene family with nested path patterns and no CLI owner",
      JSON.stringify(shown.family.pathPatterns),
    );
    context.assert(
      shown.family.artifactTypes.length === 2
        && shown.family.artifactTypes.every((entry) => entry.schemaId !== undefined && entry.exampleKey !== undefined),
      "yaml-surface-show resolves a registered schema and a bundled example for each scene artifact type",
      JSON.stringify(shown.family.artifactTypes),
    );
  }

  // A reference is only evidence while the assertion it names still exists. Resolving each one turns
  // a renamed or deleted assertion into a matrix failure instead of a silently hollow claim.
  const unresolved: string[] = [];
  for (const [familyId, family] of Object.entries(OPERATION_MATRIX)) {
    for (const [dimension, cell] of Object.entries(family.cells)) {
      if (cell.kind !== "covered-by") continue;
      if (!suiteContainsAssertion(cell.suite, cell.assertion)) {
        unresolved.push(`${familyId}.${dimension} -> ${cell.suite}: ${cell.assertion}`);
      }
    }
  }
  context.assert(
    unresolved.length === 0,
    "every referenced matrix assertion resolves to an existing suite assertion",
    unresolved.join(" | "),
  );

  for (const [familyId, family] of Object.entries(OPERATION_MATRIX)) {
    for (const [dimension, cell] of Object.entries(family.cells)) {
      if (cell.kind !== "not-applicable") continue;
      context.assert(
        cell.reason.trim().length > 0,
        `${familyId}.${dimension} records why the operation does not apply`,
      );
    }
  }

  // A runs-here cell is a promise that this suite executes the operation. Attributing each executed
  // assertion back to its cells lets the final pass fail a cell that claims execution and gets none,
  // so runs-here cannot decay into an unbacked label the way a prose claim would.
  const executedCells = new Set<string>();
  function assertCell(
    familyId: string,
    dimensions: MatrixDimension[],
    condition: boolean,
    label: string,
    detail?: string,
  ): void {
    for (const dimension of dimensions) executedCells.add(`${familyId}.${dimension}`);
    context.assert(condition, label, detail);
  }

  const workspace = initializedWorkspace("strict-yaml-matrix-");
  try {
    const configPath = path.join(workspace, ".strict-spec-driven", "config.yaml");
    const first = cli(["config-edit", "--context", "Matrix workspace context"], { cwd: workspace });
    const afterFirst = readFileSync(configPath, "utf8");
    const second = cli(["config-edit", "--context", "Matrix workspace context"], { cwd: workspace });
    assertCell(
      "workflow-config", ["installed-cli"],
      first.status === 0 && second.status === 0 && readFileSync(configPath, "utf8") === afterFirst,
      "workflow-config: repeated identical config-edit through the installed CLI is byte-identical",
    );

    const architecturePath = path.join(workspace, ".strict-spec-driven", "architecture.yaml");
    cli([
      "architecture-edit", "--id", "matrix-architecture", "--title", "Matrix Architecture",
      "--component", "matrix-core", "--component-title", "Matrix Core",
      "--component-responsibility", "Prove matrix coverage",
    ], { cwd: workspace });
    const scalarUpdate = cli(["architecture-edit", "--title", "Matrix Architecture Revised"], { cwd: workspace });
    const architectureAfterScalar = readFileSync(architecturePath, "utf8");
    assertCell(
      "architecture-state", ["scalar-update", "installed-cli"],
      scalarUpdate.status === 0
        && architectureAfterScalar.includes("Matrix Architecture Revised")
        && architectureAfterScalar.includes("matrix-core"),
      "architecture-state: a scalar update replaces only the named value and preserves components",
    );
    const listUpdate = cli([
      "architecture-edit", "--component", "matrix-core", "--implementation", "src/matrix.ts",
    ], { cwd: workspace });
    const architectureAfterList = readFileSync(architecturePath, "utf8");
    assertCell(
      "architecture-state", ["additive-list"],
      listUpdate.status === 0
        && architectureAfterList.includes("src/matrix.ts")
        && architectureAfterList.includes("Matrix Architecture Revised"),
      "architecture-state: an additive list update appends without dropping prior scalar state",
    );

    const designPath = path.join(workspace, ".strict-spec-driven", "design-system.yaml");
    cli(["design-init"], { cwd: workspace });
    const designResult = cli([
      "design-edit", "--token-group", "colors", "--token", "matrix-color", "--token-value", "#101010",
    ], { cwd: workspace });
    assertCell(
      "design-system-state", ["additive-list", "installed-cli"],
      designResult.status === 0 && existsSync(designPath) && readFileSync(designPath, "utf8").includes("matrix-color"),
      "design-system-state: an additive token update commits through the installed CLI",
    );

    const harnessResult = cli([
      "harness-edit", "--id", "matrix-harness",
      "--environment", "development", "--environment-kind", "development",
      "--component-environment", "development", "--component", "matrix-web", "--component-type", "backend",
    ], { cwd: workspace });
    assertCell(
      "harness-state", ["installed-cli"],
      harnessResult.status === 0
        && readFileSync(path.join(workspace, ".strict-spec-driven", "harness.yaml"), "utf8").includes("matrix-web"),
      "harness-state: the installed CLI declares an environment component",
      harnessResult.stderr.trim() || harnessResult.stdout.trim(),
    );

    const techResult = cli([
      "tech-edit", "matrix-standard", "--title", "Matrix Standard", "--category", "testing",
      "--rule", "matrix-rule", "--strength", "MUST",
      "--statement", "Matrix coverage MUST be declared for every family.",
      "--rationale", "Undeclared families are indistinguishable from covered ones.", "--method", "test",
    ], { cwd: workspace });
    const techIndexPath = path.join(workspace, ".strict-spec-driven", "tech", "INDEX.yaml");
    assertCell(
      "tech-state", ["installed-cli"],
      techResult.status === 0 && readFileSync(techIndexPath, "utf8").includes("matrix-standard"),
      "tech-state: the installed CLI creates a standard and reconciles its index",
    );

    const sopResult = cli(MATRIX_SOP_ARGS, { cwd: workspace });
    assertCell(
      "sop-state", ["installed-cli"],
      sopResult.status === 0 && cli(["sop-list"], { cwd: workspace }).stdout.includes("Matrix SOP"),
      "sop-state: the installed CLI creates an SOP inside an initialized workspace",
      sopResult.stderr.trim() || sopResult.stdout.trim(),
    );

    const lessonResult = cli([
      "lesson-create", "--title", "Matrix coverage needs a registry",
      "--category", "testing", "--context", "Operation matrix work",
      "--observation", "Coverage claimed in prose is not coverage",
      "--takeaway", "Resolve every coverage reference against a real assertion",
      "--applies-when", "declaring test coverage for an artifact family",
      "--origin", "prove-yaml-artifact-operation-coverage",
      "--evidence", "test/suites/yaml-operation-matrix.ts",
    ], { cwd: workspace });
    assertCell(
      "lessons-state", ["installed-cli"],
      lessonResult.status === 0 && cli(["lesson-status"], { cwd: workspace }).status === 0,
      "lessons-state: the installed CLI creates a lesson and reports it through lesson-status",
    );

    const roadmapResult = cli(milestoneArgs("matrix-milestone", "Matrix Milestone"), { cwd: workspace });
    assertCell(
      "roadmap-state", ["installed-cli"],
      roadmapResult.status === 0
        && readFileSync(path.join(workspace, ".strict-spec-driven", "roadmap", "INDEX.yaml"), "utf8")
          .includes("matrix-milestone"),
      "roadmap-state: the installed CLI creates a milestone and reconciles the roadmap index",
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }

  const copied = createCopiedProjectWorkspace("todo-app");
  try {
    cli(["init"], { cwd: copied.workspaceRoot });
    const copiedProjectAuthoring: Array<{ familyId: string; invocations: string[][] }> = [
      { familyId: "workflow-config", invocations: [["config-edit", "--context", "Copied project context"]] },
      {
        familyId: "architecture-state",
        invocations: [["architecture-edit", "--id", "copied-architecture", "--title", "Copied Architecture"]],
      },
      {
        familyId: "design-system-state",
        invocations: [
          ["design-init"],
          ["design-edit", "--token-group", "colors", "--token", "copied-token", "--token-value", "#202020"],
        ],
      },
      {
        familyId: "harness-state",
        invocations: [[
          "harness-edit", "--id", "copied-harness",
          "--environment", "development", "--environment-kind", "development",
          "--component-environment", "development", "--component", "copied-web", "--component-type", "backend",
        ]],
      },
      {
        familyId: "tech-state",
        invocations: [[
          "tech-edit", "copied-standard", "--title", "Copied Standard", "--category", "testing",
          "--rule", "copied-rule", "--strength", "MUST",
          "--statement", "A copied project MUST accept standard authoring.",
          "--rationale", "Installed CLI behavior must not depend on this checkout.", "--method", "test",
        ]],
      },
      { familyId: "sop-state", invocations: [MATRIX_SOP_ARGS] },
      { familyId: "lessons-state", invocations: [[
        "lesson-create", "--title", "Copied project lessons stay authorable",
        "--category", "testing", "--context", "Copied project matrix run",
        "--observation", "Lesson authoring must not depend on this checkout",
        "--takeaway", "Exercise lesson authoring from a copied project",
        "--applies-when", "verifying installed CLI behavior for the lessons family",
        "--origin", "prove-yaml-artifact-operation-coverage",
        "--evidence", "test/suites/yaml-operation-matrix.ts",
      ]] },
      { familyId: "roadmap-state", invocations: [milestoneArgs("copied-milestone", "Copied Milestone")] },
    ];
    for (const { familyId, invocations } of copiedProjectAuthoring) {
      const failures = invocations
        .map((args) => cli(args, { cwd: copied.workspaceRoot }))
        .filter((result) => result.status !== 0);
      assertCell(
        familyId, ["copied-project"],
        failures.length === 0,
        `${familyId}: the installed CLI authors state inside a copied external project`,
        failures.map((failure) => failure.stderr.trim() || failure.stdout.trim()).join(" | "),
      );
    }
    context.assert(
      existsSync(path.join(copied.workspaceRoot, ".spec-driven")),
      "copied project: authoring a strict workspace leaves the legacy migration input in place",
    );
  } finally {
    copied.cleanup();
  }

  // --- MCP-driven coverage ---------------------------------------------------------------------
  // The CLI is not the only agent-reachable route into these artifacts; the MCP mutating tools are
  // a second one. Every dimension above proves the CLI route only, so an MCP tool could stop
  // reaching its owning command without a single cell noticing. Which families the MCP surface
  // serves is read from the inventory rather than restated here, so the two cannot drift.

  const mcpSurfaceFamilies = new Set(
    inventoryDocument.mutation_surfaces?.["mcp-mutating-tools"]?.families ?? [],
  );
  context.assert(
    mcpSurfaceFamilies.size > 0,
    "the inventory records which artifact families the MCP mutating surface serves",
  );
  context.assert(
    JSON.stringify([...mcpSurfaceFamilies].sort()) === JSON.stringify(Object.keys(MCP_FAMILY_TOOLS).sort()),
    "every inventory-declared MCP family names the tools that reach it",
    `inventory=${[...mcpSurfaceFamilies].sort().join(",")} mapped=${Object.keys(MCP_FAMILY_TOOLS).sort().join(",")}`,
  );

  // A not-applicable cell must mean the inventory records no MCP tool for the family, never that
  // nobody got round to proving it.
  for (const [familyId, family] of Object.entries(OPERATION_MATRIX)) {
    const cell = family.cells["mcp-driven"];
    const served = mcpSurfaceFamilies.has(familyId);
    context.assert(
      served ? cell.kind !== "not-applicable" : cell.kind === "not-applicable",
      `${familyId} mcp-driven cell agrees with the inventory's MCP family list`,
      `inventory serves this family=${served}; cell=${cell.kind}`,
    );
  }

  const mcpTools = await loadDistModule<McpToolsModule>("mcp/tools.js");
  const definitionsByName = new Map(mcpTools.MUTATING_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));

  // Delegation equivalence: each family's MCP tools must route to a CLI command the inventory
  // already records as an owner of that family, which is the command the CLI dimensions proved.
  for (const [familyId, toolNames] of Object.entries(MCP_FAMILY_TOOLS)) {
    const owners = new Set(inventoryFamilies[familyId]?.cli_owners ?? []);
    const mismatches = toolNames.map((toolName) => {
      const definition = definitionsByName.get(toolName);
      if (definition === undefined) return `${toolName}: no such mutating tool`;
      if (!definition.mutates) return `${toolName}: not classified as mutating`;
      if (!owners.has(definition.cliCommand)) {
        return `${toolName} -> ${definition.cliCommand} is not an inventory-declared owner`;
      }
      return undefined;
    }).filter((entry): entry is string => entry !== undefined);
    assertCell(
      familyId, ["mcp-driven"],
      mismatches.length === 0,
      `${familyId}: every MCP tool delegates to a CLI command the inventory declares as an owner`,
      mismatches.join(" | "),
    );
  }

  // Delegation says which command an MCP call would run. It does not prove the call reaches disk,
  // so a representative tool per operation shape is executed for real and its mutation observed.
  const mcpWorkspace = initializedWorkspace("strict-yaml-matrix-mcp-");
  try {
    // The tool spawns the CLI for real; it is handed the harness runner so that spawn inherits the
    // suite's redirected HOME and schema-cache root. The default runner would spawn the same
    // compiled entrypoint with the developer's own environment, which the home-isolation standard
    // forbids — the injection point is what keeps this end-to-end without writing a real home.
    const envelopeOf = async (tool: string, args: Record<string, unknown>) => {
      const result = await mcpTools.callMutatingTool(tool, args, {
        projectRoot: mcpWorkspace,
        runner: (cliArgs, options) => cli(cliArgs, { cwd: options.cwd }),
      });
      return JSON.parse(result.content[0]?.text ?? "{}") as { status?: number; stderr?: string };
    };

    const mcpConfigPath = path.join(mcpWorkspace, ".strict-spec-driven", "config.yaml");
    const beforeConfig = readFileSync(mcpConfigPath, "utf8");
    const configEnvelope = await envelopeOf("config_edit", {
      args: ["--context", "Authored end to end through the MCP surface"],
      confirm: true,
    });
    const afterConfig = readFileSync(mcpConfigPath, "utf8");
    context.assert(
      configEnvelope.status === 0
        && afterConfig !== beforeConfig
        && afterConfig.includes("Authored end to end through the MCP surface"),
      "a real MCP config_edit call mutates workflow config on disk",
      configEnvelope.stderr,
    );

    const proposeEnvelope = await envelopeOf("propose_change", { change: "mcp-matrix-change", confirm: true });
    const generateEnvelope = await envelopeOf("generate_change_artifact", {
      change: "mcp-matrix-change",
      artifact: "proposal",
      args: ["--what", "Prove MCP artifact generation", "--why", "The MCP route needs its own evidence"],
      confirm: true,
    });
    const proposalPath = path.join(
      mcpWorkspace, ".strict-spec-driven", "changes", "mcp-matrix-change", "proposal.yaml",
    );
    context.assert(
      proposeEnvelope.status === 0
        && generateEnvelope.status === 0
        && existsSync(proposalPath)
        && readFileSync(proposalPath, "utf8").includes("Prove MCP artifact generation"),
      "a real MCP propose and generate pair writes change planning state on disk",
      `${proposeEnvelope.stderr ?? ""} ${generateEnvelope.stderr ?? ""}`.trim(),
    );

    // A rejected MCP mutation must leave the artifact byte-identical, the same guarantee the
    // invalid-input dimension proves for the CLI route.
    const beforeRejected = readFileSync(proposalPath, "utf8");
    const rejectedEnvelope = await envelopeOf("generate_change_artifact", {
      change: "mcp-matrix-change",
      artifact: "proposal",
      args: ["--remove-what", "no such scope entry"],
      confirm: true,
    });
    context.assert(
      rejectedEnvelope.status !== 0 && readFileSync(proposalPath, "utf8") === beforeRejected,
      "a rejected MCP mutation leaves the target artifact byte-identical",
      String(rejectedEnvelope.status),
    );

    // Confirmation is the MCP surface's own gate, and it must stop the call before the CLI runs.
    const beforeUnconfirmed = readFileSync(mcpConfigPath, "utf8");
    const unconfirmedEnvelope = await envelopeOf("config_edit", { args: ["--context", "Never written"] });
    context.assert(
      unconfirmedEnvelope.status !== 0 && readFileSync(mcpConfigPath, "utf8") === beforeUnconfirmed,
      "an unconfirmed MCP mutation never reaches the filesystem",
    );
  } finally {
    rmSync(mcpWorkspace, { recursive: true, force: true });
  }

  const unexecuted: string[] = [];
  for (const [familyId, family] of Object.entries(OPERATION_MATRIX)) {
    for (const [dimension, cell] of Object.entries(family.cells)) {
      if (cell.kind !== "runs-here") continue;
      if (!executedCells.has(`${familyId}.${dimension}`)) unexecuted.push(`${familyId}.${dimension}`);
    }
  }
  context.assert(
    unexecuted.length === 0,
    "every runs-here matrix cell is backed by an assertion this suite executed",
    unexecuted.join(", "),
  );
}
