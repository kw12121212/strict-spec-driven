/**
 * The skill names this repository ships, and the ones it used to ship.
 *
 * The installer needs both sets: it adds the packaged skills and removes the retired ones, so an
 * upgrade over an older checkout does not leave a deleted slash command on offer. Neither set can
 * be derived from the other, and neither can be derived from name prefixes — three retired
 * packages are named `strict-ticket*`, which no packaged family prefix matches — so the retired
 * names are recorded in a file this module reads.
 *
 * The list lives at the repository root because its whole purpose is to name packages that no
 * longer exist, and two scans report exactly that. The dangling-reference scan walks `skills/`,
 * where the rule it enforces requires retirement text to sit outside the scanned scope rather than
 * be excused inside it. The removal sweep walks `src/`, which `inventory/` reaches indirectly: that
 * directory is a bundled-asset family root, so a file placed there is embedded verbatim into
 * `src/embedded-templates.ts`. The root is walked for markdown only and is embedded nowhere.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { makeDiagnostic, type SkillPackagingDiagnostic } from "./model.js";

/** Repository-relative location of the retired-skill list. */
export const RETIRED_SKILLS_FILE = "retired-skills.json";

/** A retired-skill list that could not be used, with the reason a caller can report. */
export type RetiredSkillListProblem = {
  code: string;
  message: string;
  expected?: string;
  actual?: string;
};

export type RetiredSkillList = {
  /** Retired names in sorted order; empty when the list is absent or unusable. */
  names: string[];
  /** Whether the file exists at all. An absent list is not a problem on its own. */
  present: boolean;
  problems: RetiredSkillListProblem[];
};

const byName = (left: string, right: string): number => left.localeCompare(right);

/** The skill packages this repository currently ships, taken from the directories under `skills/`. */
export function readPackagedSkillNames(rootDir: string): string[] {
  const skillsRoot = path.join(rootDir, "skills");
  if (!existsSync(skillsRoot) || !statSync(skillsRoot).isDirectory()) return [];
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(byName);
}

/**
 * The skill packages this repository has retired.
 *
 * Every failure is reported rather than thrown: the installer still has useful work to do when the
 * list is unreadable, and the caller decides whether an unusable list blocks it.
 */
export function readRetiredSkillNames(rootDir: string): RetiredSkillList {
  const listPath = path.join(rootDir, RETIRED_SKILLS_FILE);
  if (!existsSync(listPath)) return { names: [], present: false, problems: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(listPath, "utf8"));
  } catch (error) {
    return {
      names: [],
      present: true,
      problems: [
        {
          code: "skills.retired.parse_error",
          message: "retired skill list must be valid JSON",
          expected: "valid JSON",
          actual: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      names: [],
      present: true,
      problems: [
        {
          code: "skills.retired.invalid_shape",
          message: "retired skill list must be a JSON object",
        },
      ],
    };
  }

  const retired = (parsed as { retired?: unknown }).retired;
  if (!Array.isArray(retired)) {
    return {
      names: [],
      present: true,
      problems: [
        {
          code: "skills.retired.missing",
          message: "retired skill list must include a retired array",
        },
      ],
    };
  }

  const problems: RetiredSkillListProblem[] = [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < retired.length; index += 1) {
    const entry = retired[index];
    if (typeof entry !== "string" || entry.trim().length === 0) {
      problems.push({
        code: "skills.retired.entry.invalid",
        message: `retired skill list entry ${index} must be a non-empty string`,
        expected: "a non-empty string",
        actual: JSON.stringify(entry),
      });
      continue;
    }
    if (seen.has(entry)) {
      problems.push({
        code: "skills.retired.entry.duplicate",
        message: `retired skill list names '${entry}' more than once`,
        expected: "each retired name listed once",
        actual: entry,
      });
      continue;
    }
    seen.add(entry);
    names.push(entry);
  }

  return { names: names.sort(byName), present: true, problems };
}

/**
 * Every skill name the installer removes when uninstalling: what is shipped now, plus what was.
 *
 * Retired names that are also packaged are dropped here rather than reported, because a caller
 * removing skills must never be handed a live package; the mismatch is reported by validation.
 */
export function resolveRemovableSkillNames(rootDir: string): string[] {
  const packaged = readPackagedSkillNames(rootDir);
  const retired = readRetiredSkillNames(rootDir).names.filter((name) => !packaged.includes(name));
  return [...packaged, ...retired].sort(byName);
}

/**
 * Reports a retired list that is unusable or that claims a package the repository still ships.
 *
 * A name in both lists is the dangerous case: the installer would remove a skill it had just
 * installed, so the packaged set is what decides, and the contradiction is surfaced here.
 */
export function validateRetiredSkillList(
  rootDir: string,
  packagedNames: string[],
  diagnostics: SkillPackagingDiagnostic[],
): number {
  const relativePath = RETIRED_SKILLS_FILE;
  const list = readRetiredSkillNames(rootDir);
  for (const problem of list.problems) {
    diagnostics.push(
      makeDiagnostic(problem.code, relativePath, problem.message, problem.expected, problem.actual),
    );
  }

  const packaged = new Set(packagedNames);
  for (const name of list.names) {
    if (!packaged.has(name)) continue;
    diagnostics.push(
      makeDiagnostic(
        "skills.retired.entry.still_packaged",
        `${relativePath}#retired`,
        `retired skill list names '${name}', which this repository still packages under skills/, so installing would remove a live skill`,
        "a name with no package under skills/",
        name,
      ),
    );
  }

  return list.names.length;
}
