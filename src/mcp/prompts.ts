import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/server";
import { MCP_PROMPT_INVENTORY, type McpCapabilityInventory } from "./inventory.js";

type PromptMessageResult = {
  messages: Array<{
    role: "user";
    content: {
      type: "text";
      text: string;
    };
  }>;
};

type PromptArgs = Record<string, unknown>;

type McpPromptDefinition = McpCapabilityInventory["prompts"][number] & {
  argsSchema: z.ZodType;
  render: (args: PromptArgs) => string;
};

const optionalChangeSchema = z.strictObject({
  change: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
});
const changeSchema = z.strictObject({
  change: z.string().min(1),
});
const roadmapSchema = z.strictObject({
  roadmapItem: z.string().min(1).optional(),
});
const harnessSchema = z.strictObject({
  session: z.string().min(1),
  environment: z.string().min(1).optional(),
});

function promptInventory(name: string): McpCapabilityInventory["prompts"][number] {
  const inventory = MCP_PROMPT_INVENTORY.find((candidate) => candidate.name === name);
  if (!inventory) throw new Error(`missing MCP prompt inventory entry '${name}'`);
  return inventory;
}

function prompt(
  name: string,
  argsSchema: z.ZodType,
  render: (args: PromptArgs) => string,
): McpPromptDefinition {
  return {
    ...promptInventory(name),
    argsSchema,
    render,
  };
}

export const MCP_PROMPT_DEFINITIONS: McpPromptDefinition[] = [
  prompt("strict_propose_change", optionalChangeSchema, (args) => [
    typeof args.change === "string"
      ? `Use strict-spec-propose to create a strict YAML proposal for ${args.change}.`
      : "Use strict-spec-propose to create a strict YAML proposal.",
    args.summary ? `Requested change summary: ${args.summary}.` : "Derive the change name and scope from the user request when none is supplied.",
    "Run check-workflow-state first, generate proposal, design, questions, and delta-spec artifacts with named arguments, and keep open questions in questions.yaml.",
    "Run ready before implementation; do not treat proposal work as permission to change code.",
  ].join("\n")),
  prompt("strict_apply_change", changeSchema, (args) => [
    `Use strict-spec-apply for change ${String(args.change)}.`,
    "Read proposal.yaml, design.yaml, tasks.yaml, questions.yaml, delta specs, relevant main specs, and technical standards before editing.",
    "Implement only the next pending task, then run apply to mark that task complete after the work is actually done.",
    "Run each task command before marking testing tasks complete and preserve unchanged_behavior.",
  ].join("\n")),
  prompt("strict_review_change", changeSchema, (args) => [
    `Use strict-spec-review for change ${String(args.change)}.`,
    "Run verify first, then read every changed implementation, test, documentation, strict artifact, and relevant technical standard yourself.",
    "Prioritize correctness, spec alignment, test coverage, safety, and user-visible regressions.",
    "Do not recommend archive without direct code review evidence and the complete project regression command.",
  ].join("\n")),
  prompt("strict_archive_change", changeSchema, (args) => [
    `Use strict-spec-archive for change ${String(args.change)}.`,
    "Archive only after verify and verify-spec-mappings pass and review evidence confirms the complete regression command passed.",
    "Use the archive command so delta specs merge into main specs and roadmap state reconciles.",
    "Do not manually move change directories or bypass archive preconditions.",
  ].join("\n")),
  prompt("strict_roadmap_recommend", roadmapSchema, (args) => [
    "Use strict-roadmap-recommend to choose the next roadmap-backed strict change.",
    args.roadmapItem ? `User-provided roadmap hint: ${args.roadmapItem}.` : "Start with roadmap-recommend and treat the scripted recommendation as authoritative.",
    "Scaffold exactly one recommended planned change, link milestone and planned_change metadata, run ready, then continue through strict-spec-auto.",
    "Do not manually choose among roadmap candidates when the script returns a recommendation.",
  ].join("\n")),
  prompt("strict_harness_investigation", harnessSchema, (args) => [
    `Use strict-spec-harness-session for harness session ${String(args.session)}.`,
    args.environment ? `Target harness environment: ${args.environment}.` : "Select the environment from the harness declaration or user request.",
    "Run harness-plan before lifecycle commands, use harness-start/status/logs/stop or generated scripts, and record replayable evidence.",
    "For manual or sensitive steps, use human_checkpoints and manual_actions with secrets_recorded: false; never store secret values.",
  ].join("\n")),
];

export function createPromptInventory(): McpCapabilityInventory["prompts"] {
  return MCP_PROMPT_INVENTORY;
}

export function renderStrictPrompt(name: string, args: PromptArgs): PromptMessageResult {
  const definition = MCP_PROMPT_DEFINITIONS.find((candidate) => candidate.name === name);
  if (!definition) throw new Error(`unknown strict MCP prompt '${name}'`);
  const parsed = definition.argsSchema.parse(args);
  return {
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: definition.render(parsed as PromptArgs),
      },
    }],
  };
}

export function registerStrictPrompts(server: McpServer): void {
  for (const definition of MCP_PROMPT_DEFINITIONS) {
    server.registerPrompt(
      definition.name,
      {
        title: definition.name,
        description: definition.description,
        argsSchema: definition.argsSchema,
      },
      async (args) => renderStrictPrompt(definition.name, args as PromptArgs),
    );
  }
}
