#!/usr/bin/env node
import { printFinalSummary, TestContext } from "./support/harness.js";
import { runChangeLifecycleSuite } from "./suites/change-lifecycle.js";
import { runDevSessionLifecycleSuite } from "./suites/dev-session-lifecycle.js";
import { runDevSessionPlanSuite } from "./suites/dev-session-plan.js";
import { runDevSessionRegressionSuite } from "./suites/dev-session-regression.js";
import { runDevSessionTrialSuite } from "./suites/dev-session-trial.js";
import { runEntrypointAndSkillsSuite } from "./suites/entrypoint-and-skills.js";
import { runFoundationAndFixtureSuite } from "./suites/foundation-and-fixtures.js";
import { runOperationsSuite } from "./suites/operations.js";
import { runRoadmapAndMigrationSuite } from "./suites/roadmap-and-migration.js";

async function main(): Promise<void> {
  const context = new TestContext();

  await runEntrypointAndSkillsSuite(context);
  await runFoundationAndFixtureSuite(context);
  await runDevSessionPlanSuite(context);
  await runDevSessionLifecycleSuite(context);
  await runDevSessionTrialSuite(context);
  await runDevSessionRegressionSuite(context);
  await runChangeLifecycleSuite(context);
  await runRoadmapAndMigrationSuite(context);
  await runOperationsSuite(context);

  printFinalSummary(context);
}

void main();
