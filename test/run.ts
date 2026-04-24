#!/usr/bin/env node
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "dist", "strict-spec-cli.js");
const VALIDATION_FIXTURE_ROOT = path.join(ROOT, "test", "fixtures", "validation");

type YamlModule = {
  parseYamlDocument<T>(input: string): T;
  stringifyYamlDocument(value: unknown): string;
  parseYamlFile<T>(path: string): T;
};

type ValidationDiagnostic = {
  source: string;
  artifactPath: string;
  fieldPath: string;
  message: string;
  expected?: string;
  actual?: string;
};

type ValidationModule = {
  loadBundledSchema<T extends object = Record<string, unknown>>(schemaFile: string): T;
  loadBundledSchemaByArtifactType(artifactType: string): Record<string, unknown>;
  loadBundledSchemaBySchemaId(schemaId: string): Record<string, unknown>;
  validateWithSchema(schema: object, artifact: unknown, artifactPath: string): { valid: boolean; diagnostics: ValidationDiagnostic[] };
  runDuplicateIdChecks(
    artifact: unknown,
    artifactPath: string,
    rules: Array<{ collectionPath: string; idField: string; description?: string }>,
  ): ValidationDiagnostic[];
  runReferenceChecks(
    artifact: unknown,
    artifactPath: string,
    rules: Array<{
      sourceCollectionPath: string;
      sourceField: string;
      targetCollectionPath: string;
      targetField: string;
      description?: string;
    }>,
  ): ValidationDiagnostic[];
  validateArtifact(
    schema: object,
    artifact: unknown,
    artifactPath: string,
    options?: {
      duplicateIdRules?: Array<{ collectionPath: string; idField: string; description?: string }>;
      referenceRules?: Array<{
        sourceCollectionPath: string;
        sourceField: string;
        targetCollectionPath: string;
        targetField: string;
        description?: string;
      }>;
    },
  ): { valid: boolean; diagnostics: ValidationDiagnostic[] };
};

type ScaffoldModule = {
  getBundledScaffoldPath(relativePath: string): string;
  readBundledScaffoldTemplate(relativePath: string): string;
  loadBundledScaffoldYaml<T>(relativePath: string): T;
  getRequiredBundledScaffoldAssets(): string[];
  getRequiredBundledChangeTemplateAssets(): string[];
  findMissingRequiredScaffoldAssets(): string[];
};

type SkillValidationModule = {
  validateStrictSkillPackaging(rootDir: string): {
    valid: boolean;
    diagnostics: Array<{ code: string; path: string; message: string; expected?: string; actual?: string }>;
    summary: {
      skillCount: number;
      marketplaceCount: number;
      diagnosticsCount: number;
    };
  };
};

let passed = 0;
let failed = 0;

function pass(label: string): void {
  console.log(`  PASS ${label}`);
  passed += 1;
}

function fail(label: string, details = ""): void {
  console.log(`  FAIL ${label}${details ? ` (${details})` : ""}`);
  failed += 1;
}

function section(title: string): void {
  console.log(`\n${title}`);
}

function assert(condition: boolean, label: string, details = ""): void {
  if (condition) {
    pass(label);
  } else {
    fail(label, details);
  }
}

function cli(args: string[], options?: { cwd?: string }): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("node", [CLI, ...args], { encoding: "utf8", cwd: options?.cwd });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function fixturePath(fileName: string): string {
  return path.join(VALIDATION_FIXTURE_ROOT, fileName);
}

async function loadDistModule<T>(fileName: string): Promise<T> {
  const moduleUrl = pathToFileURL(path.join(ROOT, "dist", fileName)).href;
  return (await import(moduleUrl)) as T;
}

async function main(): Promise<void> {
  section("[1] entrypoint smoke test");

  const noArgs = cli([]);
  assert(noArgs.status !== 0, "no-arg invocation exits non-zero", `got exit code ${noArgs.status}`);
  assert(
    noArgs.stderr.includes("Usage:"),
    "no-arg invocation prints usage hint to stderr",
    `stderr: ${noArgs.stderr.trim()}`,
  );

  const unknownCmd = cli(["unknown-subcommand"]);
  assert(unknownCmd.status !== 0, "unknown subcommand exits non-zero", `got exit code ${unknownCmd.status}`);
  assert(
    unknownCmd.stderr.includes("Usage:"),
    "unknown subcommand prints usage hint to stderr",
    `stderr: ${unknownCmd.stderr.trim()}`,
  );

  section("[2] strict skill packaging validation");

  const skillValidationModule = await loadDistModule<SkillValidationModule>("skills.js");
  const packageValidation = skillValidationModule.validateStrictSkillPackaging(ROOT);
  assert(packageValidation.valid, "strict skill package validation passes in repository state");
  assert(packageValidation.summary.skillCount > 0, "strict skill package validation reports non-zero skill count");
  assert(
    packageValidation.summary.skillCount === packageValidation.summary.marketplaceCount,
    "marketplace metadata count matches discovered strict skills",
  );

  const validateSkillsCli = cli(["validate-skills"], { cwd: ROOT });
  assert(validateSkillsCli.status === 0, "validate-skills CLI exits zero for valid strict skill packaging");
  const validateSkillsJson = JSON.parse(validateSkillsCli.stdout.trim());
  assert(validateSkillsJson.valid === true, "validate-skills CLI emits valid=true JSON");

  const invalidSkillsRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-validation-invalid-"));
  try {
    const invalidSkillsDir = path.join(invalidSkillsRoot, "skills", "strict-spec-demo");
    mkdirSync(invalidSkillsDir, { recursive: true });

    writeFileSync(
      path.join(invalidSkillsDir, "SKILL.md"),
      [
        "---",
        "name: strict-spec-demo",
        "description: demo",
        "metadata:",
        "  skill_id: strict_spec_demo",
        "  author: strict-spec-driven",
        "  type: agent_skill",
        "  version: 1.0.0",
        "---",
        "",
        "# strict-spec-demo",
        "",
        "## This Skill's Commands",
        "",
        "```yaml",
        "demo: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify demo",
        "```",
        "",
        "## Notes",
        "",
        "Legacy reference: .spec-driven/changes",
      ].join("\n") + "\n",
      "utf8",
    );

    writeFileSync(
      path.join(invalidSkillsRoot, "skills", "marketplace.json"),
      JSON.stringify(
        {
          schema: "strict-spec-driven/skill-marketplace/v1",
          namespace: "strict-spec-driven",
          skills: [{ name: "strict-spec-demo", family: "strict-spec" }],
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const invalidResultA = skillValidationModule.validateStrictSkillPackaging(invalidSkillsRoot);
    const invalidResultB = skillValidationModule.validateStrictSkillPackaging(invalidSkillsRoot);
    assert(!invalidResultA.valid, "strict skill package validation fails for invalid packaging state");
    assert(
      invalidResultA.diagnostics.some((diagnostic) => diagnostic.code === "skill.scripts_symlink.missing"),
      "invalid packaging reports missing scripts symlink diagnostic",
    );
    assert(
      invalidResultA.diagnostics.some((diagnostic) => diagnostic.code === "skill.reference.legacy_workflow_dir"),
      "invalid packaging reports stale legacy workflow reference diagnostic",
    );
    assert(
      JSON.stringify(invalidResultA) === JSON.stringify(invalidResultB),
      "strict skill package diagnostics are deterministic across runs",
    );
  } finally {
    rmSync(invalidSkillsRoot, { recursive: true, force: true });
  }

  const invalidCoreSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-core-skill-validation-invalid-"));
  try {
    const invalidCoreSkillDir = path.join(invalidCoreSkillRoot, "skills", "strict-spec-init");
    mkdirSync(path.join(invalidCoreSkillRoot, "dist", "scripts"), { recursive: true });
    mkdirSync(path.join(invalidCoreSkillRoot, "dist", "templates"), { recursive: true });
    mkdirSync(invalidCoreSkillDir, { recursive: true });

    symlinkSync("../../dist/scripts", path.join(invalidCoreSkillDir, "scripts"));
    symlinkSync("../../dist/templates", path.join(invalidCoreSkillDir, "templates"));

    writeFileSync(
      path.join(invalidCoreSkillDir, "SKILL.md"),
      [
        "---",
        "name: strict-spec-init",
        "description: stub",
        "metadata:",
        "  skill_id: strict_spec_init",
        "  author: strict-spec-driven",
        "  type: agent_skill",
        "  version: 1.0.0",
        "---",
        "",
        "# strict-spec-init",
        "",
        "## This Skill's Commands",
        "",
        "```yaml",
        "cli: node {{SKILL_DIR}}/scripts/strict-spec-driven.js <command>",
        "```",
        "",
        "## Prerequisites",
        "",
        "Use strict workflow artifacts under .strict-spec-driven/.",
      ].join("\n") + "\n",
      "utf8",
    );

    writeFileSync(
      path.join(invalidCoreSkillRoot, "skills", "marketplace.json"),
      JSON.stringify(
        {
          schema: "strict-spec-driven/skill-marketplace/v1",
          namespace: "strict-spec-driven",
          skills: [{ name: "strict-spec-init", family: "strict-spec" }],
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const invalidCoreResult = skillValidationModule.validateStrictSkillPackaging(invalidCoreSkillRoot);
    assert(!invalidCoreResult.valid, "strict skill package validation fails for placeholder core skill content");
    assert(
      invalidCoreResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.core.placeholder_command"),
      "placeholder core skill reports generic command placeholder diagnostic",
    );
    assert(
      invalidCoreResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.core.required_heading.missing"),
      "placeholder core skill reports missing workflow heading diagnostic",
    );
  } finally {
    rmSync(invalidCoreSkillRoot, { recursive: true, force: true });
  }

  const invalidGenericCommandSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-skill-generic-command-invalid-"));
  try {
    const invalidGenericCommandSkillDir = path.join(invalidGenericCommandSkillRoot, "skills", "strict-spec-simple-task");
    mkdirSync(path.join(invalidGenericCommandSkillRoot, "dist", "scripts"), { recursive: true });
    mkdirSync(path.join(invalidGenericCommandSkillRoot, "dist", "templates"), { recursive: true });
    mkdirSync(invalidGenericCommandSkillDir, { recursive: true });

    symlinkSync("../../dist/scripts", path.join(invalidGenericCommandSkillDir, "scripts"));
    symlinkSync("../../dist/templates", path.join(invalidGenericCommandSkillDir, "templates"));

    writeFileSync(
      path.join(invalidGenericCommandSkillDir, "SKILL.md"),
      [
        "---",
        "name: strict-spec-simple-task",
        "description: Handle a strict simple task.",
        "metadata:",
        "  skill_id: strict_spec_simple_task",
        "  author: strict-spec-driven",
        "  type: agent_skill",
        "  version: 1.0.0",
        "---",
        "",
        "You are helping the user with a strict simple task.",
        "",
        "## This Skill's Commands",
        "",
        "```yaml",
        "cli: node {{SKILL_DIR}}/scripts/strict-spec-driven.js <command>",
        "```",
        "",
        "## Prerequisites",
        "",
        "Use strict workflow artifacts under .strict-spec-driven/.",
      ].join("\n") + "\n",
      "utf8",
    );

    writeFileSync(
      path.join(invalidGenericCommandSkillRoot, "skills", "marketplace.json"),
      JSON.stringify(
        {
          schema: "strict-spec-driven/skill-marketplace/v1",
          namespace: "strict-spec-driven",
          skills: [{ name: "strict-spec-simple-task", family: "strict-spec" }],
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const invalidGenericCommandResult = skillValidationModule.validateStrictSkillPackaging(invalidGenericCommandSkillRoot);
    assert(!invalidGenericCommandResult.valid, "strict skill package validation fails for generic command placeholder in any skill");
    assert(
      invalidGenericCommandResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "skill.commands_section.command.placeholder"
          && diagnostic.path === "skills/strict-spec-simple-task/SKILL.md#commands.cli",
      ),
      "generic command placeholder reports explicit subcommand diagnostic for non-core skill",
    );
  } finally {
    rmSync(invalidGenericCommandSkillRoot, { recursive: true, force: true });
  }

  const invalidSemanticSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-core-skill-semantics-invalid-"));
  try {
    const semanticSkillNames = ["strict-spec-propose", "strict-spec-archive", "strict-spec-auto"];
    mkdirSync(path.join(invalidSemanticSkillRoot, "dist", "scripts"), { recursive: true });
    mkdirSync(path.join(invalidSemanticSkillRoot, "dist", "templates"), { recursive: true });

    for (const skillName of semanticSkillNames) {
      const skillDir = path.join(invalidSemanticSkillRoot, "skills", skillName);
      mkdirSync(skillDir, { recursive: true });
      symlinkSync("../../dist/scripts", path.join(skillDir, "scripts"));
      symlinkSync("../../dist/templates", path.join(skillDir, "templates"));
    }

    writeFileSync(
      path.join(invalidSemanticSkillRoot, "skills", "strict-spec-propose", "SKILL.md"),
      [
        "---",
        "name: strict-spec-propose",
        "description: Propose a new strict change. Scaffolds proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and strict YAML delta specs under .strict-spec-driven/changes/<name>/.",
        "metadata:",
        "  skill_id: strict_spec_propose",
        "  author: strict-spec-driven",
        "  type: agent_skill",
        "  version: 1.0.0",
        "---",
        "",
        "You are helping the user create a strict YAML change proposal under .strict-spec-driven/.",
        "",
        "## This Skill's Commands",
        "",
        "```yaml",
        "propose: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>",
        "verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>",
        "```",
        "",
        "## Prerequisites",
        "",
        "Use strict workflow artifacts under .strict-spec-driven/.",
        "",
        "## Steps",
        "",
        "1. Draft the proposal.",
        "",
        "## Rules",
        "",
        "- Keep the proposal aligned with the strict CLI.",
      ].join("\n") + "\n",
      "utf8",
    );

    writeFileSync(
      path.join(invalidSemanticSkillRoot, "skills", "strict-spec-archive", "SKILL.md"),
      [
        "---",
        "name: strict-spec-archive",
        "description: Archive a completed strict YAML change.",
        "metadata:",
        "  skill_id: strict_spec_archive",
        "  author: strict-spec-driven",
        "  type: agent_skill",
        "  version: 1.0.0",
        "---",
        "",
        "You are helping the user archive a strict YAML change under .strict-spec-driven/.",
        "",
        "## This Skill's Commands",
        "",
        "```yaml",
        "modify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]",
        "verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>",
        "verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings",
        "archive: node {{SKILL_DIR}}/scripts/strict-spec-driven.js archive <change-name>",
        "```",
        "",
        "## Prerequisites",
        "",
        "Use strict workflow artifacts under .strict-spec-driven/.",
        "",
        "## Steps",
        "",
        "1. Confirm the result.",
        "   - any change to roadmap state caused by archive",
        "",
        "## Rules",
        "",
        "- Use the strict archive command.",
      ].join("\n") + "\n",
      "utf8",
    );

    writeFileSync(
      path.join(invalidSemanticSkillRoot, "skills", "strict-spec-auto", "SKILL.md"),
      [
        "---",
        "name: strict-spec-auto",
        "description: Run the strict workflow end to end without extra confirmation unless open questions or empty-spec-impact decisions block progress.",
        "metadata:",
        "  skill_id: strict_spec_auto",
        "  author: strict-spec-driven",
        "  type: agent_skill",
        "  version: 1.0.0",
        "---",
        "",
        "You are running the strict workflow end to end for a single strict YAML change.",
        "",
        "## This Skill's Commands",
        "",
        "```yaml",
        "propose: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>",
        "apply: node {{SKILL_DIR}}/scripts/strict-spec-driven.js apply <change-name>",
        "verify: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>",
        "review: node {{SKILL_DIR}}/scripts/strict-spec-driven.js review <change-name>",
        "verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings",
        "archive: node {{SKILL_DIR}}/scripts/strict-spec-driven.js archive <change-name>",
        "```",
        "",
        "## Prerequisites",
        "",
        "Use strict workflow artifacts under .strict-spec-driven/.",
        "",
        "## Steps",
        "",
        "1. Run the workflow.",
        "2. If the change verifies and reviews cleanly, and any empty-spec-impact decision has been explicitly confirmed, archive it.",
        "",
        "## Rules",
        "",
        "- The workflow is automatic except when open questions or empty-spec-impact decisions block progress.",
      ].join("\n") + "\n",
      "utf8",
    );

    writeFileSync(
      path.join(invalidSemanticSkillRoot, "skills", "marketplace.json"),
      JSON.stringify(
        {
          schema: "strict-spec-driven/skill-marketplace/v1",
          namespace: "strict-spec-driven",
          skills: semanticSkillNames.map((name) => ({ name, family: "strict-spec" })),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const invalidSemanticResult = skillValidationModule.validateStrictSkillPackaging(invalidSemanticSkillRoot);
    assert(!invalidSemanticResult.valid, "strict skill package validation fails for misleading core skill claims");
    assert(
      invalidSemanticResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "skill.core.forbidden_snippet.present"
          && diagnostic.path === "skills/strict-spec-propose/SKILL.md",
      ),
      "misleading propose scaffold claim reports forbidden snippet diagnostic",
    );
    assert(
      invalidSemanticResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "skill.core.forbidden_snippet.present"
          && diagnostic.path === "skills/strict-spec-archive/SKILL.md",
      ),
      "misleading archive roadmap claim reports forbidden snippet diagnostic",
    );
    assert(
      invalidSemanticResult.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "skill.core.forbidden_snippet.present"
          && diagnostic.path === "skills/strict-spec-auto/SKILL.md",
      ),
      "misleading auto empty-spec-impact claim reports forbidden snippet diagnostic",
    );
  } finally {
    rmSync(invalidSemanticSkillRoot, { recursive: true, force: true });
  }

  section("[2] yaml utilities");

  const yamlModule = await loadDistModule<YamlModule>("yaml.js");
  const parsed = yamlModule.parseYamlDocument<{ service: { name: string } }>("service:\n  name: strict-spec\n");
  assert(parsed.service.name === "strict-spec", "parseYamlDocument parses YAML mapping");

  const yamlString = yamlModule.stringifyYamlDocument({ alpha: "beta" });
  assert(yamlString.includes("alpha: beta"), "stringifyYamlDocument serializes mappings");

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-"));
  const yamlPath = path.join(tempDir, "sample.yaml");
  writeFileSync(yamlPath, "value: 42\n", "utf8");
  try {
    const parsedFile = yamlModule.parseYamlFile<{ value: number }>(yamlPath);
    assert(parsedFile.value === 42, "parseYamlFile loads YAML from disk");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  const roadmapIndexExample = yamlModule.parseYamlFile<{
    milestones: Array<{ id: string; title: string; path: string; status: string }>;
  }>(path.join(ROOT, "templates", "strict-spec-driven", "examples", "roadmap-index.yaml"));
  assert(
    roadmapIndexExample.milestones.length >= 1 &&
      roadmapIndexExample.milestones.every(
        (milestone) =>
          milestone.id.length > 0 &&
          milestone.title.length > 0 &&
          milestone.path.length > 0 &&
          milestone.status.length > 0,
      ),
    "primary roadmap index example stays minimal while exposing required milestone fields",
  );

  const roadmapMilestoneExample = yamlModule.parseYamlFile<{
    dependencies: string[];
    risks: string[];
    notes: string[];
    planned_changes: Array<{ id: string; depends_on: string[] }>;
  }>(path.join(ROOT, "templates", "strict-spec-driven", "examples", "roadmap-milestone.yaml"));
  assert(roadmapMilestoneExample.dependencies.length === 0, "primary roadmap milestone example keeps dependencies minimal");
  assert(roadmapMilestoneExample.risks.length === 0, "primary roadmap milestone example keeps risks minimal");
  assert(roadmapMilestoneExample.notes.length === 0, "primary roadmap milestone example keeps notes minimal");
  assert(
    roadmapMilestoneExample.planned_changes.length === 1 &&
      roadmapMilestoneExample.planned_changes[0]?.depends_on.length === 0,
    "primary roadmap milestone example keeps planned change dependencies minimal",
  );

  const roadmapIndexOrderingExample = yamlModule.parseYamlFile<{
    milestones: Array<{ id: string; title: string; path: string; status: string }>;
  }>(path.join(ROOT, "templates", "strict-spec-driven", "examples", "roadmap-index.ordering.yaml"));
  const roadmapIndexOrderingText = readFileSync(
    path.join(ROOT, "templates", "strict-spec-driven", "examples", "roadmap-index.ordering.yaml"),
    "utf8",
  );
  const roadmapIndexDeclaredOrder = Array.from(roadmapIndexOrderingText.matchAll(/^\s*-\s+id:\s+(.+)\s*$/gm)).map((match) => match[1]);
  assert(roadmapIndexOrderingExample.milestones.length >= 2, "roadmap index coverage example includes multiple milestones");
  assert(
    roadmapIndexOrderingExample.milestones.every(
      (milestone) =>
        milestone.id.length > 0 &&
        milestone.title.length > 0 &&
        milestone.path.length > 0 &&
        milestone.status.length > 0,
    ),
    "roadmap index coverage example demonstrates ordered milestone entries",
  );

  const roadmapMilestonePlanningExample = yamlModule.parseYamlFile<{
    status: string;
    dependencies: string[];
    risks: string[];
    notes: string[];
    planned_changes: Array<{ id: string; status: string; depends_on: string[] }>;
  }>(path.join(ROOT, "templates", "strict-spec-driven", "examples", "roadmap-milestone.planning.yaml"));
  assert(roadmapMilestonePlanningExample.dependencies.length >= 1, "roadmap milestone coverage example includes milestone dependencies");
  assert(roadmapMilestonePlanningExample.risks.length >= 1, "roadmap milestone coverage example includes milestone risks");
  assert(roadmapMilestonePlanningExample.notes.length >= 1, "roadmap milestone coverage example includes milestone notes");
  assert(roadmapMilestonePlanningExample.planned_changes.length >= 2, "roadmap milestone coverage example includes multiple planned changes");
  assert(
    roadmapMilestonePlanningExample.planned_changes[1]?.depends_on[0] === roadmapMilestonePlanningExample.planned_changes[0]?.id,
    "roadmap milestone coverage example preserves planned change dependency linkage",
  );

  section("[3] validation layer utilities");

  const validationModule = await loadDistModule<ValidationModule>("validation.js");
  const registrySchema = validationModule.loadBundledSchema<Record<string, unknown>>("registry.yaml");
  assert(registrySchema.artifact_type === "schema_registry", "loadBundledSchema reads bundled schema assets");

  const mainSpecSchema = validationModule.loadBundledSchemaByArtifactType("main_spec");
  assert(mainSpecSchema.artifact_type === "main_spec", "loadBundledSchemaByArtifactType resolves registry entries");

  const bySchemaId = validationModule.loadBundledSchemaBySchemaId("strict-spec-driven/main-spec/v1");
  assert(bySchemaId.artifact_type === "main_spec", "loadBundledSchemaBySchemaId resolves schema IDs");

  const roadmapIndexSchema = validationModule.loadBundledSchemaByArtifactType("roadmap_index") as {
    artifact_type: string;
    fields: {
      milestones: {
        unique_by: string;
        items: {
          fields: {
            status: {
              enum: string[];
            };
          };
        };
      };
    };
  };
  assert(roadmapIndexSchema.artifact_type === "roadmap_index", "roadmap index schema resolves by artifact type");
  assert(
    roadmapIndexSchema.fields.milestones.unique_by === "id",
    "roadmap index schema keeps milestone uniqueness keyed by id",
  );

  const roadmapMilestoneSchema = validationModule.loadBundledSchemaBySchemaId("strict-spec-driven/roadmap-milestone/v1") as {
    artifact_type: string;
    fields: {
      milestone: {
        fields: {
          id: {
            type: string;
          };
        };
      };
      planned_changes: {
        items: {
          type: string;
        };
      };
      status: {
        enum: string[];
      };
    };
  };
  assert(roadmapMilestoneSchema.artifact_type === "roadmap_milestone", "roadmap milestone schema resolves by schema ID");
  assert(
    roadmapMilestoneSchema.fields.milestone.fields.id.type === "string",
    "roadmap milestone schema keeps milestone ids as structured string fields",
  );
  assert(
    roadmapMilestoneSchema.fields.planned_changes.items.type === "planned_change_entry",
    "roadmap milestone schema keeps planned changes typed as planned change entries",
  );
  const plannedChangeSchema = validationModule.loadBundledSchemaByArtifactType("planned_change_entry") as {
    artifact_type: string;
    fields: {
      status: {
        enum: string[];
      };
    };
  };
  assert(plannedChangeSchema.artifact_type === "planned_change_entry", "planned change schema resolves by artifact type");
  assert(
    roadmapIndexDeclaredOrder.length >= 2 &&
      roadmapIndexOrderingExample.milestones[0]?.id === roadmapIndexDeclaredOrder[0] &&
      roadmapIndexOrderingExample.milestones[1]?.id === roadmapIndexDeclaredOrder[1],
    "roadmap index coverage example preserves the declared milestone order",
  );
  assert(
    roadmapIndexOrderingExample.milestones.every((milestone) =>
      roadmapIndexSchema.fields.milestones.items.fields.status.enum.includes(milestone.status),
    ),
    "roadmap index coverage example statuses stay within roadmap schema enums",
  );
  assert(
    roadmapMilestoneSchema.fields.status.enum.includes(roadmapMilestonePlanningExample.status),
    "roadmap milestone coverage example status stays within roadmap schema enums",
  );
  assert(
    roadmapMilestonePlanningExample.planned_changes.every((plannedChange) =>
      plannedChangeSchema.fields.status.enum.includes(plannedChange.status),
    ),
    "roadmap milestone coverage example planned change statuses stay within planned change schema enums",
  );
  assert(
    roadmapMilestonePlanningExample.planned_changes[1]?.depends_on[0] === roadmapMilestonePlanningExample.planned_changes[0]?.id,
    "roadmap milestone coverage example preserves planned change dependency linkage",
  );
  assert(
    roadmapMilestonePlanningExample.dependencies.length >= 1,
    "roadmap milestone coverage example keeps milestone dependency fields populated",
  );

  const testJsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: { type: "string" },
    },
  };
  const invalidArtifact = { name: 123, extra: true };
  const schemaResultA = validationModule.validateWithSchema(testJsonSchema, invalidArtifact, "memory://artifact");
  const schemaResultB = validationModule.validateWithSchema(testJsonSchema, invalidArtifact, "memory://artifact");

  assert(schemaResultA.valid === false, "validateWithSchema reports invalid artifacts");
  assert(
    JSON.stringify(schemaResultA.diagnostics) === JSON.stringify(schemaResultB.diagnostics),
    "validateWithSchema diagnostics are deterministic",
  );
  assert(
    schemaResultA.diagnostics.every((diagnostic) => diagnostic.artifactPath === "memory://artifact"),
    "schema diagnostics include artifact path context",
  );
  assert(
    schemaResultA.diagnostics.some((diagnostic) => diagnostic.fieldPath === "$.name"),
    "schema diagnostics include field path context",
  );
  assert(
    schemaResultA.diagnostics.some(
      (diagnostic) => diagnostic.source === "schema" && Boolean(diagnostic.expected) && Boolean(diagnostic.actual),
    ),
    "schema diagnostics include expected/actual values when available",
  );

  const duplicateDiagnostics = validationModule.runDuplicateIdChecks(
    { requirements: [{ id: "req-1" }, { id: "req-1" }] },
    "memory://duplicate",
    [{ collectionPath: "requirements", idField: "id" }],
  );
  assert(duplicateDiagnostics.length === 1, "runDuplicateIdChecks detects duplicate identifiers");
  assert(
    duplicateDiagnostics[0]?.fieldPath === "$.requirements[1].id",
    "duplicate diagnostics include duplicate field path",
  );

  const referenceDiagnostics = validationModule.runReferenceChecks(
    {
      entries: [{ schema_id: "strict-spec-driven/main-spec/v1" }],
      role_mappings: [{ schema_id: "strict-spec-driven/missing/v1" }],
    },
    "memory://reference",
    [
      {
        sourceCollectionPath: "role_mappings",
        sourceField: "schema_id",
        targetCollectionPath: "entries",
        targetField: "schema_id",
      },
    ],
  );
  assert(referenceDiagnostics.length === 1, "runReferenceChecks detects missing references");
  assert(
    referenceDiagnostics[0]?.fieldPath === "$.role_mappings[0].schema_id",
    "reference diagnostics include source field path",
  );

  const combinedResult = validationModule.validateArtifact(
    testJsonSchema,
    { name: 123, requirements: [{ id: "dup" }, { id: "dup" }] },
    "memory://combined",
    {
      duplicateIdRules: [{ collectionPath: "requirements", idField: "id" }],
    },
  );
  assert(combinedResult.valid === false, "validateArtifact combines schema and duplicate checks");
  assert(
    combinedResult.diagnostics.some((diagnostic) => diagnostic.source === "duplicate_id"),
    "validateArtifact output includes duplicate diagnostics",
  );

  section("[4] scaffold template assets");

  const scaffoldModule = await loadDistModule<ScaffoldModule>("scaffold.js");
  let traversalRejected = false;
  try {
    scaffoldModule.getBundledScaffoldPath("../config.yaml");
  } catch {
    traversalRejected = true;
  }
  assert(traversalRejected, "scaffold path helper rejects parent-directory traversal");

  let absoluteRejected = false;
  try {
    scaffoldModule.getBundledScaffoldPath(path.join(ROOT, "config.yaml"));
  } catch {
    absoluteRejected = true;
  }
  assert(absoluteRejected, "scaffold path helper rejects absolute paths");

  const firstAssetList = scaffoldModule.getRequiredBundledScaffoldAssets();
  const secondAssetList = scaffoldModule.getRequiredBundledScaffoldAssets();
  assert(
    JSON.stringify(firstAssetList) === JSON.stringify(secondAssetList),
    "required scaffold asset manifest is deterministic",
  );
  assert(firstAssetList.length === 5, "required scaffold asset manifest includes five assets");
  assert(
    firstAssetList.every((asset) => asset.endsWith(".yaml") || asset.endsWith(".md")),
    "required scaffold asset manifest contains expected file types",
  );

  for (const relativeAssetPath of firstAssetList) {
    const absoluteAssetPath = scaffoldModule.getBundledScaffoldPath(relativeAssetPath);
    const exists = existsSync(absoluteAssetPath);
    assert(exists, `required scaffold asset exists (${relativeAssetPath})`);
    assert(exists ? statSync(absoluteAssetPath).isFile() : false, `required scaffold asset is a file (${relativeAssetPath})`);
    assert(
      absoluteAssetPath.split(path.sep).join("/").includes("/scaffold/"),
      `required scaffold asset lives in scaffold bundle (${relativeAssetPath})`,
      `resolved path: ${absoluteAssetPath}`,
    );
  }

  const missingAssets = scaffoldModule.findMissingRequiredScaffoldAssets();
  assert(missingAssets.length === 0, "required scaffold assets are all present");

  const scaffoldConfig = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("config.yaml");
  assert(scaffoldConfig.artifact_type === "workflow_config", "scaffold config template is loadable YAML");

  const scaffoldSpecIndex = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("specs/INDEX.yaml");
  assert(scaffoldSpecIndex.artifact_type === "spec_index", "scaffold specs index template is loadable YAML");

  const scaffoldRoadmapIndex = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("roadmap/INDEX.yaml");
  assert(scaffoldRoadmapIndex.artifact_type === "roadmap_index", "scaffold roadmap index template is loadable YAML");
  assert(Array.isArray(scaffoldRoadmapIndex.milestones), "scaffold roadmap index template includes milestone sequence field");

  const scaffoldChangeState = scaffoldModule.loadBundledScaffoldYaml<Record<string, unknown>>("changes/STATE.yaml");
  assert(scaffoldChangeState.artifact_type === "change_state_index", "scaffold changes state template is loadable YAML");

  const scaffoldReadme = scaffoldModule.readBundledScaffoldTemplate("specs/README.md");
  assert(scaffoldReadme.includes("# Strict Specs"), "scaffold README guidance is readable text");

  section("[5] init command");

  const initTempDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-init-"));
  try {
    mkdirSync(path.join(initTempDir, ".spec-driven"), { recursive: true });

    const initFirst = cli(["init"], { cwd: initTempDir });
    assert(initFirst.status === 0, "init exits zero when scaffold assets are available", `got exit code ${initFirst.status}`);
    assert(
      initFirst.stderr.split("\n").filter((line) => line.includes(".spec-driven/")).length === 1,
      "init emits one coexistence warning when .spec-driven exists",
      `stderr: ${initFirst.stderr.trim()}`,
    );

    const strictRoot = path.join(initTempDir, ".strict-spec-driven");
    const requiredArtifacts = [
      "config.yaml",
      "specs/INDEX.yaml",
      "roadmap/INDEX.yaml",
      "changes/STATE.yaml",
      "specs/README.md",
    ];
    for (const artifactPath of requiredArtifacts) {
      assert(
        existsSync(path.join(strictRoot, artifactPath)),
        `init creates scaffold artifact (${artifactPath})`,
      );
    }

    const configPath = path.join(strictRoot, "config.yaml");
    writeFileSync(configPath, "custom: keep-me\n", "utf8");
    unlinkSync(path.join(strictRoot, "specs", "README.md"));

    const initSecond = cli(["init"], { cwd: initTempDir });
    assert(initSecond.status === 0, "init rerun exits zero", `got exit code ${initSecond.status}`);
    assert(
      readFileSync(configPath, "utf8") === "custom: keep-me\n",
      "init rerun preserves existing strict artifacts (non-clobber)",
    );
    assert(
      existsSync(path.join(strictRoot, "specs", "README.md")),
      "init rerun creates missing scaffold artifacts without overwriting existing files",
    );
  } finally {
    rmSync(initTempDir, { recursive: true, force: true });
  }

  section("[6] propose command");

  const proposeTempDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-driven-propose-"));
  try {
    const invalidName = cli(["propose", "Invalid_Name"], { cwd: proposeTempDir });
    assert(invalidName.status !== 0, "propose rejects invalid change names", `got exit code ${invalidName.status}`);
    assert(
      invalidName.stderr.includes("kebab-case"),
      "propose invalid-name failure reports kebab-case requirement",
      `stderr: ${invalidName.stderr.trim()}`,
    );
    assert(
      !existsSync(path.join(proposeTempDir, ".strict-spec-driven", "changes", "Invalid_Name")),
      "propose invalid-name failure does not create change directory",
    );

    const changeName = "add-propose-command";
    const firstPropose = cli(["propose", changeName], { cwd: proposeTempDir });
    assert(firstPropose.status === 0, "propose creates strict change scaffold", `got exit code ${firstPropose.status}`);

    const changeDir = path.join(proposeTempDir, ".strict-spec-driven", "changes", changeName);
    assert(existsSync(changeDir), "propose creates change directory");

    const expectedArtifacts = ["proposal.yaml", "design.yaml", "tasks.yaml", "questions.yaml"];
    for (const artifact of expectedArtifacts) {
      assert(
        existsSync(path.join(changeDir, artifact)),
        `propose creates planning artifact (${artifact})`,
      );
    }
    assert(existsSync(path.join(changeDir, "specs")), "propose creates specs directory");
    assert(
      firstPropose.stdout.includes(`Created strict change scaffold at .strict-spec-driven/changes/${changeName}/`),
      "propose output identifies created change directory",
      `stdout: ${firstPropose.stdout.trim()}`,
    );
    for (const artifact of [...expectedArtifacts, "specs/"]) {
      assert(
        firstPropose.stdout.includes(`- .strict-spec-driven/changes/${changeName}/${artifact}`),
        `propose output lists created path (.strict-spec-driven/changes/${changeName}/${artifact})`,
      );
    }

    const proposalArtifact = readFileSync(path.join(changeDir, "proposal.yaml"), "utf8");
    assert(
      proposalArtifact.includes(`id: ${changeName}`),
      "propose template placeholders are rendered with change name",
    );

    const duplicatePropose = cli(["propose", changeName], { cwd: proposeTempDir });
    assert(duplicatePropose.status !== 0, "propose rejects duplicate changes", `got exit code ${duplicatePropose.status}`);
    assert(
      duplicatePropose.stderr.includes("already exists"),
      "propose duplicate-change failure reports existing change collision",
      `stderr: ${duplicatePropose.stderr.trim()}`,
    );
    assert(
      readFileSync(path.join(changeDir, "proposal.yaml"), "utf8") === proposalArtifact,
      "propose duplicate-change failure preserves existing artifacts",
    );
  } finally {
    rmSync(proposeTempDir, { recursive: true, force: true });
  }

  section("[7] fixture-driven validation matrix");

  const fixtureSchema = {
    type: "object",
    additionalProperties: false,
    required: ["id", "kind", "tags"],
    properties: {
      id: { type: "string" },
      kind: { type: "string", enum: ["alpha", "beta"] },
      tags: { type: "array", minItems: 1, items: { type: "string" } },
    },
  };

  const validFixture = yamlModule.parseYamlFile<Record<string, unknown>>(fixturePath("schema-check.valid.yaml"));
  const validFixtureResult = validationModule.validateWithSchema(
    fixtureSchema,
    validFixture,
    "fixture://schema-check.valid.yaml",
  );
  assert(validFixtureResult.valid, "[M01:yaml-schema-field-contracts] fixture valid schema case passes");

  const missingRequiredFixture = yamlModule.parseYamlFile<Record<string, unknown>>(
    fixturePath("schema-check.invalid.missing-required.yaml"),
  );
  const missingRequiredResult = validationModule.validateWithSchema(
    fixtureSchema,
    missingRequiredFixture,
    "fixture://schema-check.invalid.missing-required.yaml",
  );
  assert(
    !missingRequiredResult.valid,
    "[M01:yaml-schema-field-contracts] fixture missing-required case fails schema validation",
  );
  assert(
    missingRequiredResult.diagnostics.some((diagnostic) => diagnostic.fieldPath === "$.id"),
    "[M01:yaml-schema-field-contracts] fixture missing-required diagnostics include missing field path",
  );

  const invalidEnumFixture = yamlModule.parseYamlFile<Record<string, unknown>>(fixturePath("schema-check.invalid.enum.yaml"));
  const invalidEnumResult = validationModule.validateWithSchema(
    fixtureSchema,
    invalidEnumFixture,
    "fixture://schema-check.invalid.enum.yaml",
  );
  assert(
    !invalidEnumResult.valid,
    "[M01:yaml-main-spec-requirement-model] fixture invalid-enum case fails schema validation",
  );
  assert(
    invalidEnumResult.diagnostics.some((diagnostic) => diagnostic.fieldPath === "$.kind"),
    "[M01:yaml-main-spec-requirement-model] fixture invalid-enum diagnostics include enum field path",
  );

  const invalidShapeFixture = yamlModule.parseYamlFile<unknown>(fixturePath("schema-check.invalid.shape.yaml"));
  const invalidShapeResultA = validationModule.validateWithSchema(
    fixtureSchema,
    invalidShapeFixture,
    "fixture://schema-check.invalid.shape.yaml",
  );
  const invalidShapeResultB = validationModule.validateWithSchema(
    fixtureSchema,
    invalidShapeFixture,
    "fixture://schema-check.invalid.shape.yaml",
  );
  assert(
    !invalidShapeResultA.valid,
    "[M01:deterministic-schema-validation] fixture unsupported-shape case fails schema validation",
  );
  assert(
    JSON.stringify(invalidShapeResultA.diagnostics) === JSON.stringify(invalidShapeResultB.diagnostics),
    "[M01:deterministic-schema-validation] fixture unsupported-shape diagnostics are deterministic",
  );

  let malformedRejected = false;
  try {
    yamlModule.parseYamlFile(fixturePath("schema-check.invalid.malformed.yaml"));
  } catch {
    malformedRejected = true;
  }
  assert(
    malformedRejected,
    "[M01:deterministic-schema-validation] fixture malformed-yaml case is rejected during parsing",
  );

  const validReferenceFixture = yamlModule.parseYamlFile<Record<string, unknown>>(fixturePath("reference-check.valid.yaml"));
  const validReferenceDiagnostics = validationModule.runReferenceChecks(
    validReferenceFixture,
    "fixture://reference-check.valid.yaml",
    [
      {
        sourceCollectionPath: "links",
        sourceField: "schema_id",
        targetCollectionPath: "entries",
        targetField: "schema_id",
      },
    ],
  );
  assert(
    validReferenceDiagnostics.length === 0,
    "[M01:yaml-migration-artifact-role-mapping] fixture valid-reference case produces no diagnostics",
  );

  const invalidReferenceFixture = yamlModule.parseYamlFile<Record<string, unknown>>(
    fixturePath("reference-check.invalid.missing-target.yaml"),
  );
  const invalidReferenceDiagnostics = validationModule.runReferenceChecks(
    invalidReferenceFixture,
    "fixture://reference-check.invalid.missing-target.yaml",
    [
      {
        sourceCollectionPath: "links",
        sourceField: "schema_id",
        targetCollectionPath: "entries",
        targetField: "schema_id",
      },
    ],
  );
  assert(
    invalidReferenceDiagnostics.length === 1,
    "[M01:yaml-migration-artifact-role-mapping] fixture invalid-reference case produces one diagnostic",
  );
  assert(
    invalidReferenceDiagnostics[0]?.fieldPath === "$.links[0].schema_id",
    "[M01:yaml-migration-artifact-role-mapping] fixture invalid-reference diagnostics include source field path",
  );

  const validDuplicateFixture = yamlModule.parseYamlFile<Record<string, unknown>>(
    fixturePath("duplicate-check.valid.requirement-id.yaml"),
  );
  const validDuplicateDiagnostics = validationModule.runDuplicateIdChecks(
    validDuplicateFixture,
    "fixture://duplicate-check.valid.requirement-id.yaml",
    [{ collectionPath: "requirements", idField: "id" }],
  );
  assert(
    validDuplicateDiagnostics.length === 0,
    "[M01:yaml-requirement-and-scenario-identifiers] fixture valid-duplicate-id case produces no diagnostics",
  );

  const invalidDuplicateFixture = yamlModule.parseYamlFile<Record<string, unknown>>(
    fixturePath("duplicate-check.invalid.requirement-id.yaml"),
  );
  const invalidDuplicateDiagnostics = validationModule.runDuplicateIdChecks(
    invalidDuplicateFixture,
    "fixture://duplicate-check.invalid.requirement-id.yaml",
    [{ collectionPath: "requirements", idField: "id" }],
  );
  assert(
    invalidDuplicateDiagnostics.length === 1,
    "[M01:yaml-requirement-and-scenario-identifiers] fixture duplicate-id case produces one diagnostic",
  );
  assert(
    invalidDuplicateDiagnostics[0]?.fieldPath === "$.requirements[1].id",
    "[M01:yaml-requirement-and-scenario-identifiers] fixture duplicate-id diagnostics include duplicate field path",
  );

  section("[8] bundled template assets in dist");

  const distTemplatesRoot = path.join(ROOT, "dist", "templates", "strict-spec-driven");
  const distScaffoldDir = path.join(distTemplatesRoot, "scaffold");
  const distSchemasDir = path.join(distTemplatesRoot, "schemas");

  assert(existsSync(distScaffoldDir), "dist/templates/strict-spec-driven/scaffold exists after build");
  assert(existsSync(distSchemasDir), "dist/templates/strict-spec-driven/schemas exists after build");

  for (const relativeAssetPath of scaffoldModule.getRequiredBundledScaffoldAssets()) {
    const distAssetPath = path.join(distScaffoldDir, relativeAssetPath);
    assert(existsSync(distAssetPath), `dist scaffold asset exists (${relativeAssetPath})`);
    assert(statSync(distAssetPath).isFile(), `dist scaffold asset is a file (${relativeAssetPath})`);
  }

  for (const changeAsset of scaffoldModule.getRequiredBundledChangeTemplateAssets()) {
    const distAssetPath = path.join(distScaffoldDir, changeAsset);
    assert(existsSync(distAssetPath), `dist change template asset exists (${changeAsset})`);
    assert(statSync(distAssetPath).isFile(), `dist change template asset is a file (${changeAsset})`);
  }

  const distSchemaFiles = [
    "registry.yaml",
    "main-spec.yaml",
    "delta-spec.yaml",
    "task-list.yaml",
    "question-list.yaml",
    "roadmap-index.yaml",
    "roadmap-milestone.yaml",
    "planned-change-entry.yaml",
  ];
  for (const schemaFile of distSchemaFiles) {
    const distSchemaPath = path.join(distSchemasDir, schemaFile);
    assert(existsSync(distSchemaPath), `dist schema file exists (${schemaFile})`);
    assert(statSync(distSchemaPath).isFile(), `dist schema file is a file (${schemaFile})`);
  }

  const distExampleFiles = [
    "roadmap-index.yaml",
    "roadmap-index.ordering.yaml",
    "roadmap-milestone.yaml",
    "roadmap-milestone.planning.yaml",
    "planned-change-entry.yaml",
  ];
  for (const exampleFile of distExampleFiles) {
    const distExamplePath = path.join(ROOT, "dist", "templates", "strict-spec-driven", "examples", exampleFile);
    assert(existsSync(distExamplePath), `dist example file exists (${exampleFile})`);
    assert(statSync(distExamplePath).isFile(), `dist example file is a file (${exampleFile})`);
  }

  const distRoadmapIndexExample = yamlModule.parseYamlFile<{ milestones: Array<{ id: string }> }>(
    path.join(ROOT, "dist", "templates", "strict-spec-driven", "examples", "roadmap-index.ordering.yaml"),
  );
  const distRoadmapIndexOrderingText = readFileSync(
    path.join(ROOT, "dist", "templates", "strict-spec-driven", "examples", "roadmap-index.ordering.yaml"),
    "utf8",
  );
  const distRoadmapIndexDeclaredOrder = Array.from(distRoadmapIndexOrderingText.matchAll(/^\s*-\s+id:\s+(.+)\s*$/gm)).map(
    (match) => match[1],
  );
  assert(
    distRoadmapIndexDeclaredOrder.length >= 2 &&
      distRoadmapIndexExample.milestones[0]?.id === distRoadmapIndexDeclaredOrder[0] &&
      distRoadmapIndexExample.milestones[1]?.id === distRoadmapIndexDeclaredOrder[1],
    "dist roadmap index coverage example preserves milestone ordering",
  );

  section("[9] init from dist-only environment");

  const distOnlyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-dist-only-init-"));
  try {
    const distOnlyInit = cli(["init"], { cwd: distOnlyDir });
    assert(distOnlyInit.status === 0, "init succeeds from dist-only temp directory", `got exit code ${distOnlyInit.status}`);
    const strictRoot = path.join(distOnlyDir, ".strict-spec-driven");
    assert(existsSync(strictRoot), "init from dist creates .strict-spec-driven directory");
    for (const artifact of ["config.yaml", "specs/INDEX.yaml", "roadmap/INDEX.yaml", "changes/STATE.yaml", "specs/README.md"]) {
      assert(existsSync(path.join(strictRoot, artifact)), `init from dist creates artifact (${artifact})`);
    }
  } finally {
    rmSync(distOnlyDir, { recursive: true, force: true });
  }

  section("[10] propose from dist-only environment");

  const distOnlyProposeDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-dist-only-propose-"));
  try {
    const distOnlyPropose = cli(["propose", "test-change"], { cwd: distOnlyProposeDir });
    assert(distOnlyPropose.status === 0, "propose succeeds from dist-only temp directory", `got exit code ${distOnlyPropose.status}`);
    const changeDir = path.join(distOnlyProposeDir, ".strict-spec-driven", "changes", "test-change");
    assert(existsSync(changeDir), "propose from dist creates change directory");
    for (const artifact of ["proposal.yaml", "design.yaml", "tasks.yaml", "questions.yaml"]) {
      assert(existsSync(path.join(changeDir, artifact)), `propose from dist creates artifact (${artifact})`);
    }
    assert(existsSync(path.join(changeDir, "specs")), "propose from dist creates specs directory");
  } finally {
    rmSync(distOnlyProposeDir, { recursive: true, force: true });
  }

  section("[11] apply command");

  const applyHappyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-apply-happy-"));
  try {
    mkdirSync(path.join(applyHappyDir, ".strict-spec-driven", "changes", "my-change"), { recursive: true });
    writeFileSync(
      path.join(applyHappyDir, ".strict-spec-driven", "changes", "my-change", "tasks.yaml"),
      [
        "schema: strict-spec-driven/task-list/v1",
        "sections:",
        "  - name: Implementation",
        "    tasks:",
        "      - id: task-a",
        "        text: First task",
        "        status: pending",
        "      - id: task-b",
        "        text: Second task",
        "        status: pending",
        "  - name: Testing",
        "    tasks:",
        "      - id: test-a",
        "        text: Run tests",
        "        status: pending",
        "        command: bun test/run.ts",
      ].join("\n") + "\n",
      "utf8",
    );

    const applyFirst = cli(["apply", "my-change"], { cwd: applyHappyDir });
    assert(applyFirst.status === 0, "apply exits zero when pending tasks exist", `got exit code ${applyFirst.status}`);
    const firstJson = JSON.parse(applyFirst.stdout.trim());
    assert(firstJson.sectionName === "Implementation", "apply json includes completed section name");
    assert(firstJson.taskId === "task-a", "apply json includes completed task id");
    assert(firstJson.taskText === "First task", "apply json includes completed task text");
    assert(firstJson.totalTasks === 3, "apply json includes total task count");
    assert(firstJson.remainingPending === 2, "apply json includes remaining pending count");

    const updatedContent = readFileSync(
      path.join(applyHappyDir, ".strict-spec-driven", "changes", "my-change", "tasks.yaml"),
      "utf8",
    );
    const updatedParsed = yamlModule.parseYamlDocument<{ sections: Array<{ name: string; tasks: Array<{ id: string; status: string }> }> }>(updatedContent);
    assert(
      updatedParsed.sections[0].tasks[0].status === "complete" &&
        updatedParsed.sections[0].tasks[1].status === "pending" &&
        updatedParsed.sections[1].tasks[0].status === "pending",
      "apply only modifies the first pending task status",
    );

    const applySecond = cli(["apply", "my-change"], { cwd: applyHappyDir });
    assert(applySecond.status === 0, "apply second invocation exits zero");
    const secondJson = JSON.parse(applySecond.stdout.trim());
    assert(secondJson.taskId === "task-b", "apply second invocation completes next pending task");
    assert(secondJson.remainingPending === 1, "apply second invocation reports correct remaining count");

    const applyThird = cli(["apply", "my-change"], { cwd: applyHappyDir });
    assert(applyThird.status === 0, "apply third invocation exits zero");
    const thirdJson = JSON.parse(applyThird.stdout.trim());
    assert(thirdJson.taskId === "test-a", "apply third invocation completes task from second section");
    assert(thirdJson.remainingPending === 0, "apply third invocation reports zero remaining");

    const applyAllDone = cli(["apply", "my-change"], { cwd: applyHappyDir });
    assert(applyAllDone.status !== 0, "apply rejects when all tasks complete", `got exit code ${applyAllDone.status}`);
    assert(
      applyAllDone.stderr.includes("no pending tasks"),
      "apply all-complete failure reports no pending tasks",
      `stderr: ${applyAllDone.stderr.trim()}`,
    );
  } finally {
    rmSync(applyHappyDir, { recursive: true, force: true });
  }

  const applyMissingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-apply-missing-"));
  try {
    mkdirSync(path.join(applyMissingDir, ".strict-spec-driven", "changes"), { recursive: true });
    const applyMissing = cli(["apply", "no-such-change"], { cwd: applyMissingDir });
    assert(applyMissing.status !== 0, "apply rejects missing change", `got exit code ${applyMissing.status}`);
    assert(
      applyMissing.stderr.includes("not found"),
      "apply missing-change failure reports change not found",
      `stderr: ${applyMissing.stderr.trim()}`,
    );
  } finally {
    rmSync(applyMissingDir, { recursive: true, force: true });
  }

  const applyEmptyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-apply-empty-"));
  try {
    mkdirSync(path.join(applyEmptyDir, ".strict-spec-driven", "changes", "empty-tasks"), { recursive: true });
    writeFileSync(
      path.join(applyEmptyDir, ".strict-spec-driven", "changes", "empty-tasks", "tasks.yaml"),
      "sections: []\n",
      "utf8",
    );
    const applyEmpty = cli(["apply", "empty-tasks"], { cwd: applyEmptyDir });
    assert(applyEmpty.status !== 0, "apply rejects when tasks.yaml has no sections", `got exit code ${applyEmpty.status}`);
    assert(
      applyEmpty.stderr.includes("no pending tasks"),
      "apply empty-tasks failure reports no pending tasks",
      `stderr: ${applyEmpty.stderr.trim()}`,
    );
  } finally {
    rmSync(applyEmptyDir, { recursive: true, force: true });
  }

  const applyDeterminismDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-apply-det-"));
  try {
    mkdirSync(path.join(applyDeterminismDir, ".strict-spec-driven", "changes", "det-test"), { recursive: true });
    const tasksContent = [
      "sections:",
      "  - name: Build",
      "    tasks:",
      "      - id: build",
      "        text: Build step",
      "        status: pending",
    ].join("\n") + "\n";

    for (let i = 0; i < 2; i++) {
      writeFileSync(
        path.join(applyDeterminismDir, ".strict-spec-driven", "changes", "det-test", "tasks.yaml"),
        tasksContent,
        "utf8",
      );
      const result = cli(["apply", "det-test"], { cwd: applyDeterminismDir });
      assert(result.status === 0, `apply determinism run ${i + 1} exits zero`);
      const parsed = JSON.parse(result.stdout.trim());
      assert(
        parsed.sectionName === "Build" && parsed.taskId === "build" && parsed.taskText === "Build step",
        `apply determinism run ${i + 1} output matches expected fields`,
      );
    }
  } finally {
    rmSync(applyDeterminismDir, { recursive: true, force: true });
  }

  section("[12] verify command");

  const verifyModule = await loadDistModule<{
    verifyChange(rootDir: string, changeName: string): {
      valid: boolean;
      diagnostics: Array<{ source: string; artifactPath: string; fieldPath: string; message: string; expected?: string; actual?: string }>;
      changeName: string;
      totalTasks: number;
      completeTasks: number;
      remainingPending: number;
      openQuestionCount: number;
    };
  }>("verify.js");

  // 12a: valid fully-complete change
  const verifyValidDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-valid-"));
  try {
    const vChangeDir = path.join(verifyValidDir, ".strict-spec-driven", "changes", "valid-change");
    mkdirSync(vChangeDir, { recursive: true });
    mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

    writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: valid-change",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test change",
      "  why:",
      "    - Testing",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: valid-change",
      "approach:",
      "  - Test approach",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: valid-change",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do the work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify scope",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: valid-change",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "specs", "cli.yaml"), [
      "schema: strict-spec-driven/delta-spec/v1",
      "schema_version: 1",
      "artifact_type: delta_spec",
      "schema_file: test",
      "target_spec: cli-foundation",
      "mapping:",
      "  implementation: []",
      "  tests: []",
      "operations:",
      "  ADDED:",
      "    - requirement:",
      "        id: verify-req",
      "        strength: MUST",
      "        statement: The system MUST verify.",
      "        scenarios: []",
      "  MODIFIED: []",
      "  REMOVED: []",
    ].join("\n") + "\n", "utf8");

    const validResult = verifyModule.verifyChange(verifyValidDir, "valid-change");
    assert(validResult.valid, "valid fully-complete change passes verification", `diagnostics: ${JSON.stringify(validResult.diagnostics)}`);
    assert(validResult.changeName === "valid-change", "verify result includes changeName");
    assert(validResult.totalTasks === 4, "verify result includes totalTasks", `got ${validResult.totalTasks}`);
    assert(validResult.completeTasks === 4, "verify result includes completeTasks", `got ${validResult.completeTasks}`);
    assert(validResult.remainingPending === 0, "verify result reports zero remainingPending");
    assert(validResult.openQuestionCount === 0, "verify result reports zero openQuestionCount");

    const validCli = cli(["verify", "valid-change"], { cwd: verifyValidDir });
    assert(validCli.status === 0, "verify CLI exits zero for valid change", `got ${validCli.status}`);
    const validCliJson = JSON.parse(validCli.stdout.trim());
    assert(validCliJson.valid === true, "verify CLI JSON output includes valid=true");

    // verify output is deterministic
    const validCli2 = cli(["verify", "valid-change"], { cwd: verifyValidDir });
    assert(validCli.stdout.trim() === validCli2.stdout.trim(), "verify CLI output is deterministic across runs");
  } finally {
    rmSync(verifyValidDir, { recursive: true, force: true });
  }

  // 12b: incomplete tasks
  const verifyIncompleteDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-incomplete-"));
  try {
    const vChangeDir = path.join(verifyIncompleteDir, ".strict-spec-driven", "changes", "incomplete");
    mkdirSync(vChangeDir, { recursive: true });
    mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

    writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: incomplete",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: incomplete",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: incomplete",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do the work",
      "        status: pending",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: incomplete",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    const incompleteResult = verifyModule.verifyChange(verifyIncompleteDir, "incomplete");
    assert(!incompleteResult.valid, "incomplete tasks cause verification failure");
    assert(
      incompleteResult.diagnostics.some((d) => d.source === "task_completion"),
      "incomplete tasks produce task_completion diagnostic",
    );
    assert(incompleteResult.totalTasks === 4, "incomplete change reports totalTasks=4", `got ${incompleteResult.totalTasks}`);
    assert(incompleteResult.completeTasks === 3, "incomplete change reports completeTasks=3", `got ${incompleteResult.completeTasks}`);
    assert(incompleteResult.remainingPending === 1, "incomplete change reports remainingPending=1", `got ${incompleteResult.remainingPending}`);

    const incompleteCli = cli(["verify", "incomplete"], { cwd: verifyIncompleteDir });
    assert(incompleteCli.status !== 0, "verify CLI exits non-zero for incomplete tasks", `got ${incompleteCli.status}`);
  } finally {
    rmSync(verifyIncompleteDir, { recursive: true, force: true });
  }

  // 12c: open questions
  const verifyQuestionsDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-questions-"));
  try {
    const vChangeDir = path.join(verifyQuestionsDir, ".strict-spec-driven", "changes", "open-qs");
    mkdirSync(vChangeDir, { recursive: true });
    mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

    writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: open-qs",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: open-qs",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: open-qs",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: open-qs",
      "open:",
      "        - id: q1",
      "          question: What?",
      "          context: testing",
      "          status: open",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    const qsResult = verifyModule.verifyChange(verifyQuestionsDir, "open-qs");
    assert(!qsResult.valid, "open questions cause verification failure");
    assert(
      qsResult.diagnostics.some((d) => d.source === "open_questions"),
      "open questions produce open_questions diagnostic",
    );
    assert(qsResult.openQuestionCount === 1, "verify reports openQuestionCount=1", `got ${qsResult.openQuestionCount}`);

    const qsCli = cli(["verify", "open-qs"], { cwd: verifyQuestionsDir });
    assert(qsCli.status !== 0, "verify CLI exits non-zero for open questions", `got ${qsCli.status}`);
  } finally {
    rmSync(verifyQuestionsDir, { recursive: true, force: true });
  }

  // 12d: invalid testing gates
  const verifyGatesDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-gates-"));
  try {
    const vChangeDir = path.join(verifyGatesDir, ".strict-spec-driven", "changes", "bad-gates");
    mkdirSync(vChangeDir, { recursive: true });
    mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

    writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: bad-gates",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: bad-gates",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: bad-gates",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: nonexistent-task",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: bad-gates",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    const gatesResult = verifyModule.verifyChange(verifyGatesDir, "bad-gates");
    assert(!gatesResult.valid, "invalid testing gates cause verification failure");
    assert(
      gatesResult.diagnostics.some((d) => d.source === "testing_gates"),
      "invalid testing gates produce testing_gates diagnostic",
    );
    assert(
      gatesResult.diagnostics.some((d) => d.message.includes("nonexistent-task")),
      "testing gates diagnostic names the missing task ID",
    );
  } finally {
    rmSync(verifyGatesDir, { recursive: true, force: true });
  }

  // 12e: malformed delta spec
  const verifyDeltaDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-delta-"));
  try {
    const vChangeDir = path.join(verifyDeltaDir, ".strict-spec-driven", "changes", "bad-delta");
    mkdirSync(vChangeDir, { recursive: true });
    mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

    writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: bad-delta",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: bad-delta",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: bad-delta",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: bad-delta",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    // malformed delta spec with wrong schema id
    writeFileSync(path.join(vChangeDir, "specs", "bad.yaml"), "invalid_field: true\n", "utf8");

    const deltaResult = verifyModule.verifyChange(verifyDeltaDir, "bad-delta");
    assert(!deltaResult.valid, "malformed delta spec causes verification failure");
    assert(
      deltaResult.diagnostics.some((d) => d.artifactPath.includes("specs")),
      "delta spec diagnostic references specs path",
    );
  } finally {
    rmSync(verifyDeltaDir, { recursive: true, force: true });
  }

  // 12f: exclusive target conflicts
  const verifyConflictDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-conflict-"));
  try {
    // change-a: MODIFIED req-1
    const changeADir = path.join(verifyConflictDir, ".strict-spec-driven", "changes", "change-a");
    mkdirSync(changeADir, { recursive: true });
    mkdirSync(path.join(changeADir, "specs"), { recursive: true });

    writeFileSync(path.join(changeADir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: change-a",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeADir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: change-a",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeADir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: change-a",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeADir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: change-a",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeADir, "specs", "delta.yaml"), [
      "schema: strict-spec-driven/delta-spec/v1",
      "schema_version: 1",
      "artifact_type: delta_spec",
      "schema_file: test",
      "target_spec: some-spec",
      "mapping:",
      "  implementation: []",
      "  tests: []",
      "operations:",
      "  ADDED: []",
      "  MODIFIED:",
      "    - target_requirement: req-1",
      "      replacement:",
      "        id: req-1",
      "        strength: MUST",
      "        statement: Modified version",
      "        scenarios: []",
      "  REMOVED: []",
    ].join("\n") + "\n", "utf8");

    // change-b: also MODIFIED req-1 (conflict)
    const changeBDir = path.join(verifyConflictDir, ".strict-spec-driven", "changes", "change-b");
    mkdirSync(changeBDir, { recursive: true });
    mkdirSync(path.join(changeBDir, "specs"), { recursive: true });

    writeFileSync(path.join(changeBDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: change-b",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeBDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: change-b",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeBDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: change-b",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeBDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: change-b",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(changeBDir, "specs", "delta.yaml"), [
      "schema: strict-spec-driven/delta-spec/v1",
      "schema_version: 1",
      "artifact_type: delta_spec",
      "schema_file: test",
      "target_spec: some-spec",
      "mapping:",
      "  implementation: []",
      "  tests: []",
      "operations:",
      "  ADDED: []",
      "  MODIFIED:",
      "    - target_requirement: req-1",
      "      replacement:",
      "        id: req-1",
      "        strength: MUST",
      "        statement: Other modified version",
      "        scenarios: []",
      "  REMOVED: []",
    ].join("\n") + "\n", "utf8");

    const conflictResultA = verifyModule.verifyChange(verifyConflictDir, "change-a");
    assert(!conflictResultA.valid, "exclusive target conflict causes verification failure");
    assert(
      conflictResultA.diagnostics.some((d) => d.source === "exclusive_active_target"),
      "exclusive target conflict produces exclusive_active_target diagnostic",
    );
    assert(
      conflictResultA.diagnostics.some((d) => d.message.includes("req-1")),
      "exclusive target diagnostic names conflicting requirement ID",
    );
    assert(
      conflictResultA.diagnostics.some((d) => d.message.includes("change-a") && d.message.includes("change-b")),
      "exclusive target diagnostic names both conflicting changes",
    );

    const conflictCliA = cli(["verify", "change-a"], { cwd: verifyConflictDir });
    assert(conflictCliA.status !== 0, "verify CLI exits non-zero for target conflict", `got ${conflictCliA.status}`);
  } finally {
    rmSync(verifyConflictDir, { recursive: true, force: true });
  }

  // 12g: missing change
  const verifyMissingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-missing-"));
  try {
    mkdirSync(path.join(verifyMissingDir, ".strict-spec-driven", "changes"), { recursive: true });

    const missingModule = verifyModule.verifyChange(verifyMissingDir, "no-such-change");
    assert(false, "verify missing change should throw", `got result: ${JSON.stringify(missingModule)}`);
  } catch (e) {
    assert(
      (e instanceof Error ? e.message : String(e)).includes("not found"),
      "verify missing change throws 'not found' error",
    );
  } finally {
    rmSync(verifyMissingDir, { recursive: true, force: true });
  }

  // 12h: missing change via CLI
  const verifyMissingCliDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-missingcli-"));
  try {
    mkdirSync(path.join(verifyMissingCliDir, ".strict-spec-driven", "changes"), { recursive: true });
    const missingCli = cli(["verify", "no-such-change"], { cwd: verifyMissingCliDir });
    assert(missingCli.status !== 0, "verify CLI exits non-zero for missing change", `got ${missingCli.status}`);
    assert(
      missingCli.stderr.includes("not found"),
      "verify CLI stderr reports 'not found' for missing change",
    );
  } finally {
    rmSync(verifyMissingCliDir, { recursive: true, force: true });
  }

  // 12i: verify CLI argument validation
  const verifyNoArgDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-noarg-"));
  try {
    const noArg = cli(["verify"], { cwd: verifyNoArgDir });
    assert(noArg.status !== 0, "verify without change name exits non-zero");
    assert(noArg.stderr.includes("Usage:"), "verify without change name prints usage");
  } finally {
    rmSync(verifyNoArgDir, { recursive: true, force: true });
  }

  // 12j: verify from dist-only environment
  const distOnlyVerifyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-dist-only-verify-"));
  try {
    const vChangeDir = path.join(distOnlyVerifyDir, ".strict-spec-driven", "changes", "dist-verify-test");
    mkdirSync(vChangeDir, { recursive: true });
    mkdirSync(path.join(vChangeDir, "specs"), { recursive: true });

    writeFileSync(path.join(vChangeDir, "proposal.yaml"), [
      "schema: strict-spec-driven/change-proposal/v1",
      "schema_version: 1",
      "artifact_type: change_proposal",
      "schema_file: test",
      "change:",
      "  id: dist-verify-test",
      "  status: proposed",
      "summary:",
      "  what:",
      "    - Test",
      "  why:",
      "    - Test",
      "scope:",
      "  in: []",
      "  out: []",
      "unchanged_behavior: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "design.yaml"), [
      "schema: strict-spec-driven/change-design/v1",
      "schema_version: 1",
      "artifact_type: change_design",
      "schema_file: test",
      "change: dist-verify-test",
      "approach:",
      "  - Test",
      "decisions: []",
      "alternatives: []",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "tasks.yaml"), [
      "schema: strict-spec-driven/task-list/v1",
      "schema_version: 1",
      "artifact_type: task_list",
      "schema_file: test",
      "change: dist-verify-test",
      "sections:",
      "  - name: Implementation",
      "    tasks:",
      "      - id: impl-1",
      "        text: Do work",
      "        status: complete",
      "  - name: Testing",
      "    tasks:",
      "      - id: test-build",
      "        text: Build",
      "        status: complete",
      "        command: bun run build",
      "      - id: test-unit",
      "        text: Unit tests",
      "        status: complete",
      "        command: bun test/run.ts",
      "  - name: Verification",
      "    tasks:",
      "      - id: verify-1",
      "        text: Verify",
      "        status: complete",
      "testing_gates:",
      "  validation_task: test-build",
      "  unit_test_task: test-unit",
    ].join("\n") + "\n", "utf8");

    writeFileSync(path.join(vChangeDir, "questions.yaml"), [
      "schema: strict-spec-driven/question-list/v1",
      "schema_version: 1",
      "artifact_type: question_list",
      "schema_file: test",
      "change: dist-verify-test",
      "open: []",
      "resolved: []",
    ].join("\n") + "\n", "utf8");

    const distVerifyCli = cli(["verify", "dist-verify-test"], { cwd: distOnlyVerifyDir });
    assert(distVerifyCli.status === 0, "verify succeeds from dist-only temp directory", `got ${distVerifyCli.status}`);
    const distVerifyJson = JSON.parse(distVerifyCli.stdout.trim());
    assert(distVerifyJson.valid === true, "verify from dist reports valid=true");
    assert(distVerifyJson.changeName === "dist-verify-test", "verify from dist reports correct changeName");
  } finally {
    rmSync(distOnlyVerifyDir, { recursive: true, force: true });
  }

  section("[13] archive command");

  function formatLocalDateStamp(date = new Date()): string {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function writeMainSpecArtifact(
    rootDir: string,
    relativePath: string,
    specId: string,
    title: string,
    requirements: Array<{ id: string; statement: string }>,
  ): void {
    const specPath = path.join(rootDir, ".strict-spec-driven", "specs", relativePath);
    mkdirSync(path.dirname(specPath), { recursive: true });
    writeFileSync(
      specPath,
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/main-spec/v1",
        schema_version: 1,
        artifact_type: "main_spec",
        schema_file: "test",
        spec: {
          id: specId,
          title,
        },
        mapping: {
          implementation: [],
          tests: [],
        },
        requirements: requirements.map((requirement) => ({
          id: requirement.id,
          strength: "MUST",
          statement: requirement.statement,
          scenarios: [],
        })),
      }),
      "utf8",
    );
  }

  function writeValidChangeArtifacts(
    rootDir: string,
    changeName: string,
    options: { implementationStatus?: "pending" | "complete"; openQuestion?: boolean } = {},
  ): void {
    const changeDir = path.join(rootDir, ".strict-spec-driven", "changes", changeName);
    mkdirSync(path.join(changeDir, "specs"), { recursive: true });

    writeFileSync(
      path.join(changeDir, "proposal.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/change-proposal/v1",
        schema_version: 1,
        artifact_type: "change_proposal",
        schema_file: "test",
        change: {
          id: changeName,
          status: "proposed",
        },
        summary: {
          what: ["Archive test change"],
          why: ["Archive test coverage"],
        },
        scope: {
          in: [],
          out: [],
        },
        unchanged_behavior: [],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "design.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/change-design/v1",
        schema_version: 1,
        artifact_type: "change_design",
        schema_file: "test",
        change: changeName,
        approach: ["Archive test design"],
        decisions: [],
        alternatives: [],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "tasks.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/task-list/v1",
        schema_version: 1,
        artifact_type: "task_list",
        schema_file: "test",
        change: changeName,
        sections: [
          {
            name: "Implementation",
            tasks: [
              {
                id: "impl-1",
                text: "Do work",
                status: options.implementationStatus ?? "complete",
              },
            ],
          },
          {
            name: "Testing",
            tasks: [
              {
                id: "test-build",
                text: "Build",
                status: "complete",
                command: "bun run build",
              },
              {
                id: "test-unit",
                text: "Unit tests",
                status: "complete",
                command: "bun test/run.ts",
              },
            ],
          },
          {
            name: "Verification",
            tasks: [
              {
                id: "verify-1",
                text: "Verify",
                status: "complete",
              },
            ],
          },
        ],
        testing_gates: {
          validation_task: "test-build",
          unit_test_task: "test-unit",
        },
      }),
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "questions.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/question-list/v1",
        schema_version: 1,
        artifact_type: "question_list",
        schema_file: "test",
        change: changeName,
        open: options.openQuestion
          ? [
              {
                id: "q-1",
                question: "Open question",
                context: "Archive test",
                status: "open",
              },
            ]
          : [],
        resolved: [],
      }),
      "utf8",
    );
  }

  function writeDeltaSpecArtifact(
    rootDir: string,
    changeName: string,
    fileName: string,
    targetSpec: string,
    operations: {
      ADDED?: Array<{ requirement: { id: string; strength: string; statement: string; scenarios: unknown[] } }>;
      MODIFIED?: Array<{
        target_requirement: string;
        replacement: { id: string; strength: string; statement: string; scenarios: unknown[] };
      }>;
      REMOVED?: Array<{ target_requirement: string; reason: string }>;
    },
  ): void {
    const deltaPath = path.join(rootDir, ".strict-spec-driven", "changes", changeName, "specs", fileName);
    mkdirSync(path.dirname(deltaPath), { recursive: true });
    writeFileSync(
      deltaPath,
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/delta-spec/v1",
        schema_version: 1,
        artifact_type: "delta_spec",
        schema_file: "test",
        target_spec: targetSpec,
        mapping: {
          implementation: [],
          tests: [],
        },
        operations: {
          ADDED: operations.ADDED ?? [],
          MODIFIED: operations.MODIFIED ?? [],
          REMOVED: operations.REMOVED ?? [],
        },
      }),
      "utf8",
    );
  }

  // 13a: happy path archive merge + move + index regeneration
  const archiveHappyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-happy-"));
  try {
    const changeName = "archive-happy";
    writeMainSpecArtifact(
      archiveHappyDir,
      "cli/foundation.yaml",
      "cli-foundation",
      "CLI Foundation",
      [
        { id: "req-base", statement: "Base requirement" },
        { id: "req-remove", statement: "Removed requirement" },
      ],
    );
    mkdirSync(path.join(archiveHappyDir, ".strict-spec-driven", "specs"), { recursive: true });
    writeFileSync(
      path.join(archiveHappyDir, ".strict-spec-driven", "specs", "INDEX.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/spec-index/v1",
        schema_version: 1,
        artifact_type: "spec_index",
        schema_file: "test",
        specs: [],
      }),
      "utf8",
    );
    writeValidChangeArtifacts(archiveHappyDir, changeName);
    writeDeltaSpecArtifact(archiveHappyDir, changeName, "cli.yaml", "cli-foundation", {
      ADDED: [
        {
          requirement: {
            id: "req-added",
            strength: "MUST",
            statement: "Added requirement",
            scenarios: [],
          },
        },
      ],
      MODIFIED: [
        {
          target_requirement: "req-base",
          replacement: {
            id: "req-base",
            strength: "MUST",
            statement: "Updated requirement",
            scenarios: [],
          },
        },
      ],
      REMOVED: [
        {
          target_requirement: "req-remove",
          reason: "No longer needed",
        },
      ],
    });

    const archiveResult = cli(["archive", changeName], { cwd: archiveHappyDir });
    assert(archiveResult.status === 0, "archive exits zero for a valid complete change", `got ${archiveResult.status}`);
    const archiveJson = JSON.parse(archiveResult.stdout.trim());
    assert(archiveJson.valid === true, "archive output marks valid=true");
    assert(archiveJson.mergeSummary.specsUpdated === 1, "archive merge summary reports one updated spec");
    assert(archiveJson.mergeSummary.added === 1, "archive merge summary reports ADDED count");
    assert(archiveJson.mergeSummary.modified === 1, "archive merge summary reports MODIFIED count");
    assert(archiveJson.mergeSummary.removed === 1, "archive merge summary reports REMOVED count");
    assert(
      archiveJson.mergeSummary.modifiedMissingTargetAsAdded === 0,
      "archive merge summary reports zero MODIFIED fallback additions",
    );
    assert(
      archiveJson.mergeSummary.removedMissingTargetSkipped === 0,
      "archive merge summary reports zero skipped REMOVED entries",
    );

    const expectedArchivePath = `.strict-spec-driven/changes/archive/${formatLocalDateStamp()}-${changeName}`;
    assert(
      archiveJson.archiveDestination === expectedArchivePath,
      "archive output includes deterministic archive destination path",
      `got ${archiveJson.archiveDestination}`,
    );
    assert(
      !existsSync(path.join(archiveHappyDir, ".strict-spec-driven", "changes", changeName)),
      "archive removes the active change directory",
    );
    assert(
      existsSync(path.join(archiveHappyDir, archiveJson.archiveDestination)),
      "archive moves the change into archive destination",
    );

    const mergedMainSpec = yamlModule.parseYamlFile<{ requirements: Array<{ id: string; statement: string }> }>(
      path.join(archiveHappyDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml"),
    );
    const mergedIds = mergedMainSpec.requirements.map((requirement) => requirement.id);
    assert(
      JSON.stringify(mergedIds) === JSON.stringify(["req-base", "req-added"]),
      "archive merge applies MODIFIED, ADDED, and REMOVED operations to main spec",
      `got ${JSON.stringify(mergedIds)}`,
    );
    assert(
      mergedMainSpec.requirements.find((requirement) => requirement.id === "req-base")?.statement === "Updated requirement",
      "archive MODIFIED operation replaces requirement by stable identifier",
    );

    const regeneratedIndex = yamlModule.parseYamlFile<{ specs: Array<{ id: string; path: string }> }>(
      path.join(archiveHappyDir, ".strict-spec-driven", "specs", "INDEX.yaml"),
    );
    assert(
      regeneratedIndex.specs.some(
        (entry) =>
          entry.id === "cli-foundation" &&
          entry.path === ".strict-spec-driven/specs/cli/foundation.yaml",
      ),
      "archive regenerates specs index from merged main spec state",
    );
  } finally {
    rmSync(archiveHappyDir, { recursive: true, force: true });
  }

  // 13b: invalid preconditions block archive
  const archiveBlockedDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-blocked-"));
  try {
    const changeName = "archive-blocked";
    writeMainSpecArtifact(
      archiveBlockedDir,
      "cli/foundation.yaml",
      "cli-foundation",
      "CLI Foundation",
      [{ id: "req-base", statement: "Base requirement" }],
    );
    writeValidChangeArtifacts(archiveBlockedDir, changeName, { implementationStatus: "pending" });
    writeDeltaSpecArtifact(archiveBlockedDir, changeName, "cli.yaml", "cli-foundation", {
      ADDED: [],
      MODIFIED: [],
      REMOVED: [],
    });

    const blockedResult = cli(["archive", changeName], { cwd: archiveBlockedDir });
    assert(blockedResult.status !== 0, "archive exits non-zero when change fails pre-archive verification");
    assert(
      blockedResult.stderr.includes("failed verification"),
      "archive precondition failure reports verification blocker",
      `stderr: ${blockedResult.stderr.trim()}`,
    );
    assert(
      existsSync(path.join(archiveBlockedDir, ".strict-spec-driven", "changes", changeName)),
      "archive precondition failure keeps change in active directory",
    );
  } finally {
    rmSync(archiveBlockedDir, { recursive: true, force: true });
  }

  // 13c: MODIFIED missing target falls back to ADDED
  const archiveModifiedFallbackDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-modfallback-"));
  try {
    const changeName = "archive-mod-fallback";
    writeMainSpecArtifact(
      archiveModifiedFallbackDir,
      "cli/foundation.yaml",
      "cli-foundation",
      "CLI Foundation",
      [{ id: "req-existing", statement: "Existing requirement" }],
    );
    writeValidChangeArtifacts(archiveModifiedFallbackDir, changeName);
    writeDeltaSpecArtifact(archiveModifiedFallbackDir, changeName, "cli.yaml", "cli-foundation", {
      ADDED: [],
      MODIFIED: [
        {
          target_requirement: "req-missing",
          replacement: {
            id: "req-fallback",
            strength: "MUST",
            statement: "Fallback added requirement",
            scenarios: [],
          },
        },
      ],
      REMOVED: [],
    });

    const fallbackResult = cli(["archive", changeName], { cwd: archiveModifiedFallbackDir });
    assert(fallbackResult.status === 0, "archive succeeds when MODIFIED target is missing");
    const fallbackJson = JSON.parse(fallbackResult.stdout.trim());
    assert(
      fallbackJson.mergeSummary.modifiedMissingTargetAsAdded === 1,
      "archive records MODIFIED missing-target fallback in summary",
    );
    assert(fallbackJson.mergeSummary.modified === 0, "archive reports zero direct MODIFIED replacements for fallback case");
    assert(
      Array.isArray(fallbackJson.mergedSpecs[0]?.modifiedMissingTargetAsAdded) &&
        fallbackJson.mergedSpecs[0].modifiedMissingTargetAsAdded.includes("req-missing"),
      "archive merged-spec report includes missing MODIFIED target identifier",
    );

    const mergedFallbackSpec = yamlModule.parseYamlFile<{ requirements: Array<{ id: string }> }>(
      path.join(archiveModifiedFallbackDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml"),
    );
    assert(
      mergedFallbackSpec.requirements.some((requirement) => requirement.id === "req-fallback"),
      "archive treats missing MODIFIED target replacement as ADDED requirement",
    );
  } finally {
    rmSync(archiveModifiedFallbackDir, { recursive: true, force: true });
  }

  // 13d: REMOVED missing target is skipped
  const archiveRemovedSkipDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-remskip-"));
  try {
    const changeName = "archive-remove-skip";
    writeMainSpecArtifact(
      archiveRemovedSkipDir,
      "cli/foundation.yaml",
      "cli-foundation",
      "CLI Foundation",
      [{ id: "req-existing", statement: "Existing requirement" }],
    );
    writeValidChangeArtifacts(archiveRemovedSkipDir, changeName);
    writeDeltaSpecArtifact(archiveRemovedSkipDir, changeName, "cli.yaml", "cli-foundation", {
      ADDED: [],
      MODIFIED: [],
      REMOVED: [
        {
          target_requirement: "req-ghost",
          reason: "No longer exists",
        },
      ],
    });

    const removedSkipResult = cli(["archive", changeName], { cwd: archiveRemovedSkipDir });
    assert(removedSkipResult.status === 0, "archive succeeds when REMOVED target is missing");
    const removedSkipJson = JSON.parse(removedSkipResult.stdout.trim());
    assert(removedSkipJson.mergeSummary.removed === 0, "archive reports zero direct removals for missing target");
    assert(
      removedSkipJson.mergeSummary.removedMissingTargetSkipped === 1,
      "archive records skipped REMOVED missing-target count",
    );
    assert(
      Array.isArray(removedSkipJson.mergedSpecs[0]?.removedMissingTargetSkipped) &&
        removedSkipJson.mergedSpecs[0].removedMissingTargetSkipped.includes("req-ghost"),
      "archive merged-spec report includes skipped REMOVED target identifier",
    );

    const mergedRemovedSkipSpec = yamlModule.parseYamlFile<{ requirements: Array<{ id: string }> }>(
      path.join(archiveRemovedSkipDir, ".strict-spec-driven", "specs", "cli", "foundation.yaml"),
    );
    assert(
      JSON.stringify(mergedRemovedSkipSpec.requirements.map((requirement) => requirement.id)) ===
        JSON.stringify(["req-existing"]),
      "archive keeps existing requirements unchanged when REMOVED target is missing",
    );
  } finally {
    rmSync(archiveRemovedSkipDir, { recursive: true, force: true });
  }

  // 13e: archive destination collision handling
  const archiveCollisionDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-archive-collision-"));
  try {
    const changeName = "archive-collision";
    const archiveDate = formatLocalDateStamp();
    const existingArchivePath = path.join(
      archiveCollisionDir,
      ".strict-spec-driven",
      "changes",
      "archive",
      `${archiveDate}-${changeName}`,
    );
    mkdirSync(existingArchivePath, { recursive: true });

    writeMainSpecArtifact(
      archiveCollisionDir,
      "cli/foundation.yaml",
      "cli-foundation",
      "CLI Foundation",
      [{ id: "req-existing", statement: "Existing requirement" }],
    );
    writeValidChangeArtifacts(archiveCollisionDir, changeName);
    writeDeltaSpecArtifact(archiveCollisionDir, changeName, "cli.yaml", "cli-foundation", {
      ADDED: [],
      MODIFIED: [],
      REMOVED: [],
    });

    const collisionResult = cli(["archive", changeName], { cwd: archiveCollisionDir });
    assert(collisionResult.status === 0, "archive succeeds when default archive destination already exists");
    const collisionJson = JSON.parse(collisionResult.stdout.trim());
    assert(
      collisionJson.archiveDestination.endsWith(`${archiveDate}-${changeName}-2`),
      "archive appends numeric suffix when archive destination collides",
      `got ${collisionJson.archiveDestination}`,
    );
    assert(
      existsSync(path.join(archiveCollisionDir, collisionJson.archiveDestination)),
      "archive creates suffixed archive directory when collision occurs",
    );
  } finally {
    rmSync(archiveCollisionDir, { recursive: true, force: true });
  }

  section("[14] list/modify/cancel commands");

  function writeArchivedChangeArtifacts(rootDir: string, archiveDirName: string): string {
    const archiveDir = path.join(rootDir, ".strict-spec-driven", "changes", "archive", archiveDirName);
    const archivedChangeName = archiveDirName.replace(/^\d{4}-\d{2}-\d{2}-/, "");

    mkdirSync(path.join(archiveDir, "specs", "cli"), { recursive: true });

    writeFileSync(
      path.join(archiveDir, "proposal.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/change-proposal/v1",
        schema_version: 1,
        artifact_type: "change_proposal",
        schema_file: "test",
        change: {
          id: archivedChangeName,
          status: "proposed",
        },
        summary: {
          what: ["Archived change"],
          why: ["Test coverage"],
        },
        scope: {
          in: [],
          out: [],
        },
        unchanged_behavior: [],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(archiveDir, "design.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/change-design/v1",
        schema_version: 1,
        artifact_type: "change_design",
        schema_file: "test",
        change: archivedChangeName,
        approach: ["Archived design"],
        decisions: [],
        alternatives: [],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(archiveDir, "tasks.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/task-list/v1",
        schema_version: 1,
        artifact_type: "task_list",
        schema_file: "test",
        change: archivedChangeName,
        sections: [
          {
            name: "Implementation",
            tasks: [
              {
                id: "impl-1",
                text: "Archived implementation",
                status: "complete",
              },
            ],
          },
        ],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(archiveDir, "questions.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/question-list/v1",
        schema_version: 1,
        artifact_type: "question_list",
        schema_file: "test",
        change: archivedChangeName,
        open: [],
        resolved: [],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(archiveDir, "specs", "cli", "foundation.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/delta-spec/v1",
        schema_version: 1,
        artifact_type: "delta_spec",
        schema_file: "test",
        target_spec: "cli-foundation",
        mapping: {
          implementation: [],
          tests: [],
        },
        operations: {
          ADDED: [],
          MODIFIED: [],
          REMOVED: [],
        },
      }),
      "utf8",
    );

    return archiveDir;
  }

  // 14a: list reports active statuses and archived directories
  const listHappyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-list-happy-"));
  try {
    writeValidChangeArtifacts(listHappyDir, "active-progress", { implementationStatus: "pending" });
    writeValidChangeArtifacts(listHappyDir, "active-blocked", { openQuestion: true });
    const archivedAlpha = `${formatLocalDateStamp()}-archived-alpha`;
    const archivedBeta = `${formatLocalDateStamp()}-archived-beta`;
    writeArchivedChangeArtifacts(listHappyDir, archivedAlpha);
    writeArchivedChangeArtifacts(listHappyDir, archivedBeta);

    const listResult = cli(["list"], { cwd: listHappyDir });
    assert(listResult.status === 0, "list exits zero when active/archived changes exist", `got ${listResult.status}`);
    assert(listResult.stdout.includes("Active:"), "list output includes Active section");
    assert(
      listResult.stdout.includes("active-progress    in-progress (3/4)"),
      "list output includes active change status derived from tasks",
      `stdout: ${listResult.stdout.trim()}`,
    );
    assert(
      listResult.stdout.includes("active-blocked    blocked"),
      "list output includes blocked status derived from open questions",
      `stdout: ${listResult.stdout.trim()}`,
    );
    assert(listResult.stdout.includes("Archived:"), "list output includes Archived section");
    assert(
      listResult.stdout.includes(archivedAlpha) && listResult.stdout.includes(archivedBeta),
      "list output includes archived directory names",
      `stdout: ${listResult.stdout.trim()}`,
    );
  } finally {
    rmSync(listHappyDir, { recursive: true, force: true });
  }

  // 14b: list handles empty strict changes state
  const listEmptyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-list-empty-"));
  try {
    mkdirSync(path.join(listEmptyDir, ".strict-spec-driven", "changes"), { recursive: true });
    const listEmptyResult = cli(["list"], { cwd: listEmptyDir });
    assert(listEmptyResult.status === 0, "list exits zero when no changes exist", `got ${listEmptyResult.status}`);
    assert(
      listEmptyResult.stdout.includes("No changes."),
      "list empty state reports no changes",
      `stdout: ${listEmptyResult.stdout.trim()}`,
    );
  } finally {
    rmSync(listEmptyDir, { recursive: true, force: true });
  }

  // 14c: modify with no argument lists active changes with status summaries
  const modifyListDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-modify-list-"));
  try {
    writeValidChangeArtifacts(modifyListDir, "modify-active", { implementationStatus: "pending" });
    const modifyListResult = cli(["modify"], { cwd: modifyListDir });
    assert(modifyListResult.status === 0, "modify without target exits zero", `got ${modifyListResult.status}`);
    assert(
      modifyListResult.stdout.includes("Active changes:"),
      "modify without target prints Active changes heading",
      `stdout: ${modifyListResult.stdout.trim()}`,
    );
    assert(
      modifyListResult.stdout.includes("modify-active    in-progress (3/4)"),
      "modify without target includes active change status",
      `stdout: ${modifyListResult.stdout.trim()}`,
    );
  } finally {
    rmSync(modifyListDir, { recursive: true, force: true });
  }

  // 14d: modify reports strict artifact paths for active targets
  const modifyActiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-modify-active-"));
  try {
    const changeName = "modify-artifacts";
    writeValidChangeArtifacts(modifyActiveDir, changeName);
    writeDeltaSpecArtifact(modifyActiveDir, changeName, "cli/list-modify.yaml", "cli-foundation", {
      ADDED: [],
      MODIFIED: [],
      REMOVED: [],
    });

    const modifyActiveResult = cli(["modify", changeName], { cwd: modifyActiveDir });
    assert(modifyActiveResult.status === 0, "modify active target exits zero", `got ${modifyActiveResult.status}`);
    assert(
      modifyActiveResult.stdout.includes(`.strict-spec-driven/changes/${changeName}/proposal.yaml`),
      "modify active target reports proposal artifact path",
      `stdout: ${modifyActiveResult.stdout.trim()}`,
    );
    assert(
      modifyActiveResult.stdout.includes(`.strict-spec-driven/changes/${changeName}/design.yaml`) &&
        modifyActiveResult.stdout.includes(`.strict-spec-driven/changes/${changeName}/tasks.yaml`) &&
        modifyActiveResult.stdout.includes(`.strict-spec-driven/changes/${changeName}/questions.yaml`),
      "modify active target reports planning artifact paths",
      `stdout: ${modifyActiveResult.stdout.trim()}`,
    );
    assert(
      modifyActiveResult.stdout.includes(`.strict-spec-driven/changes/${changeName}/specs/cli/list-modify.yaml`),
      "modify active target reports delta spec paths",
      `stdout: ${modifyActiveResult.stdout.trim()}`,
    );
  } finally {
    rmSync(modifyActiveDir, { recursive: true, force: true });
  }

  // 14e: modify supports archived targets by exact archive directory name
  const modifyArchiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-modify-archive-"));
  try {
    const archiveDirName = `${formatLocalDateStamp()}-modify-target`;
    writeArchivedChangeArtifacts(modifyArchiveDir, archiveDirName);

    const modifyArchivedResult = cli(["modify", archiveDirName], { cwd: modifyArchiveDir });
    assert(modifyArchivedResult.status === 0, "modify archived target exits zero for exact archive directory name");
    assert(
      modifyArchivedResult.stdout.includes(`.strict-spec-driven/changes/archive/${archiveDirName}/proposal.yaml`),
      "modify archived target reports archived planning artifact paths",
      `stdout: ${modifyArchivedResult.stdout.trim()}`,
    );
    assert(
      modifyArchivedResult.stdout.includes(`.strict-spec-driven/changes/archive/${archiveDirName}/specs/cli/foundation.yaml`),
      "modify archived target reports archived delta spec paths",
      `stdout: ${modifyArchivedResult.stdout.trim()}`,
    );
  } finally {
    rmSync(modifyArchiveDir, { recursive: true, force: true });
  }

  // 14f: modify rejects bare archived target names
  const modifyAmbiguousDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-modify-ambiguous-"));
  try {
    const archiveDirName = `${formatLocalDateStamp()}-modify-target`;
    writeArchivedChangeArtifacts(modifyAmbiguousDir, archiveDirName);

    const modifyAmbiguousResult = cli(["modify", "modify-target"], { cwd: modifyAmbiguousDir });
    assert(modifyAmbiguousResult.status !== 0, "modify rejects archived bare-name target", `got ${modifyAmbiguousResult.status}`);
    assert(
      modifyAmbiguousResult.stderr.includes("exact archive directory names"),
      "modify archived bare-name rejection explains exact archive target requirement",
      `stderr: ${modifyAmbiguousResult.stderr.trim()}`,
    );
  } finally {
    rmSync(modifyAmbiguousDir, { recursive: true, force: true });
  }

  // 14g: modify rejects missing targets
  const modifyMissingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-modify-missing-"));
  try {
    mkdirSync(path.join(modifyMissingDir, ".strict-spec-driven", "changes"), { recursive: true });
    const modifyMissingResult = cli(["modify", "does-not-exist"], { cwd: modifyMissingDir });
    assert(modifyMissingResult.status !== 0, "modify missing target exits non-zero", `got ${modifyMissingResult.status}`);
    assert(
      modifyMissingResult.stderr.includes("not found"),
      "modify missing target reports not found",
      `stderr: ${modifyMissingResult.stderr.trim()}`,
    );
  } finally {
    rmSync(modifyMissingDir, { recursive: true, force: true });
  }

  // 14h: cancel removes active changes
  const cancelActiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-cancel-active-"));
  try {
    const changeName = "cancel-me";
    writeValidChangeArtifacts(cancelActiveDir, changeName);

    const cancelActiveResult = cli(["cancel", changeName], { cwd: cancelActiveDir });
    assert(cancelActiveResult.status === 0, "cancel active change exits zero", `got ${cancelActiveResult.status}`);
    assert(
      !existsSync(path.join(cancelActiveDir, ".strict-spec-driven", "changes", changeName)),
      "cancel active change removes active directory",
    );
    assert(
      cancelActiveResult.stdout.includes(`Cancelled: .strict-spec-driven/changes/${changeName}`),
      "cancel active change confirms cancellation path",
      `stdout: ${cancelActiveResult.stdout.trim()}`,
    );
  } finally {
    rmSync(cancelActiveDir, { recursive: true, force: true });
  }

  // 14i: cancel rejects archived targets and preserves archive history
  const cancelArchiveDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-cancel-archive-"));
  try {
    const archiveDirName = `${formatLocalDateStamp()}-cancel-target`;
    const archivedPath = writeArchivedChangeArtifacts(cancelArchiveDir, archiveDirName);

    const cancelArchivedResult = cli(["cancel", archiveDirName], { cwd: cancelArchiveDir });
    assert(cancelArchivedResult.status !== 0, "cancel archived target exits non-zero", `got ${cancelArchivedResult.status}`);
    assert(
      existsSync(archivedPath),
      "cancel archived target preserves archived directory",
    );
    assert(
      cancelArchivedResult.stderr.includes("limited to active changes"),
      "cancel archived target rejection explains active-only boundary",
      `stderr: ${cancelArchivedResult.stderr.trim()}`,
    );
  } finally {
    rmSync(cancelArchiveDir, { recursive: true, force: true });
  }

  // 14j: cancel rejects missing targets
  const cancelMissingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-cancel-missing-"));
  try {
    mkdirSync(path.join(cancelMissingDir, ".strict-spec-driven", "changes"), { recursive: true });
    const cancelMissingResult = cli(["cancel", "missing-change"], { cwd: cancelMissingDir });
    assert(cancelMissingResult.status !== 0, "cancel missing target exits non-zero", `got ${cancelMissingResult.status}`);
    assert(
      cancelMissingResult.stderr.includes("not found"),
      "cancel missing target reports not found",
      `stderr: ${cancelMissingResult.stderr.trim()}`,
    );
  } finally {
    rmSync(cancelMissingDir, { recursive: true, force: true });
  }

  section("[15] verify-spec-mappings command");

  // 15a: verify-spec-mappings succeeds with complete mapping coverage and no unmapped evidence
  const verifyMappingsValidDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-mappings-valid-"));
  try {
    mkdirSync(path.join(verifyMappingsValidDir, ".spec-driven", "specs", "cli"), { recursive: true });
    mkdirSync(path.join(verifyMappingsValidDir, "src"), { recursive: true });
    mkdirSync(path.join(verifyMappingsValidDir, "test"), { recursive: true });
    writeFileSync(path.join(verifyMappingsValidDir, "src", "strict-spec-cli.ts"), "export {};\n", "utf8");
    writeFileSync(path.join(verifyMappingsValidDir, "test", "run.ts"), "export {};\n", "utf8");
    writeFileSync(path.join(verifyMappingsValidDir, "package.json"), "{\n  \"name\": \"tmp\"\n}\n", "utf8");
    writeFileSync(path.join(verifyMappingsValidDir, "tsconfig.json"), "{\n  \"compilerOptions\": {}\n}\n", "utf8");
    writeFileSync(
      path.join(verifyMappingsValidDir, ".spec-driven", "specs", "cli", "foundation.md"),
      [
        "---",
        "mapping:",
        "  implementation:",
        "    - src/strict-spec-cli.ts",
        "    - package.json",
        "    - tsconfig.json",
        "  tests:",
        "    - test/run.ts",
        "---",
        "",
        "# CLI Foundation",
        "",
        "### Requirement: sample",
      ].join("\n"),
      "utf8",
    );

    const validMappingsResult = cli(["verify-spec-mappings"], { cwd: verifyMappingsValidDir });
    assert(validMappingsResult.status === 0, "verify-spec-mappings exits zero when mapping coverage is complete");
    const validMappingsJson = JSON.parse(validMappingsResult.stdout.trim());
    assert(validMappingsJson.valid === true, "verify-spec-mappings valid output includes valid=true");
    assert(Array.isArray(validMappingsJson.diagnostics) && validMappingsJson.diagnostics.length === 0, "verify-spec-mappings emits no diagnostics when valid");
    assert(
      validMappingsJson.summary.unmappedImplementationCount === 0 && validMappingsJson.summary.unmappedTestCount === 0,
      "verify-spec-mappings summary reports zero unmapped evidence on success",
    );
  } finally {
    rmSync(verifyMappingsValidDir, { recursive: true, force: true });
  }

  // 15b: verify-spec-mappings reports missing legacy specs inputs
  const verifyMappingsMissingSpecsDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-mappings-missing-specs-"));
  try {
    const missingSpecsResult = cli(["verify-spec-mappings"], { cwd: verifyMappingsMissingSpecsDir });
    assert(missingSpecsResult.status !== 0, "verify-spec-mappings exits non-zero when .spec-driven/specs is missing");
    const missingSpecsJson = JSON.parse(missingSpecsResult.stdout.trim());
    assert(missingSpecsJson.valid === false, "verify-spec-mappings missing-input output includes valid=false");
    assert(
      missingSpecsJson.diagnostics.some(
        (diagnostic: ValidationDiagnostic) =>
          diagnostic.source === "mapping_input" &&
          diagnostic.message.includes(".spec-driven/specs"),
      ),
      "verify-spec-mappings reports mapping_input diagnostic when specs directory is missing",
    );
  } finally {
    rmSync(verifyMappingsMissingSpecsDir, { recursive: true, force: true });
  }

  // 15c: verify-spec-mappings reports mapping coverage gaps and unmapped evidence
  const verifyMappingsInvalidDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-mappings-invalid-"));
  try {
    mkdirSync(path.join(verifyMappingsInvalidDir, ".spec-driven", "specs", "cli"), { recursive: true });
    mkdirSync(path.join(verifyMappingsInvalidDir, "src"), { recursive: true });
    mkdirSync(path.join(verifyMappingsInvalidDir, "test"), { recursive: true });
    writeFileSync(path.join(verifyMappingsInvalidDir, "src", "mapped.ts"), "export {};\n", "utf8");
    writeFileSync(path.join(verifyMappingsInvalidDir, "src", "unmapped.ts"), "export {};\n", "utf8");
    writeFileSync(path.join(verifyMappingsInvalidDir, "test", "run.ts"), "export {};\n", "utf8");
    writeFileSync(path.join(verifyMappingsInvalidDir, "package.json"), "{\n  \"name\": \"tmp\"\n}\n", "utf8");
    writeFileSync(path.join(verifyMappingsInvalidDir, "tsconfig.json"), "{\n  \"compilerOptions\": {}\n}\n", "utf8");
    writeFileSync(
      path.join(verifyMappingsInvalidDir, ".spec-driven", "specs", "cli", "foundation.md"),
      [
        "---",
        "mapping:",
        "  implementation:",
        "    - src/mapped.ts",
        "  tests: []",
        "---",
        "",
        "# CLI Foundation",
      ].join("\n"),
      "utf8",
    );

    const invalidMappingsResult = cli(["verify-spec-mappings"], { cwd: verifyMappingsInvalidDir });
    assert(invalidMappingsResult.status !== 0, "verify-spec-mappings exits non-zero for coverage or unmapped diagnostics");
    const invalidMappingsJson = JSON.parse(invalidMappingsResult.stdout.trim());
    assert(invalidMappingsJson.valid === false, "verify-spec-mappings invalid output includes valid=false");
    assert(
      invalidMappingsJson.diagnostics.some(
        (diagnostic: ValidationDiagnostic) =>
          diagnostic.source === "mapping_coverage" &&
          diagnostic.fieldPath === "$.mapping.tests",
      ),
      "verify-spec-mappings reports mapping_coverage diagnostic for empty tests mapping",
    );
    assert(
      invalidMappingsJson.diagnostics.some(
        (diagnostic: ValidationDiagnostic) =>
          diagnostic.source === "unmapped_evidence" &&
          diagnostic.artifactPath === "src/unmapped.ts",
      ),
      "verify-spec-mappings reports unmapped implementation evidence diagnostics",
    );
  } finally {
    rmSync(verifyMappingsInvalidDir, { recursive: true, force: true });
  }

  // 15d: verify-spec-mappings output is deterministic for the same repository state
  const verifyMappingsDeterministicDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-mappings-deterministic-"));
  try {
    mkdirSync(path.join(verifyMappingsDeterministicDir, ".spec-driven", "specs", "contracts"), { recursive: true });
    mkdirSync(path.join(verifyMappingsDeterministicDir, "src"), { recursive: true });
    mkdirSync(path.join(verifyMappingsDeterministicDir, "test"), { recursive: true });
    writeFileSync(path.join(verifyMappingsDeterministicDir, "src", "validation.ts"), "export {};\n", "utf8");
    writeFileSync(path.join(verifyMappingsDeterministicDir, "test", "run.ts"), "export {};\n", "utf8");
    writeFileSync(path.join(verifyMappingsDeterministicDir, "package.json"), "{\n  \"name\": \"tmp\"\n}\n", "utf8");
    writeFileSync(path.join(verifyMappingsDeterministicDir, "tsconfig.json"), "{\n  \"compilerOptions\": {}\n}\n", "utf8");
    writeFileSync(
      path.join(verifyMappingsDeterministicDir, ".spec-driven", "specs", "contracts", "yaml-artifacts.md"),
      [
        "---",
        "mapping:",
        "  implementation:",
        "    - src/validation.ts",
        "    - package.json",
        "    - tsconfig.json",
        "  tests:",
        "    - test/run.ts",
        "---",
        "",
        "# Contract",
      ].join("\n"),
      "utf8",
    );

    const first = cli(["verify-spec-mappings"], { cwd: verifyMappingsDeterministicDir });
    const second = cli(["verify-spec-mappings"], { cwd: verifyMappingsDeterministicDir });
    assert(first.status === second.status, "verify-spec-mappings deterministic run has stable exit status");
    assert(first.stdout.trim() === second.stdout.trim(), "verify-spec-mappings deterministic run has stable JSON output");
  } finally {
    rmSync(verifyMappingsDeterministicDir, { recursive: true, force: true });
  }

  // 15e: verify-spec-mappings argument validation
  const verifyMappingsArgValidationDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-verify-mappings-arg-"));
  try {
    const argValidation = cli(["verify-spec-mappings", "extra-arg"], { cwd: verifyMappingsArgValidationDir });
    assert(argValidation.status !== 0, "verify-spec-mappings rejects unexpected arguments");
    assert(argValidation.stderr.includes("Usage:"), "verify-spec-mappings prints usage on invalid arguments");
  } finally {
    rmSync(verifyMappingsArgValidationDir, { recursive: true, force: true });
  }

  section("[16] review command");

  const reviewModule = await loadDistModule<{
    reviewChange(rootDir: string, changeName: string): {
      valid: boolean;
      changeName: string;
      findings: Array<{ category: string; message: string; path?: string }>;
      findingCount: number;
    };
  }>("review.js");

  // 16a: review happy path with zero findings
  const reviewHappyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-review-happy-"));
  try {
    const changeName = "review-clean";
    const changeDir = path.join(reviewHappyDir, ".strict-spec-driven", "changes", changeName);
    mkdirSync(path.join(changeDir, "specs"), { recursive: true });

    writeFileSync(
      path.join(changeDir, "proposal.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/change-proposal/v1",
        schema_version: 1,
        artifact_type: "change_proposal",
        schema_file: "test",
        change: {
          id: changeName,
          status: "proposed",
        },
        summary: {
          what: ["Review command emits deterministic advisory findings"],
          why: ["Cover review workflow behavior"],
        },
        scope: {
          in: ["review command"],
          out: ["archive behavior"],
        },
        unchanged_behavior: ["verify behavior remains unchanged"],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "design.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/change-design/v1",
        schema_version: 1,
        artifact_type: "change_design",
        schema_file: "test",
        change: changeName,
        approach: ["Run verify and derive advisory findings"],
        decisions: [],
        alternatives: [],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "tasks.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/task-list/v1",
        schema_version: 1,
        artifact_type: "task_list",
        schema_file: "test",
        change: changeName,
        sections: [
          {
            name: "Implementation",
            tasks: [{ id: "impl-1", text: "Implement review", status: "complete" }],
          },
          {
            name: "Testing",
            tasks: [
              { id: "test-build", text: "Build", status: "complete", command: "bun run build" },
              { id: "test-unit", text: "Unit tests", status: "complete", command: "bun test/run.ts" },
            ],
          },
          {
            name: "Verification",
            tasks: [{ id: "verify-1", text: "Verify scope", status: "complete" }],
          },
        ],
        testing_gates: {
          validation_task: "test-build",
          unit_test_task: "test-unit",
        },
      }),
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "questions.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/question-list/v1",
        schema_version: 1,
        artifact_type: "question_list",
        schema_file: "test",
        change: changeName,
        open: [],
        resolved: [],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "specs", "cli.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/delta-spec/v1",
        schema_version: 1,
        artifact_type: "delta_spec",
        schema_file: "test",
        target_spec: "cli-foundation",
        mapping: {
          implementation: ["src/review.ts"],
          tests: ["test/run.ts"],
        },
        operations: {
          ADDED: [
            {
              requirement: {
                id: "review-happy-req",
                strength: "MUST",
                statement: "The system MUST emit structured review findings output for changes.",
                scenarios: [{ name: "review output", steps: [] }],
              },
            },
          ],
          MODIFIED: [],
          REMOVED: [],
        },
      }),
      "utf8",
    );

    const reviewResult = reviewModule.reviewChange(reviewHappyDir, changeName);
    assert(reviewResult.valid === true, "review module marks valid=true for readable artifacts");
    assert(reviewResult.findingCount === 0, "review module reports zero findings for clean artifacts");
    assert(reviewResult.findings.length === 0, "review module returns empty findings array when clean");

    const reviewCli = cli(["review", changeName], { cwd: reviewHappyDir });
    assert(reviewCli.status === 0, "review CLI exits zero for advisory review output", `got ${reviewCli.status}`);
    const reviewCliJson = JSON.parse(reviewCli.stdout.trim());
    assert(reviewCliJson.valid === true, "review CLI output includes valid=true");
    assert(reviewCliJson.findingCount === 0, "review CLI output includes findingCount=0");

    const reviewCliDeterministic = cli(["review", changeName], { cwd: reviewHappyDir });
    assert(
      reviewCli.stdout.trim() === reviewCliDeterministic.stdout.trim(),
      "review CLI output is deterministic for identical repository state",
    );
  } finally {
    rmSync(reviewHappyDir, { recursive: true, force: true });
  }

  // 16b: review rejects missing change
  const reviewMissingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-review-missing-"));
  try {
    mkdirSync(path.join(reviewMissingDir, ".strict-spec-driven", "changes"), { recursive: true });
    const missingChangeResult = cli(["review", "missing-change"], { cwd: reviewMissingDir });
    assert(missingChangeResult.status !== 0, "review exits non-zero for missing change", `got ${missingChangeResult.status}`);
    assert(
      missingChangeResult.stderr.includes("not found"),
      "review missing-change failure reports not found",
      `stderr: ${missingChangeResult.stderr.trim()}`,
    );
  } finally {
    rmSync(reviewMissingDir, { recursive: true, force: true });
  }

  // 16c: review rejects unparseable artifact
  const reviewParseErrorDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-review-parse-"));
  try {
    const changeName = "bad-yaml";
    const changeDir = path.join(reviewParseErrorDir, ".strict-spec-driven", "changes", changeName);
    mkdirSync(path.join(changeDir, "specs"), { recursive: true });

    writeFileSync(path.join(changeDir, "proposal.yaml"), "summary: [\n", "utf8");
    writeFileSync(path.join(changeDir, "design.yaml"), "artifact_type: change_design\n", "utf8");
    writeFileSync(path.join(changeDir, "tasks.yaml"), "artifact_type: task_list\nsections: []\n", "utf8");
    writeFileSync(path.join(changeDir, "questions.yaml"), "artifact_type: question_list\nopen: []\n", "utf8");

    const parseErrorResult = cli(["review", changeName], { cwd: reviewParseErrorDir });
    assert(parseErrorResult.status !== 0, "review exits non-zero for unparseable artifacts", `got ${parseErrorResult.status}`);
    assert(
      parseErrorResult.stderr.includes("failed to parse"),
      "review parse failure reports parse error context",
      `stderr: ${parseErrorResult.stderr.trim()}`,
    );
  } finally {
    rmSync(reviewParseErrorDir, { recursive: true, force: true });
  }

  // 16d: review reports advisory findings categories
  const reviewFindingDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-review-findings-"));
  try {
    const changeName = "review-findings";
    const changeDir = path.join(reviewFindingDir, ".strict-spec-driven", "changes", changeName);
    mkdirSync(path.join(changeDir, "specs"), { recursive: true });

    writeFileSync(
      path.join(changeDir, "proposal.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/change-proposal/v1",
        schema_version: 1,
        artifact_type: "change_proposal",
        schema_file: "test",
        change: {
          id: changeName,
          status: "proposed",
        },
        summary: {
          what: ["Tiny"],
          why: ["Tiny"],
        },
        scope: {
          in: [],
          out: [],
        },
        unchanged_behavior: [],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "design.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/change-design/v1",
        schema_version: 1,
        artifact_type: "change_design",
        schema_file: "test",
        change: changeName,
        approach: ["Test"],
        decisions: [],
        alternatives: [],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "tasks.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/task-list/v1",
        schema_version: 1,
        artifact_type: "task_list",
        schema_file: "test",
        change: changeName,
        sections: [
          {
            name: "Implementation",
            tasks: [{ id: "impl-1", text: "Do work", status: "complete" }],
          },
          {
            name: "Testing",
            tasks: [
              { id: "test-build", text: "Build", status: "complete", command: "bun run build" },
              { id: "test-unit", text: "Unit tests", status: "complete", command: "bun test/run.ts" },
            ],
          },
          {
            name: "Verification",
            tasks: [{ id: "verify-1", text: "Verify", status: "complete" }],
          },
        ],
        testing_gates: {
          validation_task: "test-build",
          unit_test_task: "test-unit",
        },
      }),
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "questions.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/question-list/v1",
        schema_version: 1,
        artifact_type: "question_list",
        schema_file: "test",
        change: changeName,
        open: [],
        resolved: [],
      }),
      "utf8",
    );

    writeFileSync(
      path.join(changeDir, "specs", "cli.yaml"),
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/delta-spec/v1",
        schema_version: 1,
        artifact_type: "delta_spec",
        schema_file: "test",
        target_spec: "cli-foundation",
        mapping: {
          implementation: [],
          tests: [],
        },
        operations: {
          ADDED: [
            {
              requirement: {
                id: "review-findings-req",
                strength: "MUST",
                statement: "Short text",
                scenarios: [],
              },
            },
          ],
          MODIFIED: [],
          REMOVED: [],
        },
      }),
      "utf8",
    );

    const findingsResult = reviewModule.reviewChange(reviewFindingDir, changeName);
    assert(findingsResult.findingCount > 0, "review module emits at least one advisory finding when quality issues exist");
    assert(
      findingsResult.findings.some((finding) => finding.category === "requirement-quality"),
      "review findings include requirement-quality category",
    );
    assert(
      findingsResult.findings.some((finding) => finding.category === "mapping-coverage"),
      "review findings include mapping-coverage category",
    );
    assert(
      findingsResult.findings.some((finding) => finding.category === "proposal-clarity"),
      "review findings include proposal-clarity category",
    );
  } finally {
    rmSync(reviewFindingDir, { recursive: true, force: true });
  }

  section("[17] roadmap workflow commands");

  function writeRoadmapIndexArtifact(
    rootDir: string,
    milestones: Array<{ id: string; title: string; path: string; status: string }>,
  ): void {
    const indexPath = path.join(rootDir, ".strict-spec-driven", "roadmap", "INDEX.yaml");
    mkdirSync(path.dirname(indexPath), { recursive: true });
    writeFileSync(
      indexPath,
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/roadmap-index/v1",
        schema_version: 1,
        artifact_type: "roadmap_index",
        schema_file: "../schemas/roadmap-index.yaml",
        milestones,
      }),
      "utf8",
    );
  }

  function writeRoadmapMilestoneArtifact(
    rootDir: string,
    fileName: string,
    options: {
      id: string;
      title: string;
      goal: string;
      status: string;
      plannedChanges: Array<{ id: string; status: string; summary: string; depends_on: string[] }>;
    },
  ): void {
    const milestonePath = path.join(rootDir, ".strict-spec-driven", "roadmap", "milestones", fileName);
    mkdirSync(path.dirname(milestonePath), { recursive: true });
    writeFileSync(
      milestonePath,
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/roadmap-milestone/v1",
        schema_version: 1,
        artifact_type: "roadmap_milestone",
        schema_file: "../schemas/roadmap-milestone.yaml",
        milestone: {
          id: options.id,
          title: options.title,
        },
        goal: options.goal,
        scope: {
          in: ["Strict roadmap workflow behavior."],
          out: ["Unrelated behavior."],
        },
        done_criteria: ["The roadmap workflow is implemented and verified."],
        planned_changes: options.plannedChanges.map((plannedChange) => ({
          schema: "strict-spec-driven/planned-change-entry/v1",
          schema_version: 1,
          artifact_type: "planned_change_entry",
          schema_file: "../schemas/planned-change-entry.yaml",
          id: plannedChange.id,
          status: plannedChange.status,
          summary: plannedChange.summary,
          depends_on: plannedChange.depends_on,
        })),
        dependencies: [],
        risks: [],
        status: options.status,
        notes: [],
      }),
      "utf8",
    );
  }

  const roadmapHappyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-happy-"));
  try {
    mkdirSync(path.join(roadmapHappyDir, ".strict-spec-driven", "changes", "active-change"), { recursive: true });
    mkdirSync(
      path.join(roadmapHappyDir, ".strict-spec-driven", "changes", "archive", `${formatLocalDateStamp()}-archived-change`),
      { recursive: true },
    );

    writeRoadmapMilestoneArtifact(roadmapHappyDir, "01-roadmap.yaml", {
      id: "01-roadmap",
      title: "Roadmap Workflow",
      goal: "Keep strict roadmap state aligned with change state.",
      status: "blocked",
      plannedChanges: [
        {
          id: "active-change",
          status: "planned",
          summary: "Active work remains in progress.",
          depends_on: [],
        },
        {
          id: "archived-change",
          status: "planned",
          summary: "Archived work should reconcile to complete.",
          depends_on: ["active-change"],
        },
      ],
    });

    writeRoadmapIndexArtifact(roadmapHappyDir, [
      {
        id: "01-roadmap",
        title: "Roadmap Workflow",
        path: "roadmap/milestones/01-roadmap.yaml",
        status: "blocked",
      },
    ]);

    const roadmapStatusBefore = cli(["roadmap-status"], { cwd: roadmapHappyDir });
    assert(roadmapStatusBefore.status === 0, "roadmap-status exits zero for a structurally valid roadmap");
    const roadmapStatusBeforeJson = JSON.parse(roadmapStatusBefore.stdout.trim());
    assert(roadmapStatusBeforeJson.valid === true, "roadmap-status reports valid=true for structurally valid roadmap");
    assert(roadmapStatusBeforeJson.milestones.length === 1, "roadmap-status reports one milestone");
    assert(
      roadmapStatusBeforeJson.milestones[0].path === "roadmap/milestones/01-roadmap.yaml",
      "roadmap-status reports milestone path in roadmap order",
    );
    assert(
      roadmapStatusBeforeJson.milestones[0].declaredStatus === "blocked"
        && roadmapStatusBeforeJson.milestones[0].derivedStatus === "active",
      "roadmap-status reports declared and derived milestone statuses",
    );
    assert(
      roadmapStatusBeforeJson.milestones[0].plannedChanges[0].state === "active"
        && roadmapStatusBeforeJson.milestones[0].plannedChanges[1].state === "archived",
      "roadmap-status derives planned change state from active and archived strict changes",
    );
    assert(
      roadmapStatusBeforeJson.milestones[0].plannedChanges[1].derivedStatus === "complete",
      "roadmap-status derives archived planned changes as complete",
    );
    assert(
      roadmapStatusBeforeJson.milestones[0].mismatches.length === 1
        && roadmapStatusBeforeJson.milestones[0].plannedChanges[1].mismatches.length === 1,
      "roadmap-status reports mismatch details without failing structural validation",
    );

    const roadmapSync = cli(["roadmap-sync"], { cwd: roadmapHappyDir });
    assert(roadmapSync.status === 0, "roadmap-sync exits zero for reconcilable roadmap state", `got ${roadmapSync.status}`);
    const roadmapSyncJson = JSON.parse(roadmapSync.stdout.trim());
    assert(roadmapSyncJson.valid === true, "roadmap-sync reports valid=true after reconciliation");
    assert(
      roadmapSyncJson.updatedFiles.includes(".strict-spec-driven/roadmap/INDEX.yaml")
        && roadmapSyncJson.updatedFiles.includes(".strict-spec-driven/roadmap/milestones/01-roadmap.yaml"),
      "roadmap-sync reports updated index and milestone files",
      `updatedFiles: ${JSON.stringify(roadmapSyncJson.updatedFiles)}`,
    );

    const syncedMilestone = yamlModule.parseYamlFile<{
      status: string;
      planned_changes: Array<{ id: string; status: string }>;
    }>(path.join(roadmapHappyDir, ".strict-spec-driven", "roadmap", "milestones", "01-roadmap.yaml"));
    assert(syncedMilestone.status === "active", "roadmap-sync rewrites milestone status to derived status");
    assert(
      syncedMilestone.planned_changes[0]?.status === "planned"
        && syncedMilestone.planned_changes[1]?.status === "complete",
      "roadmap-sync rewrites planned change declared statuses from workflow state",
    );

    const syncedIndex = yamlModule.parseYamlFile<{
      milestones: Array<{ id: string; title: string; path: string; status: string }>;
    }>(path.join(roadmapHappyDir, ".strict-spec-driven", "roadmap", "INDEX.yaml"));
    assert(
      syncedIndex.milestones.length === 1
        && syncedIndex.milestones[0]?.status === "active"
        && syncedIndex.milestones[0]?.path === "roadmap/milestones/01-roadmap.yaml",
      "roadmap-sync regenerates canonical roadmap index entries from milestone state",
    );

    const roadmapStatusAfter = cli(["roadmap-status"], { cwd: roadmapHappyDir });
    assert(roadmapStatusAfter.status === 0, "roadmap-status stays zero after roadmap-sync");
    const roadmapStatusAfterJson = JSON.parse(roadmapStatusAfter.stdout.trim());
    assert(
      roadmapStatusAfterJson.milestones[0].mismatches.length === 0
        && roadmapStatusAfterJson.milestones[0].plannedChanges.every((plannedChange: { mismatches: unknown[] }) => plannedChange.mismatches.length === 0),
      "roadmap-sync clears milestone and planned change mismatch state",
    );
  } finally {
    rmSync(roadmapHappyDir, { recursive: true, force: true });
  }

  const roadmapInvalidDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-invalid-"));
  try {
    writeRoadmapIndexArtifact(roadmapInvalidDir, [
      {
        id: "01-invalid",
        title: "Invalid Milestone",
        path: "roadmap/milestones/01-invalid.yaml",
        status: "proposed",
      },
    ]);

    const invalidMilestonePath = path.join(
      roadmapInvalidDir,
      ".strict-spec-driven",
      "roadmap",
      "milestones",
      "01-invalid.yaml",
    );
    mkdirSync(path.dirname(invalidMilestonePath), { recursive: true });
    writeFileSync(
      invalidMilestonePath,
      yamlModule.stringifyYamlDocument({
        schema: "strict-spec-driven/roadmap-milestone/v1",
        schema_version: 1,
        artifact_type: "roadmap_milestone",
        schema_file: "../schemas/roadmap-milestone.yaml",
        milestone: {
          id: "01-invalid",
          title: "Invalid Milestone",
        },
        goal: "Broken milestone artifact",
        scope: {
          in: ["Test invalid roadmap artifact"],
          out: [],
        },
        done_criteria: ["Needs planned changes"],
        dependencies: [],
        risks: [],
        status: "proposed",
        notes: [],
      }),
      "utf8",
    );

    const invalidRoadmapStatus = cli(["roadmap-status"], { cwd: roadmapInvalidDir });
    assert(invalidRoadmapStatus.status !== 0, "roadmap-status exits non-zero for invalid roadmap artifacts");
    const invalidRoadmapJson = JSON.parse(invalidRoadmapStatus.stdout.trim());
    assert(invalidRoadmapJson.valid === false, "roadmap-status reports valid=false for invalid roadmap artifact");
    assert(
      invalidRoadmapJson.diagnostics.some(
        (diagnostic: { artifactPath: string; fieldPath: string }) =>
          diagnostic.artifactPath === ".strict-spec-driven/roadmap/milestones/01-invalid.yaml"
          && diagnostic.fieldPath === "$.planned_changes",
      ),
      "roadmap-status diagnostics identify the invalid artifact path and field path",
    );

    const invalidRoadmapSync = cli(["roadmap-sync"], { cwd: roadmapInvalidDir });
    assert(invalidRoadmapSync.status !== 0, "roadmap-sync exits non-zero when milestone artifacts are invalid");
  } finally {
    rmSync(roadmapInvalidDir, { recursive: true, force: true });
  }

  const invalidRoadmapSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-roadmap-skill-invalid-"));
  try {
    const invalidRoadmapSkillDir = path.join(invalidRoadmapSkillRoot, "skills", "strict-roadmap-recommend");
    mkdirSync(path.join(invalidRoadmapSkillRoot, "dist", "scripts"), { recursive: true });
    mkdirSync(path.join(invalidRoadmapSkillRoot, "dist", "templates"), { recursive: true });
    mkdirSync(invalidRoadmapSkillDir, { recursive: true });

    symlinkSync("../../dist/scripts", path.join(invalidRoadmapSkillDir, "scripts"));
    symlinkSync("../../dist/templates", path.join(invalidRoadmapSkillDir, "templates"));

    writeFileSync(
      path.join(invalidRoadmapSkillDir, "SKILL.md"),
      [
        "---",
        "name: strict-roadmap-recommend",
        "description: stub",
        "metadata:",
        "  skill_id: strict_roadmap_recommend",
        "  author: strict-spec-driven",
        "  type: agent_skill",
        "  version: 1.0.0",
        "---",
        "",
        "You are helping with roadmap work.",
        "",
        "## This Skill's Commands",
        "",
        "```yaml",
        "cli: node {{SKILL_DIR}}/scripts/strict-spec-driven.js <command>",
        "```",
        "",
        "## Prerequisites",
        "",
        "Use strict workflow artifacts.",
      ].join("\n") + "\n",
      "utf8",
    );

    writeFileSync(
      path.join(invalidRoadmapSkillRoot, "skills", "marketplace.json"),
      JSON.stringify(
        {
          schema: "strict-spec-driven/skill-marketplace/v1",
          namespace: "strict-spec-driven",
          skills: [{ name: "strict-roadmap-recommend", family: "strict-roadmap" }],
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const invalidRoadmapSkillResult = skillValidationModule.validateStrictSkillPackaging(invalidRoadmapSkillRoot);
    assert(!invalidRoadmapSkillResult.valid, "strict skill validation fails for placeholder roadmap skill content");
    assert(
      invalidRoadmapSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.roadmap.placeholder_command"),
      "placeholder roadmap skill reports roadmap-specific placeholder diagnostic",
    );
    assert(
      invalidRoadmapSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.roadmap.required_heading.missing"),
      "placeholder roadmap skill reports missing roadmap workflow heading diagnostic",
    );
    assert(
      invalidRoadmapSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.roadmap.required_snippet.missing"),
      "placeholder roadmap skill reports missing strict roadmap artifact reference diagnostic",
    );
  } finally {
    rmSync(invalidRoadmapSkillRoot, { recursive: true, force: true });
  }

  const invalidPlanningSkillRoot = mkdtempSync(path.join(os.tmpdir(), "strict-planning-skill-invalid-"));
  try {
    const invalidPlanningSkillDir = path.join(invalidPlanningSkillRoot, "skills", "strict-spec-sync-specs");
    mkdirSync(path.join(invalidPlanningSkillRoot, "dist", "scripts"), { recursive: true });
    mkdirSync(path.join(invalidPlanningSkillRoot, "dist", "templates"), { recursive: true });
    mkdirSync(invalidPlanningSkillDir, { recursive: true });

    symlinkSync("../../dist/scripts", path.join(invalidPlanningSkillDir, "scripts"));
    symlinkSync("../../dist/templates", path.join(invalidPlanningSkillDir, "templates"));

    writeFileSync(
      path.join(invalidPlanningSkillDir, "SKILL.md"),
      [
        "---",
        "name: strict-spec-sync-specs",
        "description: stub",
        "metadata:",
        "  skill_id: strict_spec_sync_specs",
        "  author: strict-spec-driven",
        "  type: agent_skill",
        "  version: 1.0.0",
        "---",
        "",
        "You are helping with strict spec syncing.",
        "",
        "## This Skill's Commands",
        "",
        "```yaml",
        "cli: node {{SKILL_DIR}}/scripts/strict-spec-driven.js <command>",
        "```",
        "",
        "## Prerequisites",
        "",
        "Use strict workflow artifacts.",
      ].join("\n") + "\n",
      "utf8",
    );

    writeFileSync(
      path.join(invalidPlanningSkillRoot, "skills", "marketplace.json"),
      JSON.stringify(
        {
          schema: "strict-spec-driven/skill-marketplace/v1",
          namespace: "strict-spec-driven",
          skills: [{ name: "strict-spec-sync-specs", family: "strict-spec" }],
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const invalidPlanningSkillResult = skillValidationModule.validateStrictSkillPackaging(invalidPlanningSkillRoot);
    assert(!invalidPlanningSkillResult.valid, "strict skill validation fails for placeholder planning skill content");
    assert(
      invalidPlanningSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.planning.placeholder_command"),
      "placeholder planning skill reports planning-specific placeholder diagnostic",
    );
    assert(
      invalidPlanningSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.planning.required_heading.missing"),
      "placeholder planning skill reports missing planning workflow heading diagnostic",
    );
    assert(
      invalidPlanningSkillResult.diagnostics.some((diagnostic) => diagnostic.code === "skill.planning.required_snippet.missing"),
      "placeholder planning skill reports missing strict planning artifact reference diagnostic",
    );
  } finally {
    rmSync(invalidPlanningSkillRoot, { recursive: true, force: true });
  }

  const roadmapCycleDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-roadmap-cycle-"));
  try {
    writeRoadmapIndexArtifact(roadmapCycleDir, [
      {
        id: "01-cycle",
        title: "Cycle Milestone",
        path: "roadmap/milestones/01-cycle.yaml",
        status: "proposed",
      },
    ]);

    writeRoadmapMilestoneArtifact(roadmapCycleDir, "01-cycle.yaml", {
      id: "01-cycle",
      title: "Cycle Milestone",
      goal: "Detect invalid dependency cycles.",
      status: "proposed",
      plannedChanges: [
        {
          id: "change-a",
          status: "planned",
          summary: "First change",
          depends_on: ["change-b"],
        },
        {
          id: "change-b",
          status: "planned",
          summary: "Second change",
          depends_on: ["change-a"],
        },
      ],
    });

    const cycleStatus = cli(["roadmap-status"], { cwd: roadmapCycleDir });
    assert(cycleStatus.status !== 0, "roadmap-status exits non-zero for cyclic planned change dependencies");
    const cycleJson = JSON.parse(cycleStatus.stdout.trim());
    assert(
      cycleJson.diagnostics.some((diagnostic: { message: string }) => diagnostic.message.includes("acyclic")),
      "roadmap-status reports a cycle diagnostic for planned change dependencies",
    );
  } finally {
    rmSync(roadmapCycleDir, { recursive: true, force: true });
  }

  section("[18] migrate command");

  function writeLegacyMigrationFixture(rootDir: string, configContent?: string): void {
    mkdirSync(path.join(rootDir, ".spec-driven", "specs"), { recursive: true });
    mkdirSync(path.join(rootDir, ".spec-driven", "roadmap"), { recursive: true });
    mkdirSync(path.join(rootDir, ".spec-driven", "changes", "demo-change"), { recursive: true });

    writeFileSync(
      path.join(rootDir, ".spec-driven", "config.yaml"),
      configContent
        ?? [
          "schema: spec-driven",
          "context: |",
          "  Demo project context for migrate tests.",
          "rules:",
          "  specs:",
          "    - Describe observable behavior only",
          "  change:",
          "    - Keep scope focused",
          "  code:",
          "    - Reuse existing helpers",
          "  test:",
          "    - Tests remain independent",
        ].join("\n") + "\n",
      "utf8",
    );
    writeFileSync(path.join(rootDir, ".spec-driven", "specs", "INDEX.md"), "# Specs Index\n", "utf8");
    writeFileSync(path.join(rootDir, ".spec-driven", "roadmap", "INDEX.md"), "# Roadmap Index\n", "utf8");
    writeFileSync(
      path.join(rootDir, ".spec-driven", "changes", "demo-change", "proposal.md"),
      "# demo-change\n",
      "utf8",
    );
  }

  const migrateHappyDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-happy-"));
  try {
    writeLegacyMigrationFixture(migrateHappyDir);
    const legacyConfigBefore = readFileSync(path.join(migrateHappyDir, ".spec-driven", "config.yaml"), "utf8");

    const migrateHappy = cli(["migrate"], { cwd: migrateHappyDir });
    assert(migrateHappy.status === 0, "migrate exits zero for valid bootstrap state");
    const migrateHappyJson = JSON.parse(migrateHappy.stdout.trim());
    assert(migrateHappyJson.valid === true, "migrate reports valid=true on successful migration");
    assert(
      migrateHappyJson.converted.some(
        (artifact: { sourcePath?: string; targetPath: string }) =>
          artifact.sourcePath === ".spec-driven/config.yaml" && artifact.targetPath === ".strict-spec-driven/config.yaml",
      ),
      "migrate reports converted strict config output",
    );
    assert(
      migrateHappyJson.converted.some(
        (artifact: { targetPath: string }) => artifact.targetPath === ".strict-spec-driven/specs/INDEX.yaml",
      ),
      "migrate reports initialized strict scaffold assets",
    );
    assert(
      migrateHappyJson.skipped.some(
        (artifact: { sourcePath: string }) => artifact.sourcePath === ".spec-driven/specs/INDEX.md",
      ),
      "migrate reports skipped legacy markdown artifacts without converters",
    );
    assert(
      migrateHappyJson.manualFollowUp.some(
        (item: { sourcePath: string }) => item.sourcePath === ".spec-driven/roadmap/INDEX.md",
      ),
      "migrate records manual follow-up for deferred legacy roadmap artifacts",
    );

    const migratedConfig = yamlModule.parseYamlFile<{
      schema: string;
      artifact_type: string;
      context: string;
      rules: Record<string, unknown>;
    }>(path.join(migrateHappyDir, ".strict-spec-driven", "config.yaml"));
    assert(
      migratedConfig.schema === "strict-spec-driven/config/v1"
        && migratedConfig.artifact_type === "workflow_config",
      "migrate writes strict workflow config metadata",
    );
    assert(
      migratedConfig.context.includes("Demo project context for migrate tests."),
      "migrate preserves legacy config context in strict output",
    );
    assert(
      readFileSync(path.join(migrateHappyDir, ".spec-driven", "config.yaml"), "utf8") === legacyConfigBefore,
      "migrate leaves legacy bootstrap config unchanged",
    );
  } finally {
    rmSync(migrateHappyDir, { recursive: true, force: true });
  }

  const migrateMissingSourceDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-missing-"));
  try {
    const missingSource = cli(["migrate"], { cwd: migrateMissingSourceDir });
    assert(missingSource.status !== 0, "migrate exits non-zero when .spec-driven is missing");
    const missingSourceJson = JSON.parse(missingSource.stdout.trim());
    assert(missingSourceJson.valid === false, "migrate reports valid=false when bootstrap source is missing");
    assert(
      missingSourceJson.errors.some(
        (diagnostic: { code: string; sourcePath?: string }) =>
          diagnostic.code === "legacy_source_missing" && diagnostic.sourcePath === ".spec-driven",
      ),
      "migrate identifies missing bootstrap source state in errors output",
    );
  } finally {
    rmSync(migrateMissingSourceDir, { recursive: true, force: true });
  }

  const migrateConflictDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-conflict-"));
  try {
    writeLegacyMigrationFixture(migrateConflictDir);
    mkdirSync(path.join(migrateConflictDir, ".strict-spec-driven"), { recursive: true });
    writeFileSync(path.join(migrateConflictDir, ".strict-spec-driven", "existing.txt"), "keep me\n", "utf8");

    const conflict = cli(["migrate"], { cwd: migrateConflictDir });
    assert(conflict.status !== 0, "migrate exits non-zero for non-empty strict target conflicts");
    const conflictJson = JSON.parse(conflict.stdout.trim());
    assert(conflictJson.valid === false, "migrate reports valid=false for strict target conflicts");
    assert(
      conflictJson.errors.some((diagnostic: { code: string }) => diagnostic.code === "strict_target_conflict"),
      "migrate reports overwrite-protection conflict details",
    );
    assert(
      readFileSync(path.join(migrateConflictDir, ".strict-spec-driven", "existing.txt"), "utf8") === "keep me\n",
      "migrate leaves existing strict target files unchanged on conflict",
    );
  } finally {
    rmSync(migrateConflictDir, { recursive: true, force: true });
  }

  const migrateInvalidConfigDir = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-invalid-config-"));
  try {
    writeLegacyMigrationFixture(migrateInvalidConfigDir, "schema: spec-driven\nrules: [unterminated\n");
    const invalidConfig = cli(["migrate"], { cwd: migrateInvalidConfigDir });
    assert(invalidConfig.status !== 0, "migrate exits non-zero for malformed legacy config YAML");
    const invalidConfigJson = JSON.parse(invalidConfig.stdout.trim());
    assert(invalidConfigJson.valid === false, "migrate reports valid=false for malformed legacy config");
    assert(
      invalidConfigJson.errors.some(
        (diagnostic: { code: string; sourcePath?: string }) =>
          diagnostic.code === "legacy_config_invalid" && diagnostic.sourcePath === ".spec-driven/config.yaml",
      ),
      "migrate reports malformed legacy config against the source artifact path",
    );
  } finally {
    rmSync(migrateInvalidConfigDir, { recursive: true, force: true });
  }

  const migrateDeterministicDirA = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-deterministic-a-"));
  const migrateDeterministicDirB = mkdtempSync(path.join(os.tmpdir(), "strict-spec-migrate-deterministic-b-"));
  try {
    writeLegacyMigrationFixture(migrateDeterministicDirA);
    writeLegacyMigrationFixture(migrateDeterministicDirB);

    const first = cli(["migrate"], { cwd: migrateDeterministicDirA });
    const second = cli(["migrate"], { cwd: migrateDeterministicDirB });
    assert(first.status === second.status, "migrate deterministic run has stable exit status");
    assert(first.stdout.trim() === second.stdout.trim(), "migrate deterministic run has stable JSON output");
  } finally {
    rmSync(migrateDeterministicDirA, { recursive: true, force: true });
    rmSync(migrateDeterministicDirB, { recursive: true, force: true });
  }

  console.log("");
  const total = passed + failed;
  if (failed === 0) {
    console.log(`All ${total} tests passed.`);
    return;
  }
  console.log(`${failed}/${total} tests failed.`);
  process.exit(1);
}

void main();
