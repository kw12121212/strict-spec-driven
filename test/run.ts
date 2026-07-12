#!/usr/bin/env node
import { printFinalSummary, TestContext } from "./support/harness.js";
import { runChangeLifecycleSuite } from "./suites/change-lifecycle.js";
import { runCoverageGateSuite } from "./suites/coverage-gate.js";
import { runEntrypointAndSkillsSuite } from "./suites/entrypoint-and-skills.js";
import { runFoundationAndFixtureSuite } from "./suites/foundation-and-fixtures.js";
import { runHarnessContractsSuite } from "./suites/harness-contracts.js";
import { runHarnessInferDoctorSuite } from "./suites/harness-infer-doctor.js";
import { runHarnessLifecycleSuite } from "./suites/harness-lifecycle.js";
import { runHarnessPlanSuite } from "./suites/harness-plan.js";
import { runHarnessSessionSuite } from "./suites/harness-session.js";
import { runMcpInstallSuite } from "./suites/mcp-install.js";
import { runMcpServerSuite } from "./suites/mcp-server.js";
import { runOperationsSuite } from "./suites/operations.js";
import { runRoadmapAndMigrationSuite } from "./suites/roadmap-and-migration.js";
import { runSopsSuite } from "./suites/sops.js";

async function main(): Promise<void> {
  const context = new TestContext();

  await runEntrypointAndSkillsSuite(context);
  await runFoundationAndFixtureSuite(context);
  await runHarnessContractsSuite(context);
  await runHarnessPlanSuite(context);
  await runHarnessLifecycleSuite(context);
  await runHarnessInferDoctorSuite(context);
  await runHarnessSessionSuite(context);
  await runChangeLifecycleSuite(context);
  await runRoadmapAndMigrationSuite(context);
  await runSopsSuite(context);
  await runOperationsSuite(context);
  await runMcpServerSuite(context);
  await runMcpInstallSuite(context);
  await runCoverageGateSuite(context);

  printFinalSummary(context);
}

void main();
