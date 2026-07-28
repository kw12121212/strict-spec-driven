import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { TestContext, cli, type CommandResult } from "../support/harness.js";

const ARCHITECTURE_PATH = path.join(".strict-spec-driven", "architecture.yaml");

const POPULATED_ARCHITECTURE = [
  "schema: strict-spec-driven/architecture/v1",
  "schema_version: 1",
  "artifact_type: architecture",
  "schema_file: templates/strict-spec-driven/schemas/architecture.yaml",
  "architecture:",
  "  id: fixture-architecture",
  "  title: Fixture Architecture",
  "components:",
  "  fixture-component:",
  "    title: Fixture Component",
  "    responsibility: Owns the fixture behavior.",
  "    boundaries:",
  "      - Does not own persistence.",
  "    depends_on: []",
  "    mapping:",
  "      implementation:",
  "        - src/fixture.ts",
  "data_flows:",
  "  fixture-flow:",
  "    title: Fixture Flow",
  "    trigger: An operator runs the fixture command.",
  "    steps:",
  "      - The fixture component handles the request.",
  "    components:",
  "      - fixture-component",
  "decisions:",
  "  fixture-decision:",
  "    title: Fixture Decision",
  "    statement: The fixture keeps one component.",
  "    rationale: One component is enough for the fixture.",
  "    status: accepted",
  "    alternatives:",
  "      - Split into two components.",
  "",
].join("\n");

const FIXTURE_SPEC = [
  "schema: strict-spec-driven/main-spec/v1",
  "schema_version: 1",
  "artifact_type: main_spec",
  "schema_file: templates/strict-spec-driven/schemas/main-spec.yaml",
  "spec:",
  "  id: fixture-spec",
  "  title: Fixture Spec",
  "mapping:",
  "  implementation:",
  "    - src/fixture.ts",
  "  tests:",
  "    - test/fixture.test.ts",
  "requirements:",
  "  fixture-requirement:",
  "    strength: MUST",
  "    statement: The fixture MUST expose one observable behavior.",
  "    scenarios:",
  "      success:",
  "        - GIVEN: a fixture precondition",
  "        - WHEN: the fixture action occurs",
  "        - THEN: the observable result is available",
  "",
].join("\n");

const FIXTURE_SPEC_INDEX = [
  "schema: strict-spec-driven/spec-index/v1",
  "schema_version: 1",
  "artifact_type: spec_index",
  "schema_file: templates/strict-spec-driven/schemas/spec-index.yaml",
  "specs:",
  "  - id: fixture-spec",
  "    title: Fixture Spec",
  "    path: .strict-spec-driven/specs/fixture.yaml",
  "",
].join("\n");

const FIXTURE_TECH_STANDARD = [
  "schema: strict-spec-driven/main-tech/v1",
  "schema_version: 1",
  "artifact_type: main_tech",
  "schema_file: ../schemas/main-tech.yaml",
  "standard:",
  "  id: fixture-standard",
  "  title: Fixture Standard",
  "  category: coding",
  "mapping:",
  "  implementation:",
  "    - src/fixture.ts",
  "  enforcement: []",
  "rules:",
  "  fixture-rule:",
  "    strength: MUST",
  "    statement: Fixture code MUST stay in one module.",
  "    rationale: The fixture is small.",
  "    enforcement:",
  "      method: review",
  "",
].join("\n");

function readJson(result: CommandResult): Record<string, unknown> {
  try {
    return JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Creates an initialized workspace whose architecture, spec, and tech sources render a full document. */
function createPopulatedWorkspace(): string {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-design-doc-"));
  cli(["init"], { cwd: workspaceRoot });

  mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  writeFileSync(path.join(workspaceRoot, "src", "fixture.ts"), "export const fixture = true;\n", "utf8");
  writeFileSync(path.join(workspaceRoot, ARCHITECTURE_PATH), POPULATED_ARCHITECTURE, "utf8");
  writeFileSync(path.join(workspaceRoot, ".strict-spec-driven", "specs", "fixture.yaml"), FIXTURE_SPEC, "utf8");
  writeFileSync(path.join(workspaceRoot, ".strict-spec-driven", "specs", "INDEX.yaml"), FIXTURE_SPEC_INDEX, "utf8");
  writeFileSync(
    path.join(workspaceRoot, ".strict-spec-driven", "tech", "fixture-standard.yaml"),
    FIXTURE_TECH_STANDARD,
    "utf8",
  );

  return workspaceRoot;
}

export async function runDesignDocumentSuite(context: TestContext): Promise<void> {
  context.section("[design-document] architecture schema availability and init scaffolding");

  const schemaList = cli(["schema-list"]);
  context.assert(
    schemaList.stdout.includes("strict-spec-driven/schemas/architecture.yaml"),
    "schema-list includes the architecture schema",
  );

  const schemaShow = cli(["schema-show", "architecture"]);
  context.assert(schemaShow.status === 0, "schema-show architecture exits zero");
  context.assert(
    schemaShow.stdout.includes("schema_id: strict-spec-driven/architecture/v1"),
    "schema-show architecture prints the schema definition",
  );

  const initRoot = mkdtempSync(path.join(os.tmpdir(), "strict-design-init-"));
  try {
    const initResult = cli(["init"], { cwd: initRoot });
    context.assert(initResult.status === 0, "init exits zero");
    const scaffoldedArchitecture = path.join(initRoot, ARCHITECTURE_PATH);
    context.assert(existsSync(scaffoldedArchitecture), "init scaffolds .strict-spec-driven/architecture.yaml");

    const scaffoldStatus = cli(["design-status"], { cwd: initRoot });
    const scaffoldPayload = readJson(scaffoldStatus);
    context.assert(scaffoldStatus.status === 0, "design-status on the scaffolded artifact exits zero");
    context.assert(scaffoldPayload.valid === true, "scaffolded architecture artifact validates against its schema");
    context.assert(
      scaffoldPayload.componentCount === 0 && scaffoldPayload.dataFlowCount === 0 && scaffoldPayload.decisionCount === 0,
      "scaffolded architecture artifact declares empty collections",
      JSON.stringify(scaffoldPayload),
    );
  } finally {
    rmSync(initRoot, { recursive: true, force: true });
  }

  context.section("[design-document] missing architecture artifact");

  const missingRoot = mkdtempSync(path.join(os.tmpdir(), "strict-design-missing-"));
  try {
    cli(["init"], { cwd: missingRoot });
    rmSync(path.join(missingRoot, ARCHITECTURE_PATH), { force: true });

    const missingResult = cli(["design-generate"], { cwd: missingRoot });
    context.assert(missingResult.status !== 0, "design-generate without an architecture artifact exits non-zero");
    context.assert(
      missingResult.stderr.includes(".strict-spec-driven/architecture.yaml"),
      "missing-artifact error names the expected artifact path",
    );
    context.assert(
      missingResult.stderr.includes("/strict-spec-design"),
      "missing-artifact error names the design authoring entry point",
    );
    context.assert(
      !existsSync(path.join(missingRoot, "DESIGN.md")),
      "design-generate writes no document when the architecture artifact is missing",
    );

    const missingStatus = cli(["design-status"], { cwd: missingRoot });
    context.assert(missingStatus.status !== 0, "design-status without an architecture artifact exits non-zero");
  } finally {
    rmSync(missingRoot, { recursive: true, force: true });
  }

  context.section("[design-document] rendering, determinism, and drift detection");

  const workspaceRoot = createPopulatedWorkspace();
  try {
    const generateResult = cli(["design-generate"], { cwd: workspaceRoot });
    const generatePayload = readJson(generateResult);
    context.assert(generateResult.status === 0, "design-generate exits zero", generateResult.stderr);
    context.assert(generatePayload.written === true, "design-generate reports the document as written");

    const designPath = path.join(workspaceRoot, "DESIGN.md");
    const firstRender = readFileSync(designPath, "utf8");

    for (const heading of [
      "## Overview",
      "## Components",
      "## Data Flows",
      "## Architecture Decisions",
      "## Specification Surface",
      "## Technical Standards",
    ]) {
      context.assert(firstRender.includes(heading), `rendered document contains the ${heading} section`);
    }
    context.assert(
      firstRender.includes("**Generated file — do not edit by hand.**"),
      "rendered document carries the generated banner",
    );
    for (const source of [
      ".strict-spec-driven/architecture.yaml",
      ".strict-spec-driven/specs/INDEX.yaml",
      ".strict-spec-driven/tech/",
    ]) {
      context.assert(firstRender.includes(source), `generated banner names ${source} as a source`);
    }
    context.assert(firstRender.includes("Fixture Component"), "rendered document includes the declared component");
    context.assert(firstRender.includes("Fixture Flow"), "rendered document includes the declared data flow");
    context.assert(firstRender.includes("Fixture Decision"), "rendered document includes the declared decision");
    context.assert(
      firstRender.includes("`fixture-spec`"),
      "specification surface projects the spec index entry",
    );
    context.assert(
      firstRender.includes("**MUST** `fixture-rule`"),
      "technical standards section projects the standard's rule and strength",
    );

    cli(["design-generate"], { cwd: workspaceRoot });
    context.assert(
      readFileSync(designPath, "utf8") === firstRender,
      "a second design-generate run produces a byte-identical document",
    );

    const checkCurrent = cli(["design-generate", "--check"], { cwd: workspaceRoot });
    const checkCurrentPayload = readJson(checkCurrent);
    context.assert(checkCurrent.status === 0, "check mode exits zero when the document is current");
    context.assert(checkCurrentPayload.current === true, "check mode reports the document as current");
    context.assert(checkCurrentPayload.written === false, "check mode reports no write");
    context.assert(
      readFileSync(designPath, "utf8") === firstRender,
      "check mode leaves a current document unmodified",
    );

    const architectureFile = path.join(workspaceRoot, ARCHITECTURE_PATH);
    writeFileSync(
      architectureFile,
      POPULATED_ARCHITECTURE.replace("Owns the fixture behavior.", "Owns the revised fixture behavior."),
      "utf8",
    );

    const checkStale = cli(["design-generate", "--check"], { cwd: workspaceRoot });
    const checkStalePayload = readJson(checkStale);
    const staleSources = Array.isArray(checkStalePayload.staleSources) ? checkStalePayload.staleSources : [];
    context.assert(checkStale.status !== 0, "check mode exits non-zero when the document is stale");
    context.assert(checkStalePayload.current === false, "check mode reports a stale document as not current");
    context.assert(
      staleSources.includes(".strict-spec-driven/architecture.yaml"),
      "check mode names the changed source artifact",
      JSON.stringify(staleSources),
    );
    context.assert(
      !staleSources.includes(".strict-spec-driven/tech/"),
      "check mode does not blame sources that did not change",
      JSON.stringify(staleSources),
    );
    context.assert(
      readFileSync(designPath, "utf8") === firstRender,
      "check mode leaves a stale document byte-identical to its prior content",
    );

    writeFileSync(architectureFile, POPULATED_ARCHITECTURE, "utf8");
    cli(["design-generate"], { cwd: workspaceRoot });
    writeFileSync(designPath, `${readFileSync(designPath, "utf8")}\n\n`, "utf8");
    const checkPadding = cli(["design-generate", "--check"], { cwd: workspaceRoot });
    const checkPaddingPayload = readJson(checkPadding);
    context.assert(checkPadding.status !== 0, "check mode exits non-zero for trailing-padding drift");
    context.assert(
      Array.isArray(checkPaddingPayload.staleSources) && checkPaddingPayload.staleSources.length > 0,
      "check mode always names at least one stale source when it reports drift",
      JSON.stringify(checkPaddingPayload.staleSources),
    );

    rmSync(designPath, { force: true });
    const checkAbsent = cli(["design-generate", "--check"], { cwd: workspaceRoot });
    context.assert(checkAbsent.status !== 0, "check mode exits non-zero when the document is absent");
    const checkAbsentPayload = readJson(checkAbsent);
    context.assert(
      checkAbsentPayload.current === false,
      "check mode reports an absent document as not current",
    );
    context.assert(
      checkAbsentPayload.documentExists === false && checkAbsent.stderr.includes("missing"),
      "check mode reports an absent document as missing rather than stale",
      checkAbsent.stderr.trim(),
    );
    context.assert(!existsSync(designPath), "check mode does not create an absent document");

    context.section("[design-document] output path override");

    const overrideResult = cli(["design-generate", "--output", "docs/ARCHITECTURE.md"], { cwd: workspaceRoot });
    context.assert(overrideResult.status === 0, "design-generate honors an output path override", overrideResult.stderr);
    context.assert(
      readJson(overrideResult).outputPath === "docs/ARCHITECTURE.md",
      "design-generate reports the overridden output path",
    );
    context.assert(
      existsSync(path.join(workspaceRoot, "docs", "ARCHITECTURE.md")),
      "design-generate writes the document at the overridden path",
    );
    context.assert(
      !existsSync(designPath),
      "an overridden output path leaves the default DESIGN.md untouched",
    );
    const overrideCheck = cli(["design-generate", "--check", "--output", "docs/ARCHITECTURE.md"], { cwd: workspaceRoot });
    context.assert(overrideCheck.status === 0, "check mode compares against the overridden output path");

    const badFlag = cli(["design-generate", "--unknown"], { cwd: workspaceRoot });
    context.assert(badFlag.status !== 0, "design-generate rejects an unknown flag");
    context.assert(badFlag.stderr.includes("Usage:"), "design-generate prints usage for an unknown flag");

    context.section("[design-document] design-status reporting");

    const statusResult = cli(["design-status"], { cwd: workspaceRoot });
    const statusPayload = readJson(statusResult);
    context.assert(statusResult.status === 0, "design-status exits zero for a valid artifact");
    context.assert(statusPayload.valid === true, "design-status reports a valid artifact");
    context.assert(
      statusPayload.componentCount === 1 && statusPayload.dataFlowCount === 1 && statusPayload.decisionCount === 1,
      "design-status reports component, data flow, and decision counts",
      JSON.stringify(statusPayload),
    );
    context.assert(
      Array.isArray(statusPayload.mappingDrift) && statusPayload.mappingDrift.length === 0,
      "design-status reports no mapping drift when mapped files exist",
    );

    rmSync(path.join(workspaceRoot, "src", "fixture.ts"), { force: true });
    const driftStatus = cli(["design-status"], { cwd: workspaceRoot });
    const driftPayload = readJson(driftStatus);
    const drift = Array.isArray(driftPayload.mappingDrift)
      ? (driftPayload.mappingDrift as Array<{ component?: string; path?: string }>)
      : [];
    context.assert(
      drift.some((entry) => entry.component === "fixture-component" && entry.path === "src/fixture.ts"),
      "design-status reports a missing implementation path as mapping drift with its component",
      JSON.stringify(drift),
    );

    writeFileSync(architectureFile, POPULATED_ARCHITECTURE.replace("  id: fixture-architecture\n", ""), "utf8");
    const invalidStatus = cli(["design-status"], { cwd: workspaceRoot });
    const invalidPayload = readJson(invalidStatus);
    context.assert(invalidStatus.status !== 0, "design-status exits non-zero for a schema-invalid artifact");
    context.assert(invalidPayload.valid === false, "design-status reports a schema-invalid artifact as invalid");
    context.assert(
      Array.isArray(invalidPayload.diagnostics) && invalidPayload.diagnostics.length > 0,
      "design-status reports schema validation diagnostics",
    );

    const invalidGenerate = cli(["design-generate"], { cwd: workspaceRoot });
    context.assert(invalidGenerate.status !== 0, "design-generate refuses to render a schema-invalid artifact");
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
}
