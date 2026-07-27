import { getEmbeddedTemplateKeys, readEmbeddedTemplate } from "../embedded-templates.js";
import { handleHelpRequest } from "./argv.js";
import { getCommandUsage } from "./command-metadata.js";
import { writeError, writeOut, writeUsage } from "./output.js";

function normalizeTemplateKey(key: string): string {
  return key.startsWith("strict-spec-driven/") ? key : `strict-spec-driven/${key}`;
}

function normalizeSchemaKey(name: string): string {
  if (name.startsWith("strict-spec-driven/schemas/")) return name;
  if (name.startsWith("schemas/")) return `strict-spec-driven/${name}`;
  return `strict-spec-driven/schemas/${name.endsWith(".yaml") ? name : `${name}.yaml`}`;
}

function normalizeSampleKey(name: string): string {
  if (name.startsWith("examples/strict-spec-driven/")) return name;
  if (name.startsWith("strict-spec-driven/")) return `examples/${name.endsWith(".yaml") ? name : `${name}.yaml`}`;
  if (name.startsWith("examples/")) return name;
  return `examples/strict-spec-driven/${name.endsWith(".yaml") ? name : `${name}.yaml`}`;
}

function listKeys(prefix: string): number {
  const keys = getEmbeddedTemplateKeys().filter((key) => key.startsWith(prefix));
  writeOut(keys.join("\n") + (keys.length > 0 ? "\n" : ""));
  return 0;
}

function showKey(key: string, usage: string): number {
  const content = readEmbeddedTemplate(key);
  if (content === undefined) {
    writeError(`embedded template asset '${key}' not found`);
    writeUsage(usage);
    return 1;
  }

  writeOut(content);
  return 0;
}

export function runTemplateList(argv: string[]): number {
  if (handleHelpRequest("template-list", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("template-list"));
    return 1;
  }

  return listKeys("strict-spec-driven/");
}

export function runTemplateShow(argv: string[]): number {
  const [key, ...extraArgs] = argv;
  const usage = getCommandUsage("template-show");
  if (handleHelpRequest("template-show", argv)) {
    return 0;
  }
  if (!key || extraArgs.length > 0) {
    writeUsage(usage);
    return 1;
  }

  return showKey(normalizeTemplateKey(key), usage);
}

export function runSchemaList(argv: string[]): number {
  if (handleHelpRequest("schema-list", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("schema-list"));
    return 1;
  }

  return listKeys("strict-spec-driven/schemas/");
}

export function runSchemaShow(argv: string[]): number {
  const [name, ...extraArgs] = argv;
  const usage = getCommandUsage("schema-show");
  if (handleHelpRequest("schema-show", argv)) {
    return 0;
  }
  if (!name || extraArgs.length > 0) {
    writeUsage(usage);
    return 1;
  }

  return showKey(normalizeSchemaKey(name), usage);
}

export function runSampleList(argv: string[]): number {
  if (handleHelpRequest("sample-list", argv)) {
    return 0;
  }
  if (argv.length > 0) {
    writeUsage(getCommandUsage("sample-list"));
    return 1;
  }

  return listKeys("examples/strict-spec-driven/");
}

export function runSampleShow(argv: string[]): number {
  const [name, ...extraArgs] = argv;
  const usage = getCommandUsage("sample-show");
  if (handleHelpRequest("sample-show", argv)) {
    return 0;
  }
  if (!name || extraArgs.length > 0) {
    writeUsage(usage);
    return 1;
  }

  return showKey(normalizeSampleKey(name), usage);
}
