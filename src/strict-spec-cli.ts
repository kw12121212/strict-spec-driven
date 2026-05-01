#!/usr/bin/env node
import { fileURLToPath } from "url";
import { realpathSync } from "fs";
import { exitCliEntrypoint, runCliEntrypoint, type CliCommandHandler } from "./cli/entrypoint.js";
import { createCliCommandTable } from "./cli/registry.js";
import { runInit, runPropose } from "./cli/cmd-scaffold.js";
import { runGenerate } from "./cli/cmd-generation.js";
import { runApply, runVerify, runReview, runArchive, runList, runModify, runCancel } from "./cli/cmd-change.js";
import { runRoadmapStatus, runRoadmapSync } from "./cli/cmd-roadmap.js";
import { runMigrate, runMaintenanceCommand } from "./cli/cmd-migration.js";
import { runShip, runValidateSkills, runVerifySpecMappings } from "./cli/cmd-operations.js";
import { runSchemaList, runSchemaShow, runTemplateList, runTemplateShow } from "./cli/cmd-templates.js";
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
import { reviewChange } from "./review.js";
import { archiveChange } from "./archive.js";
import { getRoadmapStatus, syncRoadmap } from "./roadmap.js";
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
export { reviewChange };
export { archiveChange };
export { getRoadmapStatus, syncRoadmap };
export { migrateLegacyWorkflow };
export { runMaintenance };

export const commands = createCliCommandTable({
  init: (argv) => runInit(argv),
  propose: (argv) => runPropose(argv),
  generate: (argv) => runGenerate(argv),
  apply: (argv) => runApply(argv),
  verify: (argv) => runVerify(argv),
  review: (argv) => runReview(argv),
  "verify-spec-mappings": (argv) => runVerifySpecMappings(argv),
  "validate-skills": (argv) => runValidateSkills(argv),
  "schema-list": (argv) => runSchemaList(argv),
  "schema-show": (argv) => runSchemaShow(argv),
  "template-list": (argv) => runTemplateList(argv),
  "template-show": (argv) => runTemplateShow(argv),
  migrate: (argv) => runMigrate(argv),
  "roadmap-status": (argv) => runRoadmapStatus(argv),
  "roadmap-sync": (argv) => runRoadmapSync(argv),
  maintenance: (argv) => runMaintenanceCommand(argv),
  ship: (argv) => runShip(argv),
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
