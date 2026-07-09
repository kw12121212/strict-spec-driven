#!/usr/bin/env node
import { fileURLToPath } from "url";
import { realpathSync } from "fs";
import { exitCliEntrypoint, runCliEntrypoint, type CliCommandHandler } from "./cli/entrypoint.js";
import { createCliCommandTable } from "./cli/registry.js";
import { runInit, runPropose } from "./cli/cmd-scaffold.js";
import { runGenerate } from "./cli/cmd-generation.js";
import { runApply, runVerify, runArchive, runList, runModify, runCancel } from "./cli/cmd-change.js";
import { runCheckWorkflowState, runNext, runReady } from "./cli/cmd-workflow.js";
import {
  runRoadmapArchive,
  runRoadmapGenerate,
  runRoadmapOverview,
  runRoadmapRecommend,
  runRoadmapRenumber,
  runRoadmapReorder,
  runRoadmapReopen,
  runRoadmapStatus,
  runRoadmapSync,
} from "./cli/cmd-roadmap.js";
import { runTicketCreate, runTicketEdit, runTicketList, runTicketResolve, runTicketShow, runTicketValidate } from "./cli/cmd-tickets.js";
import { runSopCategoryList, runSopCategoryShow, runSopCreate, runSopEdit, runSopList, runSopShow, runSopValidate } from "./cli/cmd-sops.js";
import { runMigrate, runMaintenanceCommand } from "./cli/cmd-migration.js";
import { runMcpInstall } from "./cli/cmd-mcp-install.js";
import { runShip, runValidateSkills, runVerifySpecMappings, runVerifyTechMappings, runTechStatus, runCommitAndPush } from "./cli/cmd-operations.js";
import { runSampleList, runSampleShow, runSchemaList, runSchemaShow, runTemplateList, runTemplateShow } from "./cli/cmd-templates.js";
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
export { archiveRoadmapMilestones } from "./roadmap/archive.js";
export { reopenMilestone } from "./roadmap/reopen.js";
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
  "sample-list": (argv) => runSampleList(argv),
  "sample-show": (argv) => runSampleShow(argv),
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
  "roadmap-generate": (argv) => runRoadmapGenerate(argv),
  "roadmap-status": (argv) => runRoadmapStatus(argv),
  "roadmap-overview": (argv) => runRoadmapOverview(argv),
  "roadmap-sync": (argv) => runRoadmapSync(argv),
  "roadmap-reorder": (argv) => runRoadmapReorder(argv),
  "roadmap-renumber": (argv) => runRoadmapRenumber(argv),
  "roadmap-recommend": (argv) => runRoadmapRecommend(argv),
  "roadmap-archive": (argv) => runRoadmapArchive(argv),
  "roadmap-reopen": (argv) => runRoadmapReopen(argv),
  "ticket-create": (argv) => runTicketCreate(argv),
  "ticket-list": (argv) => runTicketList(argv),
  "ticket-show": (argv) => runTicketShow(argv),
  "ticket-edit": (argv) => runTicketEdit(argv),
  "ticket-validate": (argv) => runTicketValidate(argv),
  "ticket-resolve": (argv) => runTicketResolve(argv),
  "sop-create": (argv) => runSopCreate(argv),
  "sop-list": (argv) => runSopList(argv),
  "sop-show": (argv) => runSopShow(argv),
  "sop-edit": (argv) => runSopEdit(argv),
  "sop-validate": (argv) => runSopValidate(argv),
  "sop-category-list": (argv) => runSopCategoryList(argv),
  "sop-category-show": (argv) => runSopCategoryShow(argv),
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

function isDirectInvocation(argvPath: string | undefined, moduleUrl: string): boolean {
  if (!argvPath) return false;
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    // When compiled with `bun build --compile`, the entrypoint lives in Bun's
    // virtual filesystem. The realpath comparison above fails (the synthetic
    // drive does not exist on disk), so detect the embedded root instead. Bun
    // 1.3+ serves compiled modules under "/~BUN/" (URL-encoded "%7EBUN"); older
    // builds used "/$bunfs/". Decode the URL so the encoded form matches.
    const modulePath = fileURLToPath(moduleUrl);
    return modulePath.includes("~BUN") || modulePath.includes("$bunfs");
  }
}

if (isDirectInvocation(process.argv[1], import.meta.url)) {
  exitCliEntrypoint(process.argv.slice(2), commands);
}
