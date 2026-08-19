#!/usr/bin/env bun
/**
 * Prints the skill names an installer has to act on, one per line.
 *
 * Both installers need the same three answers — what to add, what to remove, and what to remove on
 * uninstall — and neither bash nor PowerShell is a good place to keep set logic that has to agree
 * across the two. They call this instead, so the names come from one implementation that the type
 * checker and the suite both see.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RETIRED_SKILLS_FILE,
  readPackagedSkillNames,
  readRetiredSkillNames,
  resolveRemovableSkillNames,
} from "../src/skills/package-names.js";

const SETS = ["packaged", "retired", "removable"] as const;
type NameSet = (typeof SETS)[number];

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage(): string {
  return [
    `Usage: bun scripts/skill-package-names.ts <${SETS.join("|")}> [--root <dir>]`,
    "",
    "  packaged   skill packages this repository ships now",
    "  retired    skill packages it used to ship, which an install removes from the machine",
    "  removable  both sets, for an uninstall that has to name every skill it removes",
  ].join("\n");
}

function main(argv: string[]): number {
  let requested: NameSet | undefined;
  let rootDir = REPO_ROOT;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    if (argument === "--root") {
      const value = argv[index + 1];
      if (!value) {
        process.stderr.write("--root requires a directory\n");
        return 1;
      }
      rootDir = path.resolve(value);
      index += 1;
      continue;
    }
    if (SETS.includes(argument as NameSet)) {
      requested = argument as NameSet;
      continue;
    }
    process.stderr.write(`Unknown argument: ${argument}\n${usage()}\n`);
    return 1;
  }

  if (!requested) {
    process.stderr.write(`${usage()}\n`);
    return 1;
  }

  // An unusable list is reported rather than treated as empty: silently printing no names would
  // turn a broken file into an install that quietly stops cleaning up.
  const retired = readRetiredSkillNames(rootDir);
  if (retired.problems.length > 0) {
    for (const problem of retired.problems) {
      process.stderr.write(`${RETIRED_SKILLS_FILE}: ${problem.message}\n`);
    }
    return 1;
  }

  const names =
    requested === "packaged"
      ? readPackagedSkillNames(rootDir)
      : requested === "retired"
        ? retired.names
        : resolveRemovableSkillNames(rootDir);

  for (const name of names) process.stdout.write(`${name}\n`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
