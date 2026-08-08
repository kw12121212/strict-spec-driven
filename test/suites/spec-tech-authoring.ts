import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import {
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
      "spec-edit", "live-spec", "--title", "Live Spec", "--implementation", "src/live.ts",
      "--implementation", "src/live.ts", "--test", "test/live.test.ts", "--requirement", "live-behavior",
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
      "spec-edit", "live-spec", "--remove-scenario", "live-behavior:observe-live", "--remove-implementation", "src/live.ts",
    ], { cwd: root }).status === 0, "spec-edit accepts path flags as no-ops and removes exact scenario entries");
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
    const absoluteMapping = cli(["spec-edit", "live-spec", "--implementation", "C:\\outside.ts"], { cwd: root });
    context.assert(
      absoluteMapping.status !== 0
        && readFileSync(specPath, "utf8") === specBeforeMismatch
        && readFileSync(specIndexPath, "utf8") === indexBeforeMismatch,
      "spec path-flag confinement still rejects Windows-style absolute paths without changing either artifact",
    );

    const techPath = path.join(root, ".strict-spec-driven", "tech", "coding-rules.yaml");
    const techIndexPath = path.join(root, ".strict-spec-driven", "tech", "INDEX.yaml");
    const createTech = cli([
      "tech-edit", "coding-rules", "--title", "Coding Rules", "--category", "coding",
      "--implementation", "src/live.ts", "--enforcement", "test/live.test.ts", "--rule", "avoid-any",
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
      "--remove-exception", "Generated declarations may use any.", "--remove-enforcement", "test/live.test.ts",
    ], { cwd: root }).status === 0, "tech-edit updates one rule and removes exact list entries");
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
      "spec-edit", "todo-cli-authoring", "--title", "Todo CLI Authoring", "--implementation", "src/todos.ts",
      "--test", "test/todos.test.ts", "--requirement", "todo-authoring", "--strength", "MUST",
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
