import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import {
  ROOT,
  TestContext,
  loadDistModule,
  runCommand,
} from "../support/harness.js";
import type { JSONRPCMessage, Transport } from "@modelcontextprotocol/server";

type McpServerModule = {
  McpStartupError: new (code: string, message: string) => Error & { code: string };
  parseMcpServerArgs(argv: string[], cwd?: string): { projectRoot: string };
  validateProjectRoot(projectRoot: string): string;
  createStrictMcpServer(projectRoot: string): {
    projectRoot: string;
    inventory: {
      server: { name: string; version: string };
      resources: unknown[];
      tools: unknown[];
      prompts: unknown[];
    };
    server: unknown;
  };
  createStrictMcpServer(
    projectRoot: string,
    inventory: {
      server: { name: string; version: string };
      resources: unknown[];
      tools: unknown[];
      prompts: unknown[];
    },
    runner: (args: string[], options: { cwd: string }) => { status: number; stdout: string; stderr: string },
  ): {
    projectRoot: string;
    inventory: {
      server: { name: string; version: string };
      resources: unknown[];
      tools: unknown[];
      prompts: unknown[];
    };
    server: unknown;
  };
  formatMcpStartupError(error: unknown): string;
};

type McpInventoryModule = {
  MCP_SERVER_NAME: string;
  MCP_SERVER_VERSION: string;
  MCP_SAFETY_CLASSES: string[];
  MCP_INVENTORY: {
    server: { name: string; version: string };
    resources: unknown[];
    tools: unknown[];
    prompts: unknown[];
  };
};

type McpToolsModule = {
  READ_ONLY_TOOL_DEFINITIONS: Array<{
    name: string;
    description: string;
    safety: string;
    mutates: boolean;
    cliCommand: string;
  }>;
  MUTATING_TOOL_DEFINITIONS: Array<{
    name: string;
    description: string;
    safety: string;
    mutates: boolean;
    cliCommand: string;
  }>;
  callReadOnlyTool(
    name: string,
    args: Record<string, unknown>,
    options: {
      projectRoot: string;
      runner: (args: string[], options: { cwd: string }) => { status: number; stdout: string; stderr: string };
    },
  ): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>;
  callMutatingTool(
    name: string,
    args: Record<string, unknown>,
    options: {
      projectRoot: string;
      runner?: (args: string[], options: { cwd: string }) => { status: number; stdout: string; stderr: string };
    },
  ): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>;
};

type McpResourcesModule = {
  createResourceInventory(): Array<{ name: string; uri: string; template: boolean }>;
  readStrictResourceText(projectRoot: string, uri: string): string;
  listTemplateResources(
    projectRoot: string,
    resource: { name: string; uri: string; description: string; template: boolean },
  ): { resources: Array<{ uri: string; name: string }> };
};

type McpPromptsModule = {
  createPromptInventory(): Array<{ name: string; description: string; arguments: Array<{ name: string; required: boolean }> }>;
  renderStrictPrompt(name: string, args: Record<string, unknown>): { messages: Array<{ role: string; content: { type: string; text: string } }> };
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: string | number;
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
};

class MemoryMcpTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  readonly sent: JSONRPCMessage[] = [];
  private nextId = 1;

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.sent.push(message);
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    this.onmessage?.({ jsonrpc: "2.0", id, method, params } as JSONRPCMessage);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = this.sent.find((message) => "id" in message && message.id === id) as JsonRpcResponse | undefined;
      if (response) return response;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error(`MCP protocol response not received for ${method}`);
  }

  notify(method: string, params: Record<string, unknown> = {}): void {
    this.onmessage?.({ jsonrpc: "2.0", method, params } as JSONRPCMessage);
  }
}

export async function runMcpServerSuite(context: TestContext): Promise<void> {
  context.section("[24] MCP server entrypoint");

  const mcpProtocol = await import("@modelcontextprotocol/server");
  const inventoryModule = await loadDistModule<McpInventoryModule>("mcp/inventory.js");
  const promptsModule = await loadDistModule<McpPromptsModule>("mcp/prompts.js");
  const resourcesModule = await loadDistModule<McpResourcesModule>("mcp/resources.js");
  const toolsModule = await loadDistModule<McpToolsModule>("mcp/tools.js");
  const serverModule = await loadDistModule<McpServerModule>("mcp/server.js");

  const packageJson = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    version: string;
    dependencies?: Record<string, string>;
  };

  context.assert(
    packageJson.dependencies?.["@modelcontextprotocol/server"] === "^2.0.0-alpha.2",
    "package declares MCP server SDK dependency",
  );
  context.assert(
    packageJson.dependencies?.["@cfworker/json-schema"] === "^4.1.1",
    "package declares MCP SDK bundling peer dependency",
  );
  context.assert(inventoryModule.MCP_SERVER_NAME === "strict-spec-driven", "MCP inventory exposes server name");
  context.assert(inventoryModule.MCP_SERVER_VERSION === packageJson.version, "MCP inventory exposes package version");
  context.assert(
    inventoryModule.MCP_SAFETY_CLASSES.join(",") === "read,write,lifecycle,release,destructive",
    "MCP inventory exposes safety-class vocabulary",
  );
  const resourceUris = resourcesModule.createResourceInventory().map((resource) => resource.uri);
  context.assert(resourceUris[0] === "strict://config", "MCP resources preserve stable ordering");
  context.assert(resourceUris.includes("strict://workflow/state"), "MCP resources include workflow state");
  context.assert(resourceUris.includes("strict://changes/{change}/proposal"), "MCP resources include change proposal template");
  context.assert(resourceUris.includes("strict://specs/{specId}"), "MCP resources include spec template");
  context.assert(
    resourceUris.includes("strict://roadmap/planned-changes/{plannedChangeId}"),
    "MCP resources include planned change template",
  );
  context.assert(resourceUris.includes("strict://harness/declaration"), "MCP resources include harness declaration");
  const promptInventory = promptsModule.createPromptInventory();
  const promptNames = promptInventory.map((prompt) => prompt.name);
  context.assert(promptNames.includes("strict_propose_change"), "MCP prompts include proposal guidance");
  context.assert(promptNames.includes("strict_apply_change"), "MCP prompts include apply guidance");
  context.assert(promptNames.includes("strict_review_change"), "MCP prompts include review guidance");
  context.assert(promptNames.includes("strict_archive_change"), "MCP prompts include archive guidance");
  context.assert(promptNames.includes("strict_roadmap_recommend"), "MCP prompts include roadmap recommendation guidance");
  context.assert(promptNames.includes("strict_harness_investigation"), "MCP prompts include harness investigation guidance");
  context.assert(
    promptInventory.find((prompt) => prompt.name === "strict_propose_change")?.arguments.some((argument) => argument.name === "roadmapItem" && !argument.required),
    "MCP propose prompt declares optional roadmap-backed argument",
  );
  context.assert(
    promptInventory.find((prompt) => prompt.name === "strict_review_change")?.arguments.some((argument) => argument.name === "change" && argument.required),
    "MCP review prompt declares typed change argument",
  );
  const toolNames = toolsModule.READ_ONLY_TOOL_DEFINITIONS.map((tool) => tool.name);
  context.assert(toolNames.includes("check_workflow_state"), "MCP read tools include workflow state check");
  context.assert(toolNames.includes("ready_change"), "MCP read tools include change readiness");
  context.assert(toolNames.includes("roadmap_recommend"), "MCP read tools include roadmap recommendation");
  // roadmap-recommend --create only reserves an empty change container, so the read-only tool must
  // not inherit a planning-artifact write claim from the mutation inventory.
  const roadmapRecommendTool = toolsModule.READ_ONLY_TOOL_DEFINITIONS.find((tool) => tool.name === "roadmap_recommend");
  context.assert(
    roadmapRecommendTool !== undefined && !roadmapRecommendTool.description.includes("Writes YAML artifact kinds"),
    "MCP roadmap_recommend read tool advertises no YAML write",
    roadmapRecommendTool?.description,
  );
  context.assert(toolNames.includes("harness_logs"), "MCP read tools include bounded harness logs");
  const mutatingToolNames = toolsModule.MUTATING_TOOL_DEFINITIONS.map((tool) => tool.name);
  context.assert(mutatingToolNames.includes("init_workflow"), "MCP mutating tools include workflow init");
  context.assert(mutatingToolNames.includes("config_edit"), "MCP mutating tools include workflow config authoring");
  context.assert(mutatingToolNames.includes("propose_change"), "MCP mutating tools include change proposal");
  context.assert(mutatingToolNames.includes("generate_change_artifact"), "MCP mutating tools include artifact generation");
  context.assert(mutatingToolNames.includes("mark_next_task_complete"), "MCP mutating tools include task-state completion");
  context.assert(mutatingToolNames.includes("roadmap_sync"), "MCP mutating tools include roadmap sync");
  context.assert(mutatingToolNames.includes("archive_change"), "MCP mutating tools include archive");
  context.assert(mutatingToolNames.includes("harness_start"), "MCP mutating tools include harness start");
  context.assert(mutatingToolNames.includes("harness_stop"), "MCP mutating tools include harness stop");
  context.assert(mutatingToolNames.includes("harness_session_create"), "MCP mutating tools include harness session creation");
  context.assert(
    toolsModule.READ_ONLY_TOOL_DEFINITIONS.every((tool) => tool.safety === "read" && tool.mutates === false),
    "MCP read tools are all classified as non-mutating read tools",
  );
  context.assert(
    toolsModule.MUTATING_TOOL_DEFINITIONS.every((tool) => tool.mutates === true && tool.safety !== "read"),
    "MCP mutating tools are all classified as mutating non-read tools",
  );
  const applyBackedTool = toolsModule.MUTATING_TOOL_DEFINITIONS.find((tool) => tool.name === "mark_next_task_complete");
  context.assert(applyBackedTool?.cliCommand === "apply", "MCP task-state completion delegates to apply");
  context.assert(
    applyBackedTool?.description.includes("task state") === true,
    "MCP task-state completion wording does not imply implementation work",
  );
  const archiveTool = toolsModule.MUTATING_TOOL_DEFINITIONS.find((tool) => tool.name === "archive_change");
  context.assert(archiveTool?.safety === "release", "MCP archive tool uses release safety class");
  const harnessStartTool = toolsModule.MUTATING_TOOL_DEFINITIONS.find((tool) => tool.name === "harness_start");
  context.assert(harnessStartTool?.safety === "lifecycle", "MCP harness start tool uses lifecycle safety class");
  context.assert(mutatingToolNames.includes("cancel_change"), "MCP mutating tools include destructive cancel");
  const cancelTool = toolsModule.MUTATING_TOOL_DEFINITIONS.find((tool) => tool.name === "cancel_change");
  context.assert(cancelTool?.safety === "destructive", "MCP cancel tool uses destructive safety class");
  context.assert(cancelTool?.cliCommand === "cancel", "MCP cancel tool delegates to cancel command");
  {
    // Every repository-owned family must reach an agent through MCP as well as the CLI, so the
    // authoring tool is exposed as a write and the reporter as a read rather than only one of them.
    const sceneEditTool = toolsModule.MUTATING_TOOL_DEFINITIONS.find((tool) => tool.name === "scene_edit");
    const sceneStatusTool = toolsModule.READ_ONLY_TOOL_DEFINITIONS.find((tool) => tool.name === "scene_status");
    context.assert(
      sceneEditTool?.safety === "write"
        && sceneEditTool?.cliCommand === "scene-edit"
        && sceneStatusTool?.safety === "read"
        && sceneStatusTool?.cliCommand === "scene-status",
      "the MCP tool inventory exposes the scene authoring and status tools",
      JSON.stringify({ sceneEditTool: sceneEditTool?.safety, sceneStatusTool: sceneStatusTool?.safety }),
    );
    context.assert(
      sceneEditTool?.description.includes("scene-state") === true
        && sceneEditTool?.description.includes("yaml-authoring-protocol scene-state") === true,
      "the MCP scene authoring tool description names the artifact kind and routes to the authoring protocol",
      sceneEditTool?.description,
    );
  }
  context.assert(
    inventoryModule.MCP_SAFETY_CLASSES.every((safetyClass) =>
      toolsModule.READ_ONLY_TOOL_DEFINITIONS.concat(toolsModule.MUTATING_TOOL_DEFINITIONS).some((tool) => tool.safety === safetyClass),
    ),
    "every MCP safety class is backed by at least one exposed tool",
  );
  context.assert(
    inventoryModule.MCP_INVENTORY.resources.length === resourcesModule.createResourceInventory().length,
    "initial MCP inventory exposes resources",
  );
  context.assert(
    inventoryModule.MCP_INVENTORY.tools.length === toolsModule.READ_ONLY_TOOL_DEFINITIONS.length + toolsModule.MUTATING_TOOL_DEFINITIONS.length,
    "initial MCP inventory exposes read and mutating tools",
  );
  context.assert(
    inventoryModule.MCP_INVENTORY.prompts.length === promptInventory.length,
    "initial MCP inventory exposes prompts",
  );

  const reviewPrompt = promptsModule.renderStrictPrompt("strict_review_change", { change: "demo-change" }).messages[0]?.content.text ?? "";
  context.assert(reviewPrompt.includes("strict-spec-review"), "MCP review prompt renders skill guidance");
  context.assert(reviewPrompt.includes("complete project regression command"), "MCP review prompt preserves regression evidence boundary");
  const roadmapBackedProposePrompt =
    promptsModule.renderStrictPrompt("strict_propose_change", { roadmapItem: "5" }).messages[0]?.content.text ?? "";
  context.assert(
    roadmapBackedProposePrompt.includes("strict-roadmap-recommend")
      && roadmapBackedProposePrompt.includes("roadmap-recommend")
      && roadmapBackedProposePrompt.includes("unambiguous numeric shorthand")
      && roadmapBackedProposePrompt.includes("roadmap-recommend --milestone")
      && roadmapBackedProposePrompt.includes("do not auto-invoke strict-spec-auto"),
    "MCP propose prompt renders roadmap-backed proposal guidance when roadmapItem is supplied",
  );
  const archivePrompt = promptsModule.renderStrictPrompt("strict_archive_change", { change: "demo-change" }).messages[0]?.content.text ?? "";
  context.assert(
    archivePrompt.includes("mandatory current-change tech-sync checkpoint")
      && archivePrompt.includes("without absorbing unrelated repository drift")
      && archivePrompt.includes("apply the recommendation the bounded evidence supports without pausing for operator confirmation")
      && archivePrompt.includes("recording the classification that the pattern is not reusable")
      && archivePrompt.includes("report the applied decision in the archive summary")
      && !archivePrompt.includes("operator-confirmed")
      && archivePrompt.includes("never defer a confirmed reusable convention until after archive")
      && archivePrompt.includes(
        "a write the configured regression command neither compiles nor reads — currently a change-local"
        + " delta-tech artifact or a lesson — does not invalidate passing complete project regression evidence",
      )
      && archivePrompt.includes("rerun that command only for a write outside the carve-out")
      && archivePrompt.includes("raw archive command only as the deterministic mechanism"),
    "MCP archive prompt preserves final current-change tech sync, the regression-evidence carve-out, and deterministic archive boundaries",
  );
  const roadmapPrompt = promptsModule.renderStrictPrompt("strict_roadmap_recommend", {}).messages[0]?.content.text ?? "";
  context.assert(roadmapPrompt.includes("roadmap-recommend"), "MCP roadmap prompt renders scripted recommendation guidance");
  const parameterizedRoadmapPrompt = promptsModule.renderStrictPrompt("strict_roadmap_recommend", { roadmapItem: "5" }).messages[0]?.content.text ?? "";
  context.assert(
    parameterizedRoadmapPrompt.includes("unambiguous numeric shorthand")
      && parameterizedRoadmapPrompt.includes("roadmap-recommend --milestone"),
    "MCP roadmap prompt renders parameterized milestone recommendation guidance",
  );
  const harnessPrompt = promptsModule.renderStrictPrompt("strict_harness_investigation", { session: "demo-session" }).messages[0]?.content.text ?? "";
  context.assert(harnessPrompt.includes("secrets_recorded: false"), "MCP harness prompt preserves secret evidence boundary");

  const tempProject = mkdtempSync(path.join(os.tmpdir(), "strict-mcp-project-"));
  try {
    const parsed = serverModule.parseMcpServerArgs(["--project", "."], tempProject);
    context.assert(parsed.projectRoot === tempProject, "MCP args resolve explicit project root");

    mkdirSync(path.join(tempProject, ".strict-spec-driven", "changes", "demo-change"), { recursive: true });
    mkdirSync(path.join(tempProject, ".strict-spec-driven", "specs", "cli"), { recursive: true });
    mkdirSync(path.join(tempProject, ".strict-spec-driven", "roadmap", "milestones"), { recursive: true });
    mkdirSync(path.join(tempProject, ".strict-spec-driven", "roadmap", "planned-changes"), { recursive: true });
    mkdirSync(path.join(tempProject, ".strict-spec-driven", "tech"), { recursive: true });
    writeFileSync(path.join(tempProject, ".strict-spec-driven", "config.yaml"), "schema: config\n", "utf8");
    writeFileSync(path.join(tempProject, ".strict-spec-driven", "harness.yaml"), "schema: harness\n", "utf8");
    writeFileSync(
      path.join(tempProject, ".strict-spec-driven", "changes", "demo-change", "proposal.yaml"),
      "change:\n  id: demo-change\n",
      "utf8",
    );
    writeFileSync(
      path.join(tempProject, ".strict-spec-driven", "specs", "INDEX.yaml"),
      "specs:\n  - id: cli-foundation\n    path: .strict-spec-driven/specs/cli/foundation.yaml\n",
      "utf8",
    );
    writeFileSync(
      path.join(tempProject, ".strict-spec-driven", "specs", "cli", "foundation.yaml"),
      "spec:\n  id: cli-foundation\n",
      "utf8",
    );
    writeFileSync(path.join(tempProject, ".strict-spec-driven", "roadmap", "INDEX.yaml"), "milestones: {}\n", "utf8");
    writeFileSync(
      path.join(tempProject, ".strict-spec-driven", "roadmap", "milestones", "demo-milestone.yaml"),
      "milestone: {}\n",
      "utf8",
    );
    writeFileSync(
      path.join(tempProject, ".strict-spec-driven", "roadmap", "planned-changes", "demo-change.yaml"),
      "planned_change: {}\n",
      "utf8",
    );
    writeFileSync(path.join(tempProject, ".strict-spec-driven", "tech", "INDEX.yaml"), "standards: {}\n", "utf8");
    writeFileSync(path.join(tempProject, ".strict-spec-driven", "tech", "typescript-esm-baseline.yaml"), "standard: {}\n", "utf8");

    const serverContext = serverModule.createStrictMcpServer(tempProject);
    context.assert(serverContext.projectRoot === tempProject, "MCP server context preserves project root");
    context.assert(serverContext.inventory.server.name === "strict-spec-driven", "MCP server context uses inventory metadata");
    context.assert(
      serverContext.inventory.tools.length === toolsModule.READ_ONLY_TOOL_DEFINITIONS.length + toolsModule.MUTATING_TOOL_DEFINITIONS.length,
      "MCP server context exposes read and mutating tool inventory",
    );
    context.assert(serverContext.inventory.resources.length === resourceUris.length, "MCP server context exposes resource inventory");
    context.assert(serverContext.inventory.prompts.length === promptInventory.length, "MCP server context exposes prompt inventory");

    const configResource = resourcesModule.readStrictResourceText(tempProject, "strict://config");
    context.assert(configResource.includes("schema: config"), "MCP resource reads strict config");
    const workflowStateResource = JSON.parse(resourcesModule.readStrictResourceText(tempProject, "strict://workflow/state")) as { exists?: boolean };
    context.assert(workflowStateResource.exists === true, "MCP resource reads generated workflow state summary");
    const proposalResource = resourcesModule.readStrictResourceText(tempProject, "strict://changes/demo-change/proposal");
    context.assert(proposalResource.includes("demo-change"), "MCP resource reads change artifact by template");
    const specResource = resourcesModule.readStrictResourceText(tempProject, "strict://specs/cli-foundation");
    context.assert(specResource.includes("cli-foundation"), "MCP resource reads spec by id");
    const roadmapResource = resourcesModule.readStrictResourceText(tempProject, "strict://roadmap/planned-changes/demo-change");
    context.assert(roadmapResource.includes("planned_change"), "MCP resource reads roadmap planned change by id");
    context.assert(
      resourcesModule.readStrictResourceText(tempProject, "strict://config") === configResource,
      "MCP resource reads are deterministic",
    );
    const traversalRejected = (() => {
      try {
        resourcesModule.readStrictResourceText(tempProject, "strict://specs/../package");
        return false;
      } catch {
        return true;
      }
    })();
    context.assert(traversalRejected, "MCP resources reject traversal identifiers");
    const missingRejected = (() => {
      try {
        resourcesModule.readStrictResourceText(tempProject, "strict://tech/missing-standard");
        return false;
      } catch {
        return true;
      }
    })();
    context.assert(missingRejected, "MCP resources reject missing artifacts");

    const beforeDiff = runCommand("git", ["status", "--short"], { cwd: tempProject }).stdout;
    const delegated = await toolsModule.callReadOnlyTool(
      "ready_change",
      { change: "demo-change" },
      {
        projectRoot: tempProject,
        runner: (args, options) => {
          context.assert(options.cwd === tempProject, "MCP read tool runner uses project root cwd");
          context.assert(args.join(" ") === "ready demo-change", "MCP read tool maps typed args to CLI args");
          return { status: 0, stdout: "{\"ready\":true}", stderr: "" };
        },
      },
    );
    const delegatedEnvelope = JSON.parse(delegated.content[0]?.text ?? "{}") as {
      command: string;
      status: number;
      safety: string;
      mutates: boolean;
      parsedJson?: { ready?: boolean };
    };
    context.assert(delegatedEnvelope.command === "ready", "MCP read tool envelope includes command");
    context.assert(delegatedEnvelope.status === 0, "MCP read tool envelope includes status");
    context.assert(delegatedEnvelope.safety === "read", "MCP read tool envelope includes safety");
    context.assert(delegatedEnvelope.mutates === false, "MCP read tool envelope marks no mutation");
    context.assert(delegatedEnvelope.parsedJson?.ready === true, "MCP read tool envelope includes parsed JSON stdout");

    const failed = await toolsModule.callReadOnlyTool(
      "verify_change",
      { change: "missing-change" },
      {
        projectRoot: tempProject,
        runner: () => ({ status: 1, stdout: "", stderr: "change not found" }),
      },
    );
    const failedEnvelope = JSON.parse(failed.content[0]?.text ?? "{}") as { status: number; stderr: string };
    context.assert(failedEnvelope.status === 1, "MCP read tool envelope preserves failure status");
    context.assert(failedEnvelope.stderr === "change not found", "MCP read tool envelope preserves stderr");

    const mutatingDelegated = await toolsModule.callMutatingTool(
      "harness_start",
      { environment: "dev", components: ["api", "worker"], confirm: true },
      {
        projectRoot: tempProject,
        runner: (args, options) => {
          context.assert(options.cwd === tempProject, "MCP mutating tool runner uses project root cwd");
          context.assert(
            args.join(" ") === "harness-start --environment dev --component api --component worker --confirm",
            "MCP mutating tool maps typed args to CLI args",
          );
          return { status: 0, stdout: "{\"valid\":true}", stderr: "" };
        },
      },
    );
    const mutatingDelegatedEnvelope = JSON.parse(mutatingDelegated.content[0]?.text ?? "{}") as {
      command: string;
      status: number;
      safety: string;
      mutates: boolean;
      parsedJson?: { valid?: boolean };
    };
    context.assert(mutatingDelegatedEnvelope.command === "harness-start", "MCP mutating tool envelope includes command");
    context.assert(mutatingDelegatedEnvelope.status === 0, "MCP mutating tool envelope includes status");
    context.assert(mutatingDelegatedEnvelope.safety === "lifecycle", "MCP mutating tool envelope includes safety");
    context.assert(mutatingDelegatedEnvelope.mutates === true, "MCP mutating tool envelope marks mutation");
    context.assert(mutatingDelegatedEnvelope.parsedJson?.valid === true, "MCP mutating tool envelope includes parsed JSON stdout");

    let invalidInputDelegated = false;
    const invalidInput = await toolsModule.callMutatingTool(
      "propose_change",
      {},
      {
        projectRoot: tempProject,
        runner: () => {
          invalidInputDelegated = true;
          return { status: 0, stdout: "", stderr: "" };
        },
      },
    );
    const invalidInputEnvelope = JSON.parse(invalidInput.content[0]?.text ?? "{}") as { status: number; stderr: string };
    context.assert(invalidInputEnvelope.status === 1, "MCP mutating tool rejects invalid input");
    context.assert(invalidInputEnvelope.stderr.includes("change"), "MCP mutating invalid input reports schema diagnostics");
    context.assert(!invalidInputDelegated, "MCP mutating invalid input does not invoke CLI delegate");
    context.assert(invalidInput.isError === true, "MCP mutating invalid input is signaled as a protocol error");

    let unconfirmedDelegated = false;
    const unconfirmedMutation = await toolsModule.callMutatingTool(
      "archive_change",
      { change: "demo-change" },
      {
        projectRoot: tempProject,
        runner: () => {
          unconfirmedDelegated = true;
          return { status: 0, stdout: "", stderr: "" };
        },
      },
    );
    const unconfirmedEnvelope = JSON.parse(unconfirmedMutation.content[0]?.text ?? "{}") as { status: number; stderr: string };
    context.assert(!unconfirmedDelegated, "MCP mutating tool without confirmation does not invoke CLI delegate");
    context.assert(unconfirmedEnvelope.status === 1, "MCP mutating tool without confirmation reports failure status");
    context.assert(unconfirmedEnvelope.stderr.includes("confirmation required"), "MCP mutating tool without confirmation reports confirmation diagnostic");
    context.assert(unconfirmedMutation.isError === true, "MCP mutating tool without confirmation is signaled as a protocol error");

    let confirmedDelegated = false;
    const confirmedMutation = await toolsModule.callMutatingTool(
      "propose_change",
      { change: "demo-change", confirm: true },
      {
        projectRoot: tempProject,
        runner: (args) => {
          confirmedDelegated = true;
          context.assert(args.join(" ") === "propose demo-change", "MCP confirmed mutation does not forward confirm to non-harness CLI");
          return { status: 0, stdout: "{\"ok\":true}", stderr: "" };
        },
      },
    );
    context.assert(confirmedDelegated, "MCP mutating tool with confirmation invokes CLI delegate");
    context.assert(confirmedMutation.isError === undefined, "MCP successful confirmed mutation is not a protocol error");

    const cancelDelegated = await toolsModule.callMutatingTool(
      "cancel_change",
      { change: "demo-change", confirm: true },
      {
        projectRoot: tempProject,
        runner: (args, options) => {
          context.assert(options.cwd === tempProject, "MCP cancel tool runner uses project root cwd");
          context.assert(args.join(" ") === "cancel demo-change", "MCP cancel tool delegates to cancel CLI without confirm flag");
          return { status: 0, stdout: "Cancelled: .strict-spec-driven/changes/demo-change", stderr: "" };
        },
      },
    );
    const cancelEnvelope = JSON.parse(cancelDelegated.content[0]?.text ?? "{}") as { command: string; safety: string; mutates: boolean };
    context.assert(cancelEnvelope.command === "cancel", "MCP cancel envelope reports cancel command");
    context.assert(cancelEnvelope.safety === "destructive", "MCP cancel envelope reports destructive safety");
    context.assert(cancelEnvelope.mutates === true, "MCP cancel envelope marks mutation");

    const failedMutation = await toolsModule.callMutatingTool(
      "archive_change",
      { change: "unfinished-change", confirm: true },
      {
        projectRoot: tempProject,
        runner: () => ({ status: 1, stdout: "", stderr: "verification blocker" }),
      },
    );
    const failedMutationEnvelope = JSON.parse(failedMutation.content[0]?.text ?? "{}") as {
      status: number;
      stderr: string;
      safety: string;
      mutates: boolean;
    };
    context.assert(failedMutationEnvelope.status === 1, "MCP mutating tool preserves failed precondition status");
    context.assert(failedMutationEnvelope.stderr === "verification blocker", "MCP mutating tool preserves failed precondition stderr");
    context.assert(failedMutationEnvelope.safety === "release", "MCP mutating failed precondition preserves safety class");
    context.assert(failedMutationEnvelope.mutates === true, "MCP mutating failed precondition preserves mutation flag");
    context.assert(failedMutation.isError === true, "MCP mutating failed precondition is signaled as a protocol error");

    const templateInventory = resourcesModule.createResourceInventory();
    const changeProposalTemplate = templateInventory.find((resource) => resource.name === "change_proposal");
    const enumeratedChanges = resourcesModule.listTemplateResources(tempProject, changeProposalTemplate!);
    context.assert(
      enumeratedChanges.resources.some((resource) => resource.uri === "strict://changes/demo-change/proposal"),
      "MCP change template enumerates existing active change URIs",
    );
    const specTemplate = templateInventory.find((resource) => resource.name === "spec");
    const enumeratedSpecs = resourcesModule.listTemplateResources(tempProject, specTemplate!);
    context.assert(
      enumeratedSpecs.resources.some((resource) => resource.uri === "strict://specs/cli-foundation"),
      "MCP spec template enumerates existing spec URIs",
    );
    const techTemplate = templateInventory.find((resource) => resource.name === "tech_standard");
    const enumeratedTech = resourcesModule.listTemplateResources(tempProject, techTemplate!);
    context.assert(
      enumeratedTech.resources.some((resource) => resource.uri === "strict://tech/typescript-esm-baseline"),
      "MCP tech template enumerates existing standard URIs and excludes INDEX",
    );
    context.assert(
      !enumeratedTech.resources.some((resource) => resource.uri.endsWith("/INDEX")),
      "MCP tech template enumeration excludes the INDEX file",
    );

    const afterDiff = runCommand("git", ["status", "--short"], { cwd: tempProject }).stdout;
    context.assert(afterDiff === beforeDiff, "MCP read and guarded mutating tool calls preserve workspace diff");

    const protocolRunner = (args: string[], options: { cwd: string }) => {
      context.assert(options.cwd === tempProject, "MCP protocol tool uses project root cwd");
      if (args.join(" ") === "check-workflow-state") return { status: 0, stdout: "strict workflow state exists: .strict-spec-driven/\n", stderr: "" };
      return { status: 1, stdout: "", stderr: `unexpected command ${args.join(" ")}` };
    };
    const protocolContext = serverModule.createStrictMcpServer(tempProject, inventoryModule.MCP_INVENTORY, protocolRunner);
    const transport = new MemoryMcpTransport();
    await (protocolContext.server as { connect(transport: Transport): Promise<void> }).connect(transport);
    const initializeResponse = await transport.request("initialize", {
      protocolVersion: mcpProtocol.LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "strict-mcp-test", version: "0.0.0" },
    });
    context.assert(!initializeResponse.error, "MCP protocol initialize succeeds");
    transport.notify("notifications/initialized");

    const toolsList = await transport.request("tools/list");
    const listedTools = toolsList.result?.tools as Array<{ name: string }> | undefined;
    context.assert(listedTools?.some((tool) => tool.name === "check_workflow_state") === true, "MCP protocol tools/list exposes read tool");
    const toolCall = await transport.request("tools/call", {
      name: "check_workflow_state",
      arguments: {},
    });
    const toolContent = toolCall.result?.content as Array<{ text: string }> | undefined;
    context.assert(toolContent?.[0]?.text.includes("check-workflow-state") === true, "MCP protocol tools/call returns delegated envelope");

    const resourcesList = await transport.request("resources/list");
    const listedResources = resourcesList.result?.resources as Array<{ uri: string }> | undefined;
    context.assert(listedResources?.some((resource) => resource.uri === "strict://config") === true, "MCP protocol resources/list exposes strict resource");
    context.assert(
      listedResources?.some((resource) => resource.uri === "strict://changes/demo-change/proposal") === true,
      "MCP protocol resources/list enumerates template resource instances",
    );
    const resourceRead = await transport.request("resources/read", { uri: "strict://config" });
    const resourceContents = resourceRead.result?.contents as Array<{ text: string }> | undefined;
    context.assert(resourceContents?.[0]?.text.includes("schema: config") === true, "MCP protocol resources/read returns strict artifact");

    const promptsList = await transport.request("prompts/list");
    const listedPrompts = promptsList.result?.prompts as Array<{ name: string }> | undefined;
    context.assert(listedPrompts?.some((prompt) => prompt.name === "strict_review_change") === true, "MCP protocol prompts/list exposes strict prompt");
    const promptGet = await transport.request("prompts/get", {
      name: "strict_review_change",
      arguments: { change: "demo-change" },
    });
    const promptMessages = promptGet.result?.messages as Array<{ content: { text: string } }> | undefined;
    context.assert(promptMessages?.[0]?.content.text.includes("strict-spec-review") === true, "MCP protocol prompts/get renders strict prompt");
    const roadmapPromptGet = await transport.request("prompts/get", {
      name: "strict_propose_change",
      arguments: { roadmapItem: "next roadmap change" },
    });
    const roadmapPromptMessages = roadmapPromptGet.result?.messages as Array<{ content: { text: string } }> | undefined;
    context.assert(
      roadmapPromptMessages?.[0]?.content.text.includes("strict-roadmap-recommend") === true
        && roadmapPromptMessages?.[0]?.content.text.includes("roadmap-recommend") === true
        && roadmapPromptMessages?.[0]?.content.text.includes("generate proposal, design, questions, and delta-spec artifacts") === true,
      "MCP protocol prompts/get renders roadmap-backed propose guidance",
    );
    await transport.close();

    const missingProjectError = (() => {
      try {
        serverModule.parseMcpServerArgs([], tempProject);
        return null;
      } catch (error) {
        return error;
      }
    })();
    context.assert(
      missingProjectError instanceof serverModule.McpStartupError,
      "MCP args reject missing project root",
    );
    context.assert(
      serverModule.formatMcpStartupError(missingProjectError).includes("missing_project"),
      "MCP startup error formatting includes missing-project code",
    );

    const fileProject = path.join(tempProject, "not-a-directory");
    writeFileSync(fileProject, "x", "utf8");
    const invalidProjectError = (() => {
      try {
        serverModule.parseMcpServerArgs(["--project", fileProject], tempProject);
        return null;
      } catch (error) {
        return error;
      }
    })();
    context.assert(
      invalidProjectError instanceof serverModule.McpStartupError,
      "MCP args reject non-directory project root",
    );
    context.assert(
      serverModule.formatMcpStartupError(invalidProjectError).includes("invalid_project"),
      "MCP startup error formatting includes invalid-project code",
    );
  } finally {
    rmSync(tempProject, { recursive: true, force: true });
  }

  const cliBundle = path.join(ROOT, "dist", "scripts", "strict-spec-driven.js");
  const mcpBundle = path.join(ROOT, "dist", "scripts", "strict-spec-driven-mcp.js");
  context.assert(existsSync(cliBundle), "build keeps existing strict CLI bundle");
  context.assert(existsSync(mcpBundle), "build emits dedicated MCP entrypoint bundle");

  const missingProjectStart = runCommand("node", [mcpBundle]);
  context.assert(missingProjectStart.status !== 0, "MCP bundle rejects startup without project root");
  context.assert(missingProjectStart.stderr.includes("missing_project"), "MCP bundle reports missing project root");

  const invalidProjectStart = runCommand("node", [mcpBundle, "--project", path.join(ROOT, "missing-mcp-project")]);
  context.assert(invalidProjectStart.status !== 0, "MCP bundle rejects missing project directory");
  context.assert(invalidProjectStart.stderr.includes("invalid_project"), "MCP bundle reports invalid project root");

  const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
  const quickstart = readFileSync(path.join(ROOT, "QUICKSTART.md"), "utf8");
  context.assert(readme.includes("strict-spec-driven-mcp.js"), "README documents MCP server launch");
  context.assert(readme.includes("strict://workflow/state"), "README documents representative MCP resource");
  context.assert(readme.includes("strict_review_change"), "README documents representative MCP prompt");
  context.assert(readme.includes("release-class"), "README documents mutating confirmation boundary");
  context.assert(readme.includes("confirm: true"), "README documents server-side confirmation requirement");
  context.assert(readme.includes("cancel_change") && readme.includes("destructive"), "README documents destructive cancel tool");
  context.assert(quickstart.includes("\"mcpServers\""), "Quick Start documents MCP client JSON configuration");
  context.assert(quickstart.includes("check_workflow_state"), "Quick Start documents read-only MCP request");
  context.assert(quickstart.includes("archive_change"), "Quick Start documents guarded mutating MCP request");
  context.assert(quickstart.includes("cancel_change"), "Quick Start documents destructive cancel request");
  context.assert(quickstart.includes("confirm"), "Quick Start documents confirmation requirement");

  const proposeSkill = readFileSync(path.join(ROOT, "skills", "strict-spec-propose", "SKILL.md"), "utf8");
  const applySkill = readFileSync(path.join(ROOT, "skills", "strict-spec-apply", "SKILL.md"), "utf8");
  const reviewSkill = readFileSync(path.join(ROOT, "skills", "strict-spec-review", "SKILL.md"), "utf8");
  const roadmapSkill = readFileSync(path.join(ROOT, "skills", "strict-roadmap-recommend", "SKILL.md"), "utf8");
  // The harness skill package was removed; HARNESS.md is the surviving surface that states the
  // secret boundary the prompt has to keep matching.
  const harnessDoc = readFileSync(path.join(ROOT, "HARNESS.md"), "utf8");
  const proposePrompt = promptsModule.renderStrictPrompt("strict_propose_change", {}).messages[0]?.content.text ?? "";
  const roadmapBackedPrompt = promptsModule.renderStrictPrompt("strict_propose_change", { roadmapItem: "5" }).messages[0]?.content.text ?? "";
  const applyPrompt = promptsModule.renderStrictPrompt("strict_apply_change", { change: "demo-change" }).messages[0]?.content.text ?? "";
  context.assert(proposeSkill.includes("check-workflow-state") && proposePrompt.includes("check-workflow-state"), "MCP propose prompt tracks skill workflow precheck");
  context.assert(
    roadmapSkill.includes("roadmap-recommend")
      && roadmapBackedPrompt.includes("strict-roadmap-recommend")
      && roadmapBackedPrompt.includes("roadmap-recommend --milestone")
      && roadmapBackedPrompt.includes("unambiguous numeric shorthand"),
    "MCP propose roadmap prompt tracks roadmap-backed skill guidance",
  );
  context.assert(applySkill.includes("next pending task") && applyPrompt.includes("next pending task"), "MCP apply prompt tracks skill next-pending-task wording");
  context.assert(reviewSkill.includes("complete project regression command") && reviewPrompt.includes("complete project regression command"), "MCP review prompt tracks regression gate wording");
  context.assert(
    roadmapSkill.includes("roadmap-recommend --milestone")
      && parameterizedRoadmapPrompt.includes("roadmap-recommend --milestone"),
    "MCP roadmap prompt tracks parameterized recommendation command",
  );
  context.assert(harnessDoc.includes("secrets_recorded: false") && harnessPrompt.includes("secrets_recorded: false"), "MCP harness prompt tracks secret boundary");
}
