import { sortByDeterministicKey } from "../diagnostics.js";
import type { SkillPackagingDiagnostic } from "./model.js";

export function sortDiagnostics(diagnostics: SkillPackagingDiagnostic[]): SkillPackagingDiagnostic[] {
  return sortByDeterministicKey(
    diagnostics,
    (diagnostic) => [
      diagnostic.code,
      diagnostic.path,
      diagnostic.message,
      diagnostic.expected ?? "",
      diagnostic.actual ?? "",
    ],
  );
}
