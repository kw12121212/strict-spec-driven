import { readFileSync } from "fs";
import { dump, load } from "js-yaml";

export function parseYamlDocument<T>(input: string): T {
  return load(input) as T;
}

export function stringifyYamlDocument(value: unknown): string {
  return dump(value, { lineWidth: 100 });
}

export function parseYamlFile<T>(path: string): T {
  return parseYamlDocument<T>(readFileSync(path, "utf8"));
}
