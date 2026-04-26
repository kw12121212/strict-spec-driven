import path from "node:path";

type SortKeyPart = string | number | boolean | null | undefined;

export function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

export function buildDeterministicSortKey(parts: readonly SortKeyPart[]): string {
  return parts.map((part) => (part == null ? "" : String(part))).join("|");
}

export function sortByDeterministicKey<T>(
  values: T[],
  getParts: (value: T) => readonly SortKeyPart[],
): T[] {
  return values.sort((left, right) => {
    const leftKey = buildDeterministicSortKey(getParts(left));
    const rightKey = buildDeterministicSortKey(getParts(right));
    return leftKey.localeCompare(rightKey);
  });
}
