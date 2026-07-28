import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { TestContext, cli, type CommandResult } from "../support/harness.js";

const DESIGN_SYSTEM_PATH = path.join(".strict-spec-driven", "design-system.yaml");

const POPULATED_DESIGN_SYSTEM = [
  "schema: strict-spec-driven/design-system/v1",
  "schema_version: 1",
  "artifact_type: design_system",
  "schema_file: templates/strict-spec-driven/schemas/design-system.yaml",
  "design_system:",
  "  id: fixture-design-system",
  "  title: Fixture Design System",
  "tokens:",
  "  colors:",
  "    primary: '#1A73E8'",
  "  typography:",
  "    body:",
  "      fontFamily: Inter",
  "      fontSize: 16px",
  "  layout:",
  "    md: 16px",
  "  elevation:",
  "    card: 0 1px 3px rgba(0, 0, 0, 0.12)",
  "  shapes:",
  "    rounded: 8px",
  "components:",
  "  fixture-button:",
  "    title: Fixture Button",
  "    description: The fixture action control.",
  "    tokens:",
  "      backgroundColor: colors.primary",
  "    mapping:",
  "      implementation:",
  "        - src/fixture-button.ts",
  "      snapshots:",
  "        - test/snapshots/fixture-button.png",
  "guidance:",
  "  overview: The fixture identity uses one accent color.",
  "  do:",
  "    - Use the accent color for the primary action.",
  "  dont:",
  "    - Do not add undeclared accent colors.",
  "",
].join("\n");

/** Declares only two of the five token groups so the renderer must omit the other three sections. */
const PARTIAL_DESIGN_SYSTEM = [
  "schema: strict-spec-driven/design-system/v1",
  "schema_version: 1",
  "artifact_type: design_system",
  "schema_file: templates/strict-spec-driven/schemas/design-system.yaml",
  "design_system:",
  "  id: partial-design-system",
  "  title: Partial Design System",
  "tokens:",
  "  colors:",
  "    primary: '#1A73E8'",
  "  typography:",
  "    body:",
  "      fontFamily: Inter",
  "components: {}",
  "guidance:",
  "  overview: The partial identity declares only colors and typography.",
  "",
].join("\n");

function readJson(result: CommandResult): Record<string, unknown> {
  try {
    return JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Creates an initialized workspace carrying a fully populated design-system artifact. */
function createPopulatedWorkspace(): string {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "strict-design-system-"));
  cli(["init"], { cwd: workspaceRoot });

  mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  mkdirSync(path.join(workspaceRoot, "test", "snapshots"), { recursive: true });
  writeFileSync(path.join(workspaceRoot, "src", "fixture-button.ts"), "export const button = true;\n", "utf8");
  writeFileSync(path.join(workspaceRoot, "test", "snapshots", "fixture-button.png"), "png", "utf8");
  writeFileSync(path.join(workspaceRoot, DESIGN_SYSTEM_PATH), POPULATED_DESIGN_SYSTEM, "utf8");

  return workspaceRoot;
}

export async function runDesignSystemDocumentSuite(context: TestContext): Promise<void> {
  context.section("[design-system-document] schema availability and init behavior");

  const schemaList = cli(["schema-list"]);
  context.assert(
    schemaList.stdout.includes("strict-spec-driven/schemas/design-system.yaml"),
    "schema-list includes the design-system schema",
  );

  const schemaShow = cli(["schema-show", "design-system"]);
  context.assert(schemaShow.status === 0, "schema-show design-system exits zero");
  context.assert(
    schemaShow.stdout.includes("schema_id: strict-spec-driven/design-system/v1"),
    "schema-show design-system prints the schema definition",
  );

  const initRoot = mkdtempSync(path.join(os.tmpdir(), "strict-design-system-init-"));
  try {
    const initResult = cli(["init"], { cwd: initRoot });
    context.assert(initResult.status === 0, "init exits zero");
    context.assert(
      existsSync(path.join(initRoot, ".strict-spec-driven", "architecture.yaml")),
      "init still scaffolds the architecture artifact",
    );
    context.assert(
      !existsSync(path.join(initRoot, DESIGN_SYSTEM_PATH)),
      "init does not scaffold a design-system artifact",
    );
  } finally {
    rmSync(initRoot, { recursive: true, force: true });
  }

  context.section("[design-system-document] missing design-system artifact");

  const missingRoot = mkdtempSync(path.join(os.tmpdir(), "strict-design-system-missing-"));
  try {
    cli(["init"], { cwd: missingRoot });
    cli(["architecture-generate"], { cwd: missingRoot });
    const architectureBefore = readFileSync(path.join(missingRoot, "ARCHITECTURE.md"), "utf8");

    const missingResult = cli(["design-generate"], { cwd: missingRoot });
    context.assert(missingResult.status !== 0, "design-generate without a design-system artifact exits non-zero");
    context.assert(
      missingResult.stderr.includes(".strict-spec-driven/design-system.yaml"),
      "missing-artifact error names the expected artifact path",
      missingResult.stderr.trim(),
    );
    context.assert(
      missingResult.stderr.includes("/strict-spec-design"),
      "missing-artifact error names the design authoring entry point",
    );
    context.assert(
      !existsSync(path.join(missingRoot, "DESIGN.md")),
      "design-generate writes no document when the design-system artifact is missing",
    );
    context.assert(
      readFileSync(path.join(missingRoot, "ARCHITECTURE.md"), "utf8") === architectureBefore,
      "design-generate does not fall back to the architecture artifact or touch ARCHITECTURE.md",
    );

    const missingStatus = cli(["design-status"], { cwd: missingRoot });
    context.assert(missingStatus.status !== 0, "design-status without a design-system artifact exits non-zero");
  } finally {
    rmSync(missingRoot, { recursive: true, force: true });
  }

  context.section("[design-system-document] design.md format rendering and determinism");

  const workspaceRoot = createPopulatedWorkspace();
  try {
    const generateResult = cli(["design-generate"], { cwd: workspaceRoot });
    context.assert(generateResult.status === 0, "design-generate exits zero", generateResult.stderr);
    context.assert(readJson(generateResult).written === true, "design-generate reports the document as written");

    const designPath = path.join(workspaceRoot, "DESIGN.md");
    const firstRender = readFileSync(designPath, "utf8");
    const renderLines = firstRender.split("\n");

    context.assert(renderLines[0] === "---", "rendered document opens a YAML front-matter block on its first line");
    const frontMatterEnd = renderLines.indexOf("---", 1);
    context.assert(frontMatterEnd > 1, "rendered document closes the front-matter block");
    const frontMatter = renderLines.slice(1, frontMatterEnd).join("\n");
    context.assert(
      frontMatter.includes("colors:") && frontMatter.includes("'#1A73E8'"),
      "front matter carries the declared machine-readable tokens",
      frontMatter,
    );

    const bannerIndex = renderLines.indexOf("> **Generated file — do not edit by hand.**");
    context.assert(
      bannerIndex > frontMatterEnd,
      "the generated banner follows the front matter rather than preceding it",
    );
    context.assert(
      firstRender.includes(".strict-spec-driven/design-system.yaml"),
      "generated banner names the design-system artifact as a source",
    );

    const canonicalSections = [
      "## Overview",
      "## Colors",
      "## Typography",
      "## Layout",
      "## Elevation & Depth",
      "## Shapes",
      "## Components",
      "## Do's and Don'ts",
    ];
    let previousIndex = bannerIndex;
    for (const heading of canonicalSections) {
      const headingIndex = renderLines.indexOf(heading);
      context.assert(headingIndex > previousIndex, `rendered document contains ${heading} in canonical order`);
      previousIndex = headingIndex;
    }

    context.assert(firstRender.includes("Fixture Button"), "rendered document includes the declared component");
    context.assert(
      firstRender.includes("`colors.primary`"),
      "components section shows the token each component property maps to",
    );
    context.assert(
      firstRender.includes("test/snapshots/fixture-button.png"),
      "components section lists declared visual-regression snapshots",
    );

    cli(["design-generate"], { cwd: workspaceRoot });
    context.assert(
      readFileSync(designPath, "utf8") === firstRender,
      "a second design-generate run produces a byte-identical document",
    );

    context.section("[design-system-document] absent token groups");

    const partialRoot = mkdtempSync(path.join(os.tmpdir(), "strict-design-system-partial-"));
    try {
      cli(["init"], { cwd: partialRoot });
      writeFileSync(path.join(partialRoot, DESIGN_SYSTEM_PATH), PARTIAL_DESIGN_SYSTEM, "utf8");
      const partialResult = cli(["design-generate"], { cwd: partialRoot });
      context.assert(partialResult.status === 0, "design-generate renders a partial design system", partialResult.stderr);

      const partialRender = readFileSync(path.join(partialRoot, "DESIGN.md"), "utf8");
      context.assert(
        partialRender.includes("## Colors") && partialRender.includes("## Typography"),
        "declared token groups render their sections",
      );
      for (const omitted of ["## Layout", "## Elevation & Depth", "## Shapes"]) {
        context.assert(!partialRender.includes(omitted), `${omitted} is omitted rather than rendered empty`);
      }
      const partialFrontMatter = partialRender.split("---")[1] ?? "";
      context.assert(
        !partialFrontMatter.includes("layout:")
          && !partialFrontMatter.includes("elevation:")
          && !partialFrontMatter.includes("shapes:"),
        "front matter carries only the declared token groups",
        partialFrontMatter,
      );
    } finally {
      rmSync(partialRoot, { recursive: true, force: true });
    }

    context.section("[design-system-document] drift detection");

    const checkCurrent = cli(["design-generate", "--check"], { cwd: workspaceRoot });
    const checkCurrentPayload = readJson(checkCurrent);
    context.assert(checkCurrent.status === 0, "check mode exits zero when the document is current");
    context.assert(checkCurrentPayload.current === true, "check mode reports the document as current");
    context.assert(checkCurrentPayload.written === false, "check mode reports no write");
    context.assert(
      readFileSync(designPath, "utf8") === firstRender,
      "check mode leaves a current document unmodified",
    );

    const designSystemFile = path.join(workspaceRoot, DESIGN_SYSTEM_PATH);
    writeFileSync(
      designSystemFile,
      POPULATED_DESIGN_SYSTEM.replace("The fixture identity uses one accent color.", "The revised fixture identity."),
      "utf8",
    );

    const checkStale = cli(["design-generate", "--check"], { cwd: workspaceRoot });
    const checkStalePayload = readJson(checkStale);
    const staleSources = Array.isArray(checkStalePayload.staleSources) ? checkStalePayload.staleSources : [];
    context.assert(checkStale.status !== 0, "check mode exits non-zero when the document is stale");
    context.assert(checkStalePayload.current === false, "check mode reports a stale document as not current");
    context.assert(
      staleSources.includes(".strict-spec-driven/design-system.yaml"),
      "check mode names the design-system artifact as the changed source",
      JSON.stringify(staleSources),
    );
    context.assert(
      readFileSync(designPath, "utf8") === firstRender,
      "check mode leaves a stale document byte-identical to its prior content",
    );

    writeFileSync(designSystemFile, POPULATED_DESIGN_SYSTEM, "utf8");
    rmSync(designPath, { force: true });
    const checkAbsent = cli(["design-generate", "--check"], { cwd: workspaceRoot });
    const checkAbsentPayload = readJson(checkAbsent);
    context.assert(checkAbsent.status !== 0, "check mode exits non-zero when the document is absent");
    context.assert(
      checkAbsentPayload.documentExists === false && checkAbsent.stderr.includes("missing"),
      "check mode reports an absent document as missing rather than stale",
      checkAbsent.stderr.trim(),
    );
    context.assert(!existsSync(designPath), "check mode does not create an absent document");

    context.section("[design-system-document] output path override");

    const overrideResult = cli(["design-generate", "--output", "docs/TOKENS.md"], { cwd: workspaceRoot });
    context.assert(overrideResult.status === 0, "design-generate honors an output path override", overrideResult.stderr);
    context.assert(
      readJson(overrideResult).outputPath === "docs/TOKENS.md",
      "design-generate reports the overridden output path",
    );
    context.assert(
      existsSync(path.join(workspaceRoot, "docs", "TOKENS.md")),
      "design-generate writes the document at the overridden path",
    );
    context.assert(!existsSync(designPath), "an overridden output path leaves the default DESIGN.md untouched");
    const overrideCheck = cli(["design-generate", "--check", "--output", "docs/TOKENS.md"], { cwd: workspaceRoot });
    context.assert(overrideCheck.status === 0, "check mode compares against the overridden output path");

    const badFlag = cli(["design-generate", "--unknown"], { cwd: workspaceRoot });
    context.assert(badFlag.status !== 0, "design-generate rejects an unknown flag");
    context.assert(badFlag.stderr.includes("Usage:"), "design-generate prints usage for an unknown flag");

    context.section("[design-system-document] design-status reporting");

    const statusResult = cli(["design-status"], { cwd: workspaceRoot });
    const statusPayload = readJson(statusResult);
    context.assert(statusResult.status === 0, "design-status exits zero for a valid artifact");
    context.assert(statusPayload.valid === true, "design-status reports a valid artifact");
    context.assert(
      statusPayload.tokenGroupCount === 5 && statusPayload.tokenCount === 5 && statusPayload.componentCount === 1,
      "design-status reports token group, token, and component counts",
      JSON.stringify(statusPayload),
    );
    context.assert(
      Array.isArray(statusPayload.mappingDrift) && statusPayload.mappingDrift.length === 0,
      "design-status reports no mapping drift when mapped files exist",
      JSON.stringify(statusPayload.mappingDrift),
    );

    rmSync(path.join(workspaceRoot, "src", "fixture-button.ts"), { force: true });
    const implementationDrift = cli(["design-status"], { cwd: workspaceRoot });
    const implementationDriftEntries = Array.isArray(readJson(implementationDrift).mappingDrift)
      ? (readJson(implementationDrift).mappingDrift as Array<{ component?: string; path?: string; kind?: string }>)
      : [];
    context.assert(
      implementationDriftEntries.some(
        (entry) =>
          entry.component === "fixture-button" && entry.path === "src/fixture-button.ts" && entry.kind === "implementation",
      ),
      "design-status reports a missing implementation path as mapping drift with its component",
      JSON.stringify(implementationDriftEntries),
    );

    rmSync(path.join(workspaceRoot, "test", "snapshots", "fixture-button.png"), { force: true });
    const snapshotDrift = cli(["design-status"], { cwd: workspaceRoot });
    const snapshotDriftEntries = Array.isArray(readJson(snapshotDrift).mappingDrift)
      ? (readJson(snapshotDrift).mappingDrift as Array<{ component?: string; path?: string; kind?: string }>)
      : [];
    context.assert(
      snapshotDriftEntries.some(
        (entry) =>
          entry.component === "fixture-button"
          && entry.path === "test/snapshots/fixture-button.png"
          && entry.kind === "snapshot",
      ),
      "design-status reports a missing visual-regression snapshot path as mapping drift with its component",
      JSON.stringify(snapshotDriftEntries),
    );

    writeFileSync(designSystemFile, POPULATED_DESIGN_SYSTEM.replace("  id: fixture-design-system\n", ""), "utf8");
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
