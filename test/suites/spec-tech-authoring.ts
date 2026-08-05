import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
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
  mapping: { implementation: string[]; tests: string[] };
  requirements: Record<string, { statement: string; scenarios: Record<string, unknown[]> }>;
};

type MainTech = {
  standard: { id: string; title: string; category: string };
  mapping: { implementation: string[]; enforcement: string[] };
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
        && createdSpec.mapping.implementation.length === 1
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
    ], { cwd: root }).status === 0, "spec-edit removes exact mapping and scenario entries");
    const updatedSpec = yaml.parseYamlFile<MainSpec>(specPath);
    context.assert(
      updatedSpec.mapping.implementation.length === 0
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
      "spec mapping confinement rejects Windows-style absolute paths without changing either artifact",
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
    ], { cwd: root }).status === 0, "tech-edit updates one rule and removes exact list and mapping entries");
    const updatedTech = yaml.parseYamlFile<MainTech>(techPath);
    context.assert(
      updatedTech.mapping.enforcement.length === 0
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
