#!/usr/bin/env node
import { fileURLToPath } from "url";
import { realpathSync } from "fs";
import { exitCliEntrypoint, runCliEntrypoint, type CliCommandHandler } from "./cli/entrypoint.js";
import { createCliCommandTable } from "./cli/registry.js";
import { runInit, runPropose } from "./cli/cmd-scaffold.js";
import { runGenerate } from "./cli/cmd-generation.js";
import { runApply, runVerify, runArchive, runList, runModify, runCancel } from "./cli/cmd-change.js";
import { runCheckWorkflowState, runNext, runReady } from "./cli/cmd-workflow.js";
import { runRoadmapOverview, runRoadmapRecommend, runRoadmapStatus, runRoadmapSync } from "./cli/cmd-roadmap.js";
import { runMigrate, runMaintenanceCommand } from "./cli/cmd-migration.js";
import { runMcpInstall } from "./cli/cmd-mcp-install.js";
import { runShip, runValidateSkills, runVerifySpecMappings, runVerifyTechMappings, runTechStatus, runCommitAndPush } from "./cli/cmd-operations.js";
import { runSchemaList, runSchemaShow, runTemplateList, runTemplateShow } from "./cli/cmd-templates.js";
import {
  runHarnessDoctor,
  runHarnessInfer,
  runHarnessLogs,
  runHarnessPlan,
  runHarnessScripts,
  runHarnessSession,
  runHarnessStart,
  runHarnessStatus,
  runHarnessStop,
} from "./cli/cmd-harness.js";
import { parseYamlDocument, stringifyYamlDocument } from "./yaml.js";
import { compileSchema, createSchemaValidator } from "./validation.js";
import {
  findMissingRequiredChangeTemplateAssets,
  findMissingRequiredScaffoldAssets,
  getBundledScaffoldPath,
  getRequiredBundledChangeTemplateAssets,
  getRequiredBundledScaffoldAssets,
  initializeStrictChangeScaffold,
  initializeStrictScaffold,
  loadBundledScaffoldYaml,
  readBundledScaffoldTemplate,
} from "./scaffold.js";
import { applyTask, readChangeTasks, writeChangeTasks } from "./apply.js";
import { verifyChange } from "./verify.js";
import { checkProposalReadiness, getWorkflowState } from "./workflow-state.js";
import { archiveChange } from "./archive.js";
import { getRoadmapStatus, recommendRoadmapChange, syncRoadmap } from "./roadmap.js";
import { migrateLegacyWorkflow } from "./migrate.js";
import { runMaintenance } from "./maintenance.js";

export type CommandHandler = CliCommandHandler;
export { parseYamlDocument, stringifyYamlDocument };
export { compileSchema, createSchemaValidator };
export {
  getBundledScaffoldPath,
  readBundledScaffoldTemplate,
  loadBundledScaffoldYaml,
  getRequiredBundledScaffoldAssets,
  findMissingRequiredScaffoldAssets,
  getRequiredBundledChangeTemplateAssets,
  findMissingRequiredChangeTemplateAssets,
  initializeStrictScaffold,
  initializeStrictChangeScaffold,
};
export { applyTask, readChangeTasks, writeChangeTasks };
export { verifyChange };
export { checkProposalReadiness, getWorkflowState };
export { archiveChange };
export { getRoadmapStatus, recommendRoadmapChange, syncRoadmap };
export { migrateLegacyWorkflow };
export { runMaintenance };

export const commands = createCliCommandTable({
  init: (argv) => runInit(argv),
  "check-workflow-state": (argv) => runCheckWorkflowState(argv),
  propose: (argv) => runPropose(argv),
  generate: (argv) => runGenerate(argv),
  apply: (argv) => runApply(argv),
  verify: (argv) => runVerify(argv),
  ready: (argv) => runReady(argv),
  next: (argv) => runNext(argv),
  "verify-spec-mappings": (argv) => runVerifySpecMappings(argv),
  "verify-tech-mappings": (argv) => runVerifyTechMappings(argv),
  "tech-status": (argv) => runTechStatus(argv),
  "validate-skills": (argv) => runValidateSkills(argv),
  "schema-list": (argv) => runSchemaList(argv),
  "schema-show": (argv) => runSchemaShow(argv),
  "template-list": (argv) => runTemplateList(argv),
  "template-show": (argv) => runTemplateShow(argv),
  "harness-infer": (argv) => runHarnessInfer(argv),
  "harness-doctor": (argv) => runHarnessDoctor(argv),
  "harness-plan": (argv) => runHarnessPlan(argv),
  "harness-start": (argv) => runHarnessStart(argv),
  "harness-stop": (argv) => runHarnessStop(argv),
  "harness-status": (argv) => runHarnessStatus(argv),
  "harness-logs": (argv) => runHarnessLogs(argv),
  "harness-scripts": (argv) => runHarnessScripts(argv),
  "harness-session": (argv) => runHarnessSession(argv),
  "mcp-install": (argv) => runMcpInstall(argv),
  migrate: (argv) => runMigrate(argv),
  "roadmap-status": (argv) => runRoadmapStatus(argv),
  "roadmap-overview": (argv) => runRoadmapOverview(argv),
  "roadmap-sync": (argv) => runRoadmapSync(argv),
  "roadmap-recommend": (argv) => runRoadmapRecommend(argv),
  maintenance: (argv) => runMaintenanceCommand(argv),
  ship: (argv) => runShip(argv),
  "commit-and-push": (argv) => runCommitAndPush(argv),
  archive: (argv) => runArchive(argv),
  list: (argv) => runList(argv),
  modify: (argv) => runModify(argv),
  cancel: (argv) => runCancel(argv),
});

export function run(argv: string[]): number {
  return runCliEntrypoint(argv, commands);
}

if (realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  exitCliEntrypoint(process.argv.slice(2), commands);
}
