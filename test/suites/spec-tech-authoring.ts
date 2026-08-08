import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import {
  ROOT,
  TestContext,
  cli,
  createCopiedProjectWorkspace,
  loadDistModule,
  type YamlModule,
} from "../support/harness.js";

type MainSpec = {
  spec: { id: string; title: string };
  mapping?: unknown;
  requirements: Record<string, { statement: string; scenarios: Record<string, unknown[]> }>;
};

type MainTech = {
  standard: { id: string; title: string; category: string };
  mapping?: unknown;
  rules: Record<string, { statement: string; examples?: { good?: string[] }; exceptions?: string[] }>;
};

function resolveSeededQuestions(root: string, change: string): void {
  const args = ["generate", change, "questions"];
  for (const id of [
    "requirement-problem",
    "requirement-outcome",
    "requirement-trigger",
    "requirement-non-goals",
    "requirement-interpretation",
  ]) {
    args.push("--resolve", id, "--answer", `Roadmap answer for ${id}`, "--answered-by", "roadmap");
  }
  cli(args, { cwd: root });
}

function scaffoldArchiveCompatibilityChange(root: string): void {
  const change = "archive-compatibility";
  cli(["propose", change], { cwd: root });
  cli([
    "generate", change, "proposal",
    "--what", "Merge deltas into CLI-authored live artifacts",
    "--why", "Prove archive compatibility",
    "--in", "Add one requirement and one rule",
    "--out", "Change unrelated artifacts",
    "--unchanged", "Existing live content remains",
  ], { cwd: root });
  cli([
    "generate", change, "design",
    "--approach", "Use existing archive merge behavior",
    "--decision", "keep-archive",
    "--decision-text", "Keep archive as the delta merge owner",
    "--rationale", "Live authoring and delta merge remain separate compatible paths",
  ], { cwd: root });
  resolveSeededQuestions(root, change);
  cli([
    "generate", change, "tasks",
    "--section", "Implementation", "--task", "implement", "--text", "Implement deltas", "--status", "complete",
  ], { cwd: root });
  cli([
    "generate", change, "tasks",
    "--section", "Testing", "--task", "test", "--text", "Test archive", "--status", "complete", "--command", "true",
    "--validation-task", "test", "--unit-test-task", "test",
  ], { cwd: root });
  cli([
    "generate", change, "tasks",
    "--section", "Verification", "--task", "verify", "--text", "Verify archive", "--status", "complete",
  ], { cwd: root });
  cli([
    "generate", change, "delta-spec", "--target-spec", "live-spec",
    "--operation", "ADDED", "--requirement", "archive-added", "--strength", "MUST",
    "--statement", "Archive MUST merge into a CLI-authored spec.",
    "--scenario", "archive-merges", "--given", "A live spec exists", "--when", "Archive runs", "--then", "The requirement is merged",
  ], { cwd: root });
  cli([
    "generate", change, "delta-tech", "--target-standard", "coding-rules",
    "--operation", "ADDED", "--rule", "archive-added", "--strength", "MUST",
    "--statement", "Archive MUST merge into a CLI-authored standard.",
    "--rationale", "Both supported mutation paths must remain compatible.", "--method", "test",
  ], { cwd: root });
}

export async function runSpecTechAuthoringSuite(context: TestContext): Promise<void> {
  context.section("[spec-tech-authoring] live main artifact mutations");
  const yaml = await loadDistModule<YamlModule>("yaml.js");
  const mcpInventory = await loadDistModule<{
    MCP_MUTATING_TOOL_INVENTORY: Array<{ name: string; cliCommand: string; description: string }>;
  }>("mcp/inventory.js");
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-spec-tech-authoring-"));
  try {
    context.assert(cli(["init"], { cwd: root }).status === 0, "live authoring fixture initializes");
    const specHelp = cli(["spec-edit", "--help", "--json"], { cwd: root });
    const helpPayload = JSON.parse(specHelp.stdout) as {
      flags: Array<{ name: string }>;
      artifactSurface: Array<{ artifactKind: string }>;
    };
    context.assert(
      specHelp.status === 0
        && helpPayload.flags.some((entry) => entry.name === "--remove-scenario")
        && helpPayload.flags.some((entry) => entry.name === "--delete")
        && helpPayload.artifactSurface.some((entry) => entry.artifactKind === "spec-state")
        && mcpInventory.MCP_MUTATING_TOOL_INVENTORY.some((entry) =>
          entry.name === "spec_edit" && entry.cliCommand === "spec-edit" && entry.description.includes("spec-state")
        )
        && mcpInventory.MCP_MUTATING_TOOL_INVENTORY.some((entry) =>
          entry.name === "tech_edit" && entry.cliCommand === "tech-edit" && entry.description.includes("tech-state")
        ),
      "help and MCP surfaces derive spec and tech authoring metadata from the mutation inventory",
      specHelp.stderr.trim(),
    );
    const specPath = path.join(root, ".strict-spec-driven", "specs", "live-spec.yaml");
    const specIndexPath = path.join(root, ".strict-spec-driven", "specs", "INDEX.yaml");
    const createSpec = cli([
      "spec-edit", "live-spec", "--title", "Live Spec", "--requirement", "live-behavior",
      "--strength", "MUST", "--statement", "The live behavior MUST be observable.", "--scenario", "observe-live",
      "--given", "A live artifact", "--when", "The command authors it", "--then", "The behavior is recorded",
    ], { cwd: root });
    const createdSpec = yaml.parseYamlFile<MainSpec>(specPath);
    const createdIndex = yaml.parseYamlFile<{ specs: Array<{ id: string; path: string }> }>(specIndexPath);
    context.assert(
      createSpec.status === 0
        && createdSpec.mapping === undefined
        && createdIndex.specs.some((entry) => entry.id === "live-spec" && entry.path.endsWith("live-spec.yaml")),
      "spec-edit creates meaningful spec state and reconciles its index",
      createSpec.stderr.trim(),
    );

    context.assert(cli([
      "spec-edit", "live-spec", "--requirement", "live-behavior", "--statement", "The updated behavior MUST remain observable.",
      "--scenario", "second-scenario", "--given", "Existing content", "--when", "One scenario is added", "--then", "Sibling content remains",
    ], { cwd: root }).status === 0, "spec-edit upserts one requirement and keyed scenario");
    context.assert(cli([
      "spec-edit", "live-spec", "--remove-scenario", "live-behavior:observe-live",
    ], { cwd: root }).status === 0, "spec-edit removes exact scenario entries");
    const updatedSpec = yaml.parseYamlFile<MainSpec>(specPath);
    context.assert(
      updatedSpec.mapping === undefined
        && updatedSpec.requirements["live-behavior"]?.scenarios["second-scenario"] !== undefined,
      "spec named removal preserves sibling requirement content",
    );

    const specBeforeMismatch = readFileSync(specPath, "utf8");
    const indexBeforeMismatch = readFileSync(specIndexPath, "utf8");
    const mismatch = cli(["spec-edit", "live-spec", "--spec-path", ".strict-spec-driven/specs/other.yaml", "--title", "Wrong Path"], { cwd: root });
    const mismatchPayload = JSON.parse(mismatch.stdout) as { diagnostics: Array<{ code: string; artifactKind?: string }> };
    context.assert(
      mismatch.status !== 0
        && mismatchPayload.diagnostics.some((entry) => entry.code === "canonical-path-mismatch" && entry.artifactKind === "spec-state")
        && readFileSync(specPath, "utf8") === specBeforeMismatch
        && readFileSync(specIndexPath, "utf8") === indexBeforeMismatch,
      "spec identity/path rejection reports recovery metadata and preserves both files",
    );
    for (const removedFlag of ["--implementation", "--test", "--remove-implementation", "--remove-test"]) {
      const removedMappingFlag = cli(["spec-edit", "live-spec", removedFlag, "src/live.ts"], { cwd: root });
      context.assert(
        removedMappingFlag.status !== 0
          && readFileSync(specPath, "utf8") === specBeforeMismatch
          && readFileSync(specIndexPath, "utf8") === indexBeforeMismatch,
        `spec-edit rejects the removed mapping flag ${removedFlag} without changing either artifact`,
        removedMappingFlag.stderr.trim(),
      );
    }

    const techPath = path.join(root, ".strict-spec-driven", "tech", "coding-rules.yaml");
    const techIndexPath = path.join(root, ".strict-spec-driven", "tech", "INDEX.yaml");
    const createTech = cli([
      "tech-edit", "coding-rules", "--title", "Coding Rules", "--category", "coding", "--rule", "avoid-any",
      "--strength", "SHOULD", "--statement", "Code SHOULD avoid any.", "--rationale", "Typed boundaries prevent drift.",
      "--method", "review", "--example-good", "Use unknown and narrow it.", "--exception", "Generated declarations may use any.",
    ], { cwd: root });
    const createdTech = yaml.parseYamlFile<MainTech>(techPath);
    const createdTechIndex = yaml.parseYamlFile<{ standards: Array<{ id: string; path: string }> }>(techIndexPath);
    context.assert(
      createTech.status === 0
        && createdTech.rules["avoid-any"]?.examples?.good?.length === 1
        && createdTechIndex.standards.some((entry) => entry.id === "coding-rules"),
      "tech-edit creates a complete standard and reconciles its index",
      createTech.stderr.trim(),
    );
    context.assert(cli([
      "tech-edit", "coding-rules", "--rule", "avoid-any", "--detail", "Review changed TypeScript.",
      "--remove-exception", "Generated declarations may use any.",
    ], { cwd: root }).status === 0, "tech-edit updates one rule and removes exact list entries");
    for (const removedFlag of ["--implementation", "--enforcement", "--remove-implementation", "--remove-enforcement"]) {
      const removedTechMappingFlag = cli(["tech-edit", "coding-rules", removedFlag, "src/live.ts"], { cwd: root });
      context.assert(
        removedTechMappingFlag.status !== 0,
        `tech-edit rejects the removed mapping flag ${removedFlag}`,
        removedTechMappingFlag.stderr.trim(),
      );
    }
    const updatedTech = yaml.parseYamlFile<MainTech>(techPath);
    context.assert(
      updatedTech.mapping === undefined
        && updatedTech.rules["avoid-any"]?.exceptions === undefined
        && updatedTech.rules["avoid-any"]?.examples?.good?.length === 1,
      "tech named removal preserves sibling rule content",
    );

    const malformedSiblingPath = path.join(root, ".strict-spec-driven", "tech", "malformed-sibling.yaml");
    writeFileSync(malformedSiblingPath, [
      "schema: strict-spec-driven/main-tech/v1",
      "schema_version: 1",
      "artifact_type: main_tech",
      "schema_file: templates/strict-spec-driven/schemas/main-tech.yaml",
      "standard:",
      "  id: malformed-sibling",
      "  category: coding",
      "mapping:",
      "  implementation: []",
      "  enforcement: []",
      "rules: {}",
      "",
    ].join("\n"), "utf8");
    const techBeforeSiblingFailure = readFileSync(techPath, "utf8");
    const techIndexBeforeSiblingFailure = readFileSync(techIndexPath, "utf8");
    const malformedSibling = cli(["tech-edit", "coding-rules", "--title", "Still Coding Rules"], { cwd: root });
    context.assert(
      malformedSibling.status !== 0
        && readFileSync(techPath, "utf8") === techBeforeSiblingFailure
        && readFileSync(techIndexPath, "utf8") === techIndexBeforeSiblingFailure,
      "invalid sibling metadata cannot be coerced into a reconciled index or partially commit",
    );
    rmSync(malformedSiblingPath);

    scaffoldArchiveCompatibilityChange(root);
    const archive = cli(["archive", "archive-compatibility"], { cwd: root });
    const archivedSpec = yaml.parseYamlFile<MainSpec>(specPath);
    const archivedTech = yaml.parseYamlFile<MainTech>(techPath);
    context.assert(
      archive.status === 0
        && archivedSpec.requirements["archive-added"] !== undefined
        && archivedTech.rules["archive-added"] !== undefined
        && yaml.parseYamlFile<{ specs: Array<{ id: string }> }>(specIndexPath).specs.some((entry) => entry.id === "live-spec")
        && yaml.parseYamlFile<{ standards: Array<{ id: string }> }>(techIndexPath).standards.some((entry) => entry.id === "coding-rules"),
      "archive merges deltas into CLI-authored artifacts and preserves reconciled indexes",
      archive.stderr.trim(),
    );

    const blockerDir = path.join(root, ".strict-spec-driven", "changes", "delete-blocker", "specs");
    const techBlockerDir = path.join(root, ".strict-spec-driven", "changes", "delete-blocker", "tech");
    mkdirSync(blockerDir, { recursive: true });
    mkdirSync(techBlockerDir, { recursive: true });
    writeFileSync(path.join(blockerDir, "live.yaml"), "target_spec: live-spec\n", "utf8");
    writeFileSync(path.join(techBlockerDir, "coding.yaml"), "target_standard: coding-rules\n", { encoding: "utf8", flag: "w" });
    const blockedSpecDelete = cli(["spec-edit", "live-spec", "--delete"], { cwd: root });
    const blockedTechDelete = cli(["tech-edit", "coding-rules", "--delete"], { cwd: root });
    context.assert(
      blockedSpecDelete.status !== 0 && blockedTechDelete.status !== 0 && existsSync(specPath) && existsSync(techPath),
      "active delta references block whole-artifact deletion",
    );
    rmSync(path.join(root, ".strict-spec-driven", "changes", "delete-blocker"), { recursive: true, force: true });
    context.assert(
      cli(["spec-edit", "live-spec", "--delete"], { cwd: root }).status === 0
        && cli(["tech-edit", "coding-rules", "--delete"], { cwd: root }).status === 0
        && !existsSync(specPath)
        && !existsSync(techPath)
        && yaml.parseYamlFile<{ specs: Array<{ id: string }> }>(specIndexPath).specs.every((entry) => entry.id !== "live-spec")
        && yaml.parseYamlFile<{ standards: Array<{ id: string }> }>(techIndexPath).standards.every((entry) => entry.id !== "coding-rules"),
      "isolated deletion removes only the artifact and its index entry",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const copied = createCopiedProjectWorkspace("todo-app");
  try {
    cli(["init"], { cwd: copied.workspaceRoot });
    const result = cli([
      "spec-edit", "todo-cli-authoring", "--title", "Todo CLI Authoring",
      "--requirement", "todo-authoring", "--strength", "MUST",
      "--statement", "The copied project MUST accept live spec authoring.", "--scenario", "author-in-copy",
      "--given", "A copied project", "--when", "spec-edit runs", "--then", "The spec and index are created",
    ], { cwd: copied.workspaceRoot });
    context.assert(
      result.status === 0
        && existsSync(path.join(copied.workspaceRoot, ".strict-spec-driven", "specs", "todo-cli-authoring.yaml")),
      "compiled CLI authors live spec state inside a copied external project",
      result.stderr.trim(),
    );
  } finally {
    copied.cleanup();
  }
}

export async function runMappingRemovalSuite(context: TestContext): Promise<void> {
  context.section("[mapping-removal] file mappings are gone from the artifact model");
  const yaml = await loadDistModule<YamlModule>("yaml.js");

  // The four artifact schemas that used to carry a mapping contract must no longer require it
  // or describe its shape; a bare permissive allowance is all that may remain.
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-spec-mapping-removal-"));
  try {
    cli(["init"], { cwd: root });

    for (const asset of ["main-spec", "delta-spec", "main-tech", "delta-tech"]) {
      const shown = cli(["schema-show", asset], { cwd: root });
      const parsed = yaml.parseYamlDocument<{
        json_schema: { required: string[]; properties: Record<string, Record<string, unknown>> };
      }>(shown.stdout, { source: `${asset}.yaml` });
      context.assert(
        shown.status === 0 && !parsed.json_schema.required.includes("mapping"),
        `${asset} schema no longer requires a mapping field`,
        JSON.stringify(parsed.json_schema.required),
      );
      const mappingProperty = parsed.json_schema.properties.mapping ?? {};
      context.assert(
        mappingProperty.type === undefined
          && mappingProperty.properties === undefined
          && mappingProperty.required === undefined,
        `${asset} schema declares no mapping structure`,
        JSON.stringify(mappingProperty),
      );
    }

    // init scaffolding and the bundled examples must not reintroduce the field.
    const scaffoldedSpec = path.join(root, ".strict-spec-driven", "specs");
    const scaffoldFiles = existsSync(scaffoldedSpec)
      ? readdirSync(scaffoldedSpec).filter((name) => name.endsWith(".yaml"))
      : [];
    context.assert(
      scaffoldFiles.every((name) => !readFileSync(path.join(scaffoldedSpec, name), "utf8").includes("\nmapping:")),
      "init scaffold output contains no mapping field",
      scaffoldFiles.join(","),
    );
    for (const sample of ["main-spec", "main-tech", "delta-spec", "delta-tech"]) {
      const shown = cli(["sample-show", sample], { cwd: root });
      context.assert(
        shown.status === 0 && !shown.stdout.includes("\nmapping:") && !shown.stdout.startsWith("mapping:"),
        `the ${sample} reference example carries no mapping field`,
        shown.stdout.slice(0, 200),
      );
    }

    // An artifact authored before the removal keeps validating, and the next CLI write strips it.
    const legacySpecPath = path.join(root, ".strict-spec-driven", "specs", "legacy-mapped.yaml");
    writeFileSync(legacySpecPath, [
      "schema: strict-spec-driven/main-spec/v1",
      "schema_version: 1",
      "artifact_type: main_spec",
      "schema_file: templates/strict-spec-driven/schemas/main-spec.yaml",
      "spec:",
      "  id: legacy-mapped",
      "  title: Legacy Mapped Spec",
      "mapping:",
      "  implementation:",
      "    - src/legacy.ts",
      "  tests:",
      "    - test/legacy.test.ts",
      "requirements:",
      "  legacy-behavior:",
      "    strength: MUST",
      "    statement: The legacy behavior MUST stay observable.",
      "    scenarios:",
      "      legacy-scenario:",
      "        - GIVEN: a legacy artifact",
      "        - WHEN: it is validated",
      "        - THEN: it remains valid",
      "",
    ].join("\n"), "utf8");
    const acceptResidual = cli(["spec-edit", "legacy-mapped", "--title", "Legacy Mapped Spec"], { cwd: root });
    context.assert(
      acceptResidual.status === 0,
      "a main spec carrying a residual mapping field is accepted rather than rejected",
      acceptResidual.stdout.trim() || acceptResidual.stderr.trim(),
    );
    const strippedSpec = yaml.parseYamlFile<MainSpec>(legacySpecPath);
    context.assert(
      strippedSpec.mapping === undefined && strippedSpec.requirements["legacy-behavior"] !== undefined,
      "a CLI write strips the residual mapping field and preserves the rest of the artifact",
      JSON.stringify(Object.keys(strippedSpec)),
    );

    const legacyTechPath = path.join(root, ".strict-spec-driven", "tech", "legacy-standard.yaml");
    mkdirSync(path.dirname(legacyTechPath), { recursive: true });
    writeFileSync(legacyTechPath, [
      "schema: strict-spec-driven/main-tech/v1",
      "schema_version: 1",
      "artifact_type: main_tech",
      "schema_file: templates/strict-spec-driven/schemas/main-tech.yaml",
      "standard:",
      "  id: legacy-standard",
      "  title: Legacy Standard",
      "  category: coding",
      "mapping:",
      "  implementation:",
      "    - src/legacy.ts",
      "  enforcement:",
      "    - eslint.config.js",
      "rules:",
      "  legacy-rule:",
      "    strength: MUST",
      "    statement: Legacy code MUST stay typed.",
      "    rationale: Typed boundaries prevent drift.",
      "    enforcement:",
      "      method: review",
      "",
    ].join("\n"), "utf8");
    const acceptResidualTech = cli([
      "tech-edit", "legacy-standard", "--title", "Legacy Standard", "--category", "coding",
    ], { cwd: root });
    context.assert(
      acceptResidualTech.status === 0,
      "a technical standard carrying a residual mapping field is accepted rather than rejected",
      acceptResidualTech.stdout.trim() || acceptResidualTech.stderr.trim(),
    );
    const strippedTech = yaml.parseYamlFile<MainTech>(legacyTechPath);
    context.assert(
      strippedTech.mapping === undefined && strippedTech.rules["legacy-rule"] !== undefined,
      "a tech-edit write strips the residual mapping field and preserves the rules",
      JSON.stringify(Object.keys(strippedTech)),
    );

    // ready must no longer demand delta-spec mappings that the model no longer has.
    const change = "mapping-free-change";
    cli(["propose", change], { cwd: root });
    cli([
      "generate", change, "delta-spec", "--target-spec", "legacy-mapped",
      "--operation", "ADDED", "--requirement", "new-behavior", "--strength", "MUST",
      "--statement", "The new behavior MUST be observable.", "--scenario", "observe-new",
      "--given", "a change", "--when", "it is applied", "--then", "the behavior is observable",
    ], { cwd: root });
    const deltaPath = path.join(root, ".strict-spec-driven", "changes", change, "specs", "legacy-mapped.yaml");
    const generatedDelta = yaml.parseYamlFile<{ mapping?: unknown }>(deltaPath);
    context.assert(
      generatedDelta.mapping === undefined,
      "generate writes a delta spec with no mapping field",
      JSON.stringify(Object.keys(generatedDelta)),
    );
    const readyResult = JSON.parse(cli(["ready", change], { cwd: root }).stdout.trim()) as {
      diagnostics: Array<{ source: string; fieldPath: string }>;
    };
    context.assert(
      !readyResult.diagnostics.some((entry) => entry.source === "proposal_readiness" && entry.fieldPath === "$.mapping"),
      "ready emits no delta-spec mapping readiness diagnostic",
      JSON.stringify(readyResult.diagnostics.map((entry) => entry.fieldPath)),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * The removed mapping capability leaves three token families behind: the two deleted audit
 * commands, the deleted repair skill, and the mapping field accessors on specs and standards.
 * Each is a separate matcher so a surviving hit names which family it belongs to.
 *
 * The accessor matcher deliberately names only mapping.tests and mapping.enforcement. Those two
 * belong to main specs and technical standards alone, so any surviving use is the removed
 * capability. mapping.implementation is excluded because the retained architecture and
 * design-system artifacts still carry it, and matching it would flag live features as survivors.
 */
const REMOVED_MAPPING_TOKENS: ReadonlyArray<{ category: string; pattern: RegExp }> = [
  { category: "deleted-audit-command", pattern: /verify-(?:spec|tech)-mappings/u },
  { category: "deleted-repair-skill", pattern: /strict-spec-resync-code-mapping/u },
  { category: "removed-mapping-accessor", pattern: /mapping\.(?:tests|enforcement)/u },
];

/**
 * Migration still reads the legacy Markdown workflow, whose specs carry mapping frontmatter, so a
 * line describing that legacy input is stating live behavior rather than surviving guidance. The
 * test is what the line is about, not which file it sits in.
 */
function describesLegacyMigrationInput(line: string): boolean {
  return /\.spec-driven|legacy|frontmatter/iu.test(line);
}

/**
 * A requirement or rule that forbids the removed capability has to name it to be verifiable, so a
 * line asserting absence is proof of the removal rather than a survivor of it. This is the same
 * distinction the legacy-input predicate draws: the sweep must separate text that uses the removed
 * thing from text that is about its removal.
 */
function assertsRemoval(line: string): boolean {
  return /MUST NOT|\bno longer\b|\bnever\b|\bis absent\b|\bare absent\b|\babsent from\b|\bno (?:package|skill|governed|artifact|step|remaining)\b/iu
    .test(line);
}

/**
 * History is not rewritten by a removal, so these path prefixes record what the workflow used to
 * do and legitimately still name it. This is a predicate over categories of history, not a
 * hand-enumerated list of the files that happen to fail today.
 */
function isRemovalHistory(relativePath: string): boolean {
  return relativePath.startsWith(".strict-spec-driven/changes/archive/")
    || relativePath.startsWith(".strict-spec-driven/roadmap/archive/")
    || relativePath.startsWith(".strict-spec-driven/lessons/")
    // The milestone and its planned changes must name the capability they remove.
    || relativePath.startsWith(".strict-spec-driven/roadmap/")
    // Legacy .spec-driven/ Markdown is migration input; those artifacts carry mapping frontmatter.
    || relativePath.includes("/.spec-driven/")
    // The suite that proves the removal necessarily names what was removed.
    || relativePath === "test/suites/change-lifecycle.ts"
    || relativePath === "test/suites/spec-tech-authoring.ts";
}

/**
 * A main spec that an active change is revising states its corrected text in that change's delta
 * spec, which archive merges; the live file still shows the pre-merge wording until then. Scanning
 * it would assert a state the workflow deliberately defers, so the spec is judged through its
 * delta instead. This clears itself: once the change archives, no active delta targets the spec
 * and the live file is scanned again.
 */
function specsUnderActiveRevision(yaml: YamlModule): Set<string> {
  const specPathsById = new Map<string, string>();
  const indexPath = path.join(ROOT, ".strict-spec-driven", "specs", "INDEX.yaml");
  if (existsSync(indexPath)) {
    const index = yaml.parseYamlFile<{ specs?: Array<{ id?: string; path?: string }> }>(indexPath);
    for (const entry of index.specs ?? []) {
      if (entry.id !== undefined && entry.path !== undefined) specPathsById.set(entry.id, entry.path);
    }
  }

  const revised = new Set<string>();
  const changesRoot = path.join(ROOT, ".strict-spec-driven", "changes");
  if (!existsSync(changesRoot)) return revised;
  for (const changeName of readdirSync(changesRoot)) {
    if (changeName === "archive") continue;
    const deltaRoot = path.join(changesRoot, changeName, "specs");
    if (!existsSync(deltaRoot)) continue;
    const pending = [deltaRoot];
    while (pending.length > 0) {
      const current = pending.pop() as string;
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          pending.push(entryPath);
          continue;
        }
        if (!entry.name.endsWith(".yaml")) continue;
        const delta = yaml.parseYamlFile<{ target_spec?: string }>(entryPath);
        const targetPath = delta.target_spec === undefined ? undefined : specPathsById.get(delta.target_spec);
        if (targetPath !== undefined) revised.add(targetPath);
      }
    }
  }
  return revised;
}

export async function runMappingReferenceSweepSuite(context: TestContext): Promise<void> {
  context.section("[mapping-sweep] no live artifact references the removed mapping capability");

  // Each matcher must be observed firing on realistic input before a clean scan means anything;
  // a regex that can never match would otherwise report success over the whole repository.
  for (const { category, pattern } of REMOVED_MAPPING_TOKENS) {
    const sample = {
      "deleted-audit-command": "run strict-spec-cli verify-spec-mappings after editing",
      "deleted-repair-skill": "use /strict-spec-resync-code-mapping to repair drift",
      "removed-mapping-accessor": "keep paths in mapping.tests and mapping.enforcement",
    }[category] as string;
    context.assert(pattern.test(sample), `the ${category} matcher fires on realistic input`, sample);
  }

  context.assert(
    describesLegacyMigrationInput("a legacy spec carries `mapping.tests` in its Markdown frontmatter")
      && !describesLegacyMigrationInput("keep paths in mapping.tests and mapping.enforcement"),
    "the legacy-migration predicate separates legacy input prose from surviving authoring guidance",
  );

  context.assert(
    assertsRemoval("MUST NOT package a `resync-code-mapping` skill")
      && assertsRemoval("no skill command mapping declares verify-spec-mappings or verify-tech-mappings")
      && !assertsRemoval("run `strict-spec-cli verify-spec-mappings` once the specs are in place")
      && !assertsRemoval("keep paths in mapping.tests and mapping.enforcement"),
    "the removal-assertion predicate separates prohibitions from surviving instructions",
  );

  const accessorMatcher = REMOVED_MAPPING_TOKENS
    .find(({ category }) => category === "removed-mapping-accessor")?.pattern as RegExp;
  context.assert(
    !accessorMatcher.test("mapping.implementation = appendUnique(strings(mapping.implementation), input.component.implementation)")
      && !accessorMatcher.test("them from `components.<id>.mapping.snapshots` so `design-status` can report"),
    "the accessor matcher leaves the retained architecture and design-system mappings alone",
  );

  // The governed set is scanned from the index rather than enumerated, so a file added later is
  // covered without anyone remembering to list it.
  const yaml = await loadDistModule<YamlModule>("yaml.js");
  const underRevision = specsUnderActiveRevision(yaml);
  const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
  context.assert(tracked.status === 0, "git ls-files enumerates the governed file set");
  const governed = tracked.stdout
    .split("\0")
    .filter((entry) => entry.length > 0)
    .filter((entry) => /\.(?:ts|md|ya?ml|json)$/u.test(entry))
    .filter((entry) => !entry.startsWith("dist/"))
    .filter((entry) => !isRemovalHistory(entry))
    .filter((entry) => !underRevision.has(entry));
  context.assert(governed.length > 100, `the scan reaches the repository (${governed.length} files)`);

  const survivors: string[] = [];
  for (const relativePath of governed) {
    const text = readFileSync(path.join(ROOT, relativePath), "utf8");
    for (const { category, pattern } of REMOVED_MAPPING_TOKENS) {
      const lines = text.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] as string;
        if (!pattern.test(line)) continue;
        if (category === "removed-mapping-accessor" && describesLegacyMigrationInput(line)) continue;
        if (assertsRemoval(line)) continue;
        survivors.push(`${relativePath}:${index + 1} (${category})`);
      }
    }
  }
  context.assert(
    survivors.length === 0,
    "no governed file references a deleted mapping command, the deleted repair skill, or a mapping accessor",
    survivors.slice(0, 20).join("\n"),
  );

  // The negative case: the same scan over content that does carry the removed tokens must fail,
  // proving a clean result is evidence about the repository and not about an unfireable check.
  const negativeRoot = mkdtempSync(path.join(os.tmpdir(), "strict-mapping-sweep-negative-"));
  try {
    const planted = path.join(negativeRoot, "planted.md");
    writeFileSync(planted, "Run `strict-spec-cli verify-tech-mappings` and keep mapping.enforcement current.\n", "utf8");
    const plantedText = readFileSync(planted, "utf8");
    const firedCategories = REMOVED_MAPPING_TOKENS
      .filter(({ pattern }) => pattern.test(plantedText))
      .map(({ category }) => category);
    context.assert(
      firedCategories.includes("deleted-audit-command") && firedCategories.includes("removed-mapping-accessor"),
      "the sweep reports a surviving reference when one is planted",
      firedCategories.join(", "),
    );
  } finally {
    rmSync(negativeRoot, { recursive: true, force: true });
  }

  // The packaged skill inventory must no longer offer the deleted skill.
  context.assert(
    !existsSync(path.join(ROOT, "skills", "strict-spec-resync-code-mapping")),
    "the strict-spec-resync-code-mapping skill package is absent from the repository",
  );
  const marketplace = JSON.parse(readFileSync(path.join(ROOT, "skills", "marketplace.json"), "utf8")) as {
    skills: Array<{ name: string }>;
  };
  context.assert(
    !marketplace.skills.some((entry) => entry.name === "strict-spec-resync-code-mapping"),
    "the marketplace manifest no longer registers the deleted skill",
  );
}
