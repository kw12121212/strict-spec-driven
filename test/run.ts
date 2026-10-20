#!/usr/bin/env node
import { printFinalSummary, TestContext } from "./support/harness.js";
import { runChangeLifecycleSuite } from "./suites/change-lifecycle.js";
import { runCoverageGateSuite } from "./suites/coverage-gate.js";
import { runArchitectureDocumentSuite } from "./suites/architecture-document.js";
import { runArchitectureAuthoringSuite } from "./suites/architecture-authoring.js";
import { runDesignSystemDocumentSuite } from "./suites/design-system-document.js";
import { runDesignSystemAuthoringSuite } from "./suites/design-system-authoring.js";
import { runEntrypointAndSkillsSuite } from "./suites/entrypoint-and-skills.js";
import { runFoundationAndFixtureSuite } from "./suites/foundation-and-fixtures.js";
import { runHarnessRemovalSuite } from "./suites/harness-removal.js";
import { runDshPluginSuite } from "./suites/dsh-plugin.js";
import { runDshPluginHostSuite } from "./suites/dsh-plugin-host.js";
import { runDshPluginModelSuite } from "./suites/dsh-plugin-model.js";
import { runDshPluginComponentSuite } from "./suites/dsh-plugin-components.js";
import { runMcpInstallSuite } from "./suites/mcp-install.js";
import { runMcpServerSuite } from "./suites/mcp-server.js";
import { runOperationsSuite } from "./suites/operations.js";
import { runRoadmapAndMigrationSuite } from "./suites/roadmap-and-migration.js";
import { runLessonsSuite } from "./suites/lessons.js";
import { runSceneMergeAndCoverageSuite, runSceneMergeValiditySuite, runScenesSuite } from "./suites/scenes.js";
import { runSopsSuite } from "./suites/sops.js";
import { runMappingReferenceSweepSuite, runMappingRemovalSuite, runSpecTechAuthoringSuite } from "./suites/spec-tech-authoring.js";
import { runYamlAuthoringProtocolSuite } from "./suites/yaml-authoring-protocol.js";
import { runYamlOperationMatrixSuite } from "./suites/yaml-operation-matrix.js";

async function main(): Promise<void> {
  const context = new TestContext();

  await runEntrypointAndSkillsSuite(context);
  await runFoundationAndFixtureSuite(context);
  await runChangeLifecycleSuite(context);
  await runRoadmapAndMigrationSuite(context);
  await runSopsSuite(context);
  await runLessonsSuite(context);
  await runScenesSuite(context);
  await runSceneMergeAndCoverageSuite(context);
  await runSceneMergeValiditySuite(context);
  await runOperationsSuite(context);
  await runArchitectureDocumentSuite(context);
  await runArchitectureAuthoringSuite(context);
  await runDesignSystemDocumentSuite(context);
  await runDesignSystemAuthoringSuite(context);
  await runSpecTechAuthoringSuite(context);
  await runMappingRemovalSuite(context);
  await runMappingReferenceSweepSuite(context);
  await runYamlOperationMatrixSuite(context);
  await runYamlAuthoringProtocolSuite(context);
  await runMcpServerSuite(context);
  await runMcpInstallSuite(context);
  await runHarnessRemovalSuite(context);
  await runDshPluginSuite(context);
  await runDshPluginHostSuite(context);
  await runDshPluginModelSuite(context);
  await runDshPluginComponentSuite(context);
  await runCoverageGateSuite(context);

  printFinalSummary(context);
}

void main();
