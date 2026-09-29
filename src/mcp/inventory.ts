import {
  getArtifactCacheContext,
  getCommandArtifactSurface,
  getCommandMetadata,
  type CliCommandArtifactSurfaceEntry,
} from "../cli/command-metadata.js";

/**
 * A tool description is read into every host context whether or not the tool is used, so it names
 * the assets an agent needs before its first write and defers the per-operation and cross-file
 * detail to a command the agent runs only when it actually needs it.
 */
function describeArtifactEntry(entry: CliCommandArtifactSurfaceEntry): string {
  const assets = [
    entry.schemaKeys.length > 0 ? `schemas ${entry.schemaKeys.join(", ")}` : undefined,
    entry.exampleKeys.length > 0 ? `examples ${entry.exampleKeys.join(", ")}` : undefined,
    entry.inspectWith.length > 0 ? `print them with ${entry.inspectWith.join(", ")}` : undefined,
  ].filter((part): part is string => part !== undefined);
  return assets.length === 0 ? entry.artifactKind : `${entry.artifactKind} (${assets.join("; ")})`;
}

/**
 * MCP tool descriptions come from the shared command-metadata registry. Mutating commands carry
 * an mcpDescription that states project-state mutation explicitly; read-only commands reuse the
 * CLI summary.
 */
function mcpToolDescription(cliCommand: string): string {
  const metadata = getCommandMetadata(cliCommand);
  const description = metadata.mcpDescription ?? metadata.summary;
  const artifactSurface = getCommandArtifactSurface(cliCommand);
  if (artifactSurface.length === 0) return description;

  const cache = getArtifactCacheContext();
  return [
    description,
    `Writes YAML artifact kinds: ${artifactSurface.map(describeArtifactEntry).join("; ")}.`,
    `Declared schema_file and example paths resolve beneath ${cache.schemaCacheRoot}, and the keys above name the bundled assets when that cache is unavailable.`,
    `Run ${
      artifactSurface.map((entry) => `'strict-spec-cli yaml-surface-show ${entry.artifactKind}'`).join(" and ")
    } for the supported operations, their owning commands, and the cross-file effects of a write.`,
    // Every mutating tool routes to the protocol, so an agent that reads only this description
    // still learns the step order and that direct YAML editing is not an available fallback.
    `Follow the CLI-only YAML authoring protocol for this write: run ${
      artifactSurface.map((entry) => `'strict-spec-cli yaml-authoring-protocol ${entry.artifactKind}'`).join(" and ")
    } for the ordered steps, the validation command, and the no-fallback boundary that forbids editing the YAML directly when a required command is unavailable.`,
  ].join(" ");
}

export const MCP_SERVER_NAME = "strict-spec-driven";
export const MCP_SERVER_VERSION = "0.1.0";

export const MCP_SAFETY_CLASSES = ["read", "write", "release", "destructive"] as const;
export type McpSafetyClass = (typeof MCP_SAFETY_CLASSES)[number];

export type McpCapabilityInventory = {
  server: {
    name: string;
    version: string;
  };
  resources: Array<{
    name: string;
    uri: string;
    description: string;
    template: boolean;
  }>;
  tools: Array<{
    name: string;
    description: string;
    safety: McpSafetyClass;
    cliCommand: string;
    mutates: boolean;
  }>;
  prompts: Array<{
    name: string;
    description: string;
    arguments: Array<{
      name: string;
      description: string;
      required: boolean;
    }>;
  }>;
};

export const MCP_READ_ONLY_TOOL_INVENTORY: McpCapabilityInventory["tools"] = [
  {
    name: "check_workflow_state",
    description: mcpToolDescription("check-workflow-state"),
    safety: "read",
    cliCommand: "check-workflow-state",
    mutates: false,
  },
  {
    name: "list_changes",
    description: mcpToolDescription("list"),
    safety: "read",
    cliCommand: "list",
    mutates: false,
  },
  {
    name: "ready_change",
    description: mcpToolDescription("ready"),
    safety: "read",
    cliCommand: "ready",
    mutates: false,
  },
  {
    name: "next_change_step",
    description: mcpToolDescription("next"),
    safety: "read",
    cliCommand: "next",
    mutates: false,
  },
  {
    name: "verify_change",
    description: mcpToolDescription("verify"),
    safety: "read",
    cliCommand: "verify",
    mutates: false,
  },
  {
    name: "roadmap_status",
    description: mcpToolDescription("roadmap-status"),
    safety: "read",
    cliCommand: "roadmap-status",
    mutates: false,
  },
  {
    name: "roadmap_overview",
    description: mcpToolDescription("roadmap-overview"),
    safety: "read",
    cliCommand: "roadmap-overview",
    mutates: false,
  },
  {
    name: "roadmap_recommend",
    description: mcpToolDescription("roadmap-recommend"),
    safety: "read",
    cliCommand: "roadmap-recommend",
    mutates: false,
  },
  {
    name: "yaml_authoring_protocol",
    description: mcpToolDescription("yaml-authoring-protocol"),
    safety: "read",
    cliCommand: "yaml-authoring-protocol",
    mutates: false,
  },
  {
    name: "tech_status",
    description: mcpToolDescription("tech-status"),
    safety: "read",
    cliCommand: "tech-status",
    mutates: false,
  },
  {
    name: "scene_status",
    description: mcpToolDescription("scene-status"),
    safety: "read",
    cliCommand: "scene-status",
    mutates: false,
  },
];

export const MCP_MUTATING_TOOL_INVENTORY: McpCapabilityInventory["tools"] = [
  {
    name: "init_workflow",
    description: mcpToolDescription("init"),
    safety: "write",
    cliCommand: "init",
    mutates: true,
  },
  {
    name: "config_edit",
    description: mcpToolDescription("config-edit"),
    safety: "write",
    cliCommand: "config-edit",
    mutates: true,
  },
  {
    name: "propose_change",
    description: mcpToolDescription("propose"),
    safety: "write",
    cliCommand: "propose",
    mutates: true,
  },
  {
    name: "generate_change_artifact",
    description: mcpToolDescription("generate"),
    safety: "write",
    cliCommand: "generate",
    mutates: true,
  },
  {
    name: "spec_edit",
    description: mcpToolDescription("spec-edit"),
    safety: "write",
    cliCommand: "spec-edit",
    mutates: true,
  },
  {
    name: "tech_edit",
    description: mcpToolDescription("tech-edit"),
    safety: "write",
    cliCommand: "tech-edit",
    mutates: true,
  },
  {
    name: "scene_edit",
    description: mcpToolDescription("scene-edit"),
    safety: "write",
    cliCommand: "scene-edit",
    mutates: true,
  },
  {
    name: "mark_next_task_complete",
    description: mcpToolDescription("apply"),
    safety: "write",
    cliCommand: "apply",
    mutates: true,
  },
  {
    name: "roadmap_sync",
    description: mcpToolDescription("roadmap-sync"),
    safety: "write",
    cliCommand: "roadmap-sync",
    mutates: true,
  },
  {
    name: "archive_change",
    description: mcpToolDescription("archive"),
    safety: "release",
    cliCommand: "archive",
    mutates: true,
  },
  {
    name: "cancel_change",
    description: mcpToolDescription("cancel"),
    safety: "destructive",
    cliCommand: "cancel",
    mutates: true,
  },
  {
    name: "architecture_edit",
    description: mcpToolDescription("architecture-edit"),
    safety: "write",
    cliCommand: "architecture-edit",
    mutates: true,
  },
  {
    name: "design_edit",
    description: mcpToolDescription("design-edit"),
    safety: "write",
    cliCommand: "design-edit",
    mutates: true,
  },
];

export const MCP_RESOURCE_INVENTORY: McpCapabilityInventory["resources"] = [
  { name: "config", uri: "strict://config", description: "Strict workflow config.", template: false },
  { name: "workflow_state", uri: "strict://workflow/state", description: "Strict workflow state summary.", template: false },
  { name: "changes", uri: "strict://changes", description: "Strict active and archived change summary.", template: false },
  { name: "change_proposal", uri: "strict://changes/{change}/proposal", description: "Strict change proposal artifact.", template: true },
  { name: "change_design", uri: "strict://changes/{change}/design", description: "Strict change design artifact.", template: true },
  { name: "change_tasks", uri: "strict://changes/{change}/tasks", description: "Strict change task artifact.", template: true },
  { name: "change_questions", uri: "strict://changes/{change}/questions", description: "Strict change question artifact.", template: true },
  { name: "specs_index", uri: "strict://specs/index", description: "Strict specs index.", template: false },
  { name: "spec", uri: "strict://specs/{specId}", description: "Strict main spec artifact.", template: true },
  { name: "roadmap_index", uri: "strict://roadmap/index", description: "Strict roadmap index.", template: false },
  { name: "roadmap_milestone", uri: "strict://roadmap/milestones/{milestoneId}", description: "Strict roadmap milestone.", template: true },
  { name: "roadmap_planned_change", uri: "strict://roadmap/planned-changes/{plannedChangeId}", description: "Strict roadmap planned change.", template: true },
  { name: "tech_index", uri: "strict://tech/index", description: "Strict technical standards index.", template: false },
  { name: "tech_standard", uri: "strict://tech/{standardId}", description: "Strict technical standard.", template: true },
];

export const MCP_PROMPT_INVENTORY: McpCapabilityInventory["prompts"] = [
  {
    name: "strict_propose_change",
    description: "Guide a strict change proposal using strict-spec-propose for standalone work or strict-roadmap-recommend for roadmap-backed work.",
    arguments: [
      { name: "change", description: "Optional kebab-case strict change name.", required: false },
      { name: "summary", description: "Optional short description of the requested change.", required: false },
      { name: "roadmapItem", description: "Optional roadmap-backed milestone hint; accepts an exact milestone id or an unambiguous numeric prefix such as 5, then sources the proposal through strict-roadmap-recommend and roadmap-recommend --milestone.", required: false },
    ],
  },
  {
    name: "strict_apply_change",
    description: "Guide implementation of the next pending task for a strict change.",
    arguments: [
      { name: "change", description: "Kebab-case strict change name.", required: true },
    ],
  },
  {
    name: "strict_review_change",
    description: "Guide evidence-based code review for a completed strict change.",
    arguments: [
      { name: "change", description: "Kebab-case strict change name.", required: true },
    ],
  },
  {
    name: "strict_archive_change",
    description: "Guide archival of a verified strict change.",
    arguments: [
      { name: "change", description: "Kebab-case strict change name.", required: true },
    ],
  },
  {
    name: "strict_roadmap_recommend",
    description: "Guide selection and execution of the next strict roadmap-backed change.",
    arguments: [
      { name: "roadmapItem", description: "Optional planned-change or milestone hint.", required: false },
    ],
  },
];

export const MCP_INVENTORY: McpCapabilityInventory = {
  server: {
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  },
  resources: MCP_RESOURCE_INVENTORY,
  tools: [...MCP_READ_ONLY_TOOL_INVENTORY, ...MCP_MUTATING_TOOL_INVENTORY],
  prompts: MCP_PROMPT_INVENTORY,
};
