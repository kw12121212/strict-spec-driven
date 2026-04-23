#!/usr/bin/env node
import AjvModule, { type ValidateFunction } from "ajv";
import addFormatsModule from "ajv-formats";
import { dump, load } from "js-yaml";
import { fileURLToPath } from "url";

export const commands: Record<string, () => void> = {};

export function parseYamlDocument<T>(input: string): T {
  return load(input) as T;
}

export function stringifyYamlDocument(value: unknown): string {
  return dump(value, { lineWidth: 100 });
}

type ValidatorLike = {
  compile(schema: object): ValidateFunction;
};

function resolveAjvConstructor(): new (options: Record<string, unknown>) => ValidatorLike {
  const value = AjvModule as unknown as {
    default?: new (options: Record<string, unknown>) => ValidatorLike;
  };
  return value.default ?? (AjvModule as unknown as new (options: Record<string, unknown>) => ValidatorLike);
}

function resolveFormatsPlugin(): (validator: ValidatorLike) => void {
  const value = addFormatsModule as unknown as {
    default?: (validator: ValidatorLike) => void;
  };
  return value.default ?? (addFormatsModule as unknown as (validator: ValidatorLike) => void);
}

export function createSchemaValidator(): ValidatorLike {
  const AjvCtor = resolveAjvConstructor();
  const validator = new AjvCtor({ allErrors: true, strict: false });
  resolveFormatsPlugin()(validator);
  return validator;
}

export function compileSchema(schema: object): ValidateFunction {
  return createSchemaValidator().compile(schema);
}

export function run(argv: string[]): number {
  const [subcommand] = argv;
  if (!subcommand || !(subcommand in commands)) {
    process.stderr.write("Usage: strict-spec-driven <command>\n");
    if (Object.keys(commands).length > 0) {
      process.stderr.write(`Commands: ${Object.keys(commands).join(", ")}\n`);
    }
    return 1;
  }
  commands[subcommand]();
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)));
}
