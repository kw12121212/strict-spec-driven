import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import yaml from "js-yaml";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { MCP_RESOURCE_INVENTORY, type McpCapabilityInventory } from "./inventory.js";

type ResourceReadResult = {
  contents: Array<{ uri: string; mimeType: "text/plain"; text: string }>;
};

const STRICT_DIR = ".strict-spec-driven";
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;
const CHANGE_ARTIFACTS = new Set(["proposal", "design", "tasks", "questions"]);

export function createResourceInventory(): McpCapabilityInventory["resources"] {
  return MCP_RESOURCE_INVENTORY;
}

export function registerStrictResources(server: McpServer, projectRoot: string): void {
  for (const resource of MCP_RESOURCE_INVENTORY) {
    const config = {
      title: resource.name,
      description: resource.description,
      mimeType: "text/plain",
    };
    if (resource.template) {
      server.registerResource(
        resource.name,
        new ResourceTemplate(resource.uri, { list: undefined }),
        config,
        async (uri) => readStrictResource(projectRoot, uri.href),
      );
    } else {
      server.registerResource(
        resource.name,
        resource.uri,
        config,
        async (uri) => readStrictResource(projectRoot, uri.href),
      );
    }
  }
}

export async function readStrictResource(projectRoot: string, uri: string): Promise<ResourceReadResult> {
  return {
    contents: [{
      uri,
      mimeType: "text/plain",
      text: readStrictResourceText(projectRoot, uri),
    }],
  };
}

export function readStrictResourceText(projectRoot: string, uri: string): string {
  const parsed = new URL(uri);
  if (parsed.protocol !== "strict:") throw new Error(`unsupported strict MCP resource URI: ${uri}`);
  const parts = [parsed.hostname, ...parsed.pathname.split("/").filter(Boolean)];
  const [family, ...rest] = parts;

  if (family === "config" && rest.length === 0) return readYamlArtifact(projectRoot, "config.yaml");
  if (family === "workflow" && rest.join("/") === "state") return JSON.stringify(workflowState(projectRoot), null, 2);
  if (family === "changes" && rest.length === 0) return JSON.stringify(changeSummary(projectRoot), null, 2);
  if (family === "changes" && rest.length === 2) return readChangeArtifact(projectRoot, rest[0] ?? "", rest[1] ?? "");
  if (family === "specs" && rest[0] === "index" && rest.length === 1) return readYamlArtifact(projectRoot, "specs/INDEX.yaml");
  if (family === "specs" && rest.length === 1) return readSpec(projectRoot, rest[0] ?? "");
  if (family === "roadmap" && rest[0] === "index" && rest.length === 1) return readYamlArtifact(projectRoot, "roadmap/INDEX.yaml");
  if (family === "roadmap" && rest[0] === "milestones" && rest.length === 2) {
    return readStrictIdFile(projectRoot, "roadmap/milestones", rest[1] ?? "");
  }
  if (family === "roadmap" && rest[0] === "planned-changes" && rest.length === 2) {
    return readStrictIdFile(projectRoot, "roadmap/planned-changes", rest[1] ?? "");
  }
  if (family === "tech" && rest[0] === "index" && rest.length === 1) return readYamlArtifact(projectRoot, "tech/INDEX.yaml");
  if (family === "tech" && rest.length === 1) return readStrictIdFile(projectRoot, "tech", rest[0] ?? "");
  if (family === "harness" && rest.join("/") === "declaration") return readYamlArtifact(projectRoot, "harness.yaml");

  throw new Error(`unknown strict MCP resource URI: ${uri}`);
}

function workflowState(projectRoot: string): Record<string, unknown> {
  const strictRoot = strictPath(projectRoot, "");
  return {
    strictRoot: STRICT_DIR,
    exists: existsSync(strictRoot),
    changes: changeSummary(projectRoot),
  };
}

function changeSummary(projectRoot: string): Record<string, string[]> {
  return {
    active: listDirs(strictPath(projectRoot, "changes")),
    archived: listDirs(strictPath(projectRoot, "changes/archive")),
  };
}

function readChangeArtifact(projectRoot: string, change: string, artifact: string): string {
  assertSafeId(change);
  if (!CHANGE_ARTIFACTS.has(artifact)) throw new Error(`unknown strict change artifact: ${artifact}`);
  const activePath = strictPath(projectRoot, `changes/${change}/${artifact}.yaml`);
  if (existsSync(activePath)) return readAndValidateYaml(activePath);
  const archived = listDirs(strictPath(projectRoot, "changes/archive"))
    .filter((entry) => entry === change || entry.endsWith(`-${change}`))
    .sort();
  if (archived.length > 0) {
    return readAndValidateYaml(strictPath(projectRoot, `changes/archive/${archived.at(-1)}/${artifact}.yaml`));
  }
  throw new Error(`strict change artifact not found: ${change}/${artifact}`);
}

function readSpec(projectRoot: string, specId: string): string {
  assertSafeId(specId);
  const index = yaml.load(readYamlArtifact(projectRoot, "specs/INDEX.yaml")) as {
    specs?: Array<{ id?: string; path?: string }>;
  };
  const spec = index.specs?.find((entry) => entry.id === specId);
  if (!spec?.path) throw new Error(`strict spec not found: ${specId}`);
  return readYamlArtifact(projectRoot, spec.path.replace(/^\.strict-spec-driven\//, ""));
}

function readStrictIdFile(projectRoot: string, directory: string, id: string): string {
  assertSafeId(id);
  return readYamlArtifact(projectRoot, `${directory}/${id}.yaml`);
}

function readYamlArtifact(projectRoot: string, relativePath: string): string {
  if (relativePath.includes("..") || path.isAbsolute(relativePath)) {
    throw new Error(`unsafe strict resource path: ${relativePath}`);
  }
  return readAndValidateYaml(strictPath(projectRoot, relativePath));
}

function readAndValidateYaml(filePath: string): string {
  if (!existsSync(filePath)) throw new Error(`strict resource artifact not found: ${filePath}`);
  const content = readFileSync(filePath, "utf8");
  try {
    yaml.load(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`malformed strict YAML resource: ${message}`);
  }
  return content;
}

function strictPath(projectRoot: string, relativePath: string): string {
  return path.join(projectRoot, STRICT_DIR, relativePath);
}

function listDirs(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => statSync(path.join(directory, entry)).isDirectory())
    .sort();
}

function assertSafeId(value: string): void {
  if (!SAFE_ID.test(value)) throw new Error(`unsafe strict resource identifier: ${value}`);
}
