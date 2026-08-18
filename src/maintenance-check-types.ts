/**
 * The configurable maintenance check types.
 *
 * This module imports nothing on purpose. Both the dispatch that runs the checks and the command
 * metadata that documents them read the list from here, and putting it in either of those modules
 * makes them import each other through the policy scanner, which leaves whichever module loads
 * second reading an uninitialized binding.
 *
 * The tuple is the single source in both directions: the runner map is typed by this union, so a
 * check type without a runner and a runner without a check type are both compile errors.
 */
export const MAINTENANCE_CHECK_TYPES = [
  "roadmap-sync-check",
  "specs-directory-structure-check",
  "generated-doc-check",
  "lesson-staleness-check",
  "cli-only-yaml-policy",
] as const;

export type MaintenanceCheckType = (typeof MAINTENANCE_CHECK_TYPES)[number];
