export const MCP_SERVER_NAME = "strict-spec-driven";
export const MCP_SERVER_VERSION = "0.1.0";

export const MCP_SAFETY_CLASSES = ["read", "write", "lifecycle", "release", "destructive"] as const;
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
    description: "Check whether strict workflow state exists.",
    safety: "read",
    cliCommand: "check-workflow-state",
    mutates: false,
  },
  {
    name: "list_changes",
    description: "List active and archived strict changes.",
    safety: "read",
    cliCommand: "list",
    mutates: false,
  },
  {
    name: "ready_change",
    description: "Check proposal handoff readiness for a strict change.",
    safety: "read",
    cliCommand: "ready",
    mutates: false,
  },
  {
    name: "next_change_step",
    description: "Inspect deterministic next-step guidance for a strict change.",
    safety: "read",
    cliCommand: "next",
    mutates: false,
  },
  {
    name: "verify_change",
    description: "Verify a strict change.",
    safety: "read",
    cliCommand: "verify",
    mutates: false,
  },
  {
    name: "roadmap_status",
    description: "Report strict roadmap status.",
    safety: "read",
    cliCommand: "roadmap-status",
    mutates: false,
  },
  {
    name: "roadmap_overview",
    description: "Render strict roadmap overview.",
    safety: "read",
    cliCommand: "roadmap-overview",
    mutates: false,
  },
  {
    name: "roadmap_recommend",
    description: "Recommend the next strict roadmap change.",
    safety: "read",
    cliCommand: "roadmap-recommend",
    mutates: false,
  },
  {
    name: "verify_spec_mappings",
    description: "Audit strict spec implementation and test mappings.",
    safety: "read",
    cliCommand: "verify-spec-mappings",
    mutates: false,
  },
  {
    name: "verify_tech_mappings",
    description: "Audit strict technical-standard mappings.",
    safety: "read",
    cliCommand: "verify-tech-mappings",
    mutates: false,
  },
  {
    name: "tech_status",
    description: "Report strict technical-standard status.",
    safety: "read",
    cliCommand: "tech-status",
    mutates: false,
  },
  {
    name: "harness_plan",
    description: "Report harness execution plan.",
    safety: "read",
    cliCommand: "harness-plan",
    mutates: false,
  },
  {
    name: "harness_status",
    description: "Report harness runtime status.",
    safety: "read",
    cliCommand: "harness-status",
    mutates: false,
  },
  {
    name: "harness_logs",
    description: "Read bounded harness logs.",
    safety: "read",
    cliCommand: "harness-logs",
    mutates: false,
  },
];

export const MCP_MUTATING_TOOL_INVENTORY: McpCapabilityInventory["tools"] = [
  {
    name: "init_workflow",
    description: "Mutates project state by initializing strict workflow artifacts in the project root.",
    safety: "write",
    cliCommand: "init",
    mutates: true,
  },
  {
    name: "propose_change",
    description: "Mutates strict workflow state by creating a new change scaffold.",
    safety: "write",
    cliCommand: "propose",
    mutates: true,
  },
  {
    name: "generate_change_artifact",
    description: "Mutates strict workflow state by generating or updating a change planning artifact.",
    safety: "write",
    cliCommand: "generate",
    mutates: true,
  },
  {
    name: "mark_next_task_complete",
    description: "Mutates task state by marking the next pending strict change task complete.",
    safety: "write",
    cliCommand: "apply",
    mutates: true,
  },
  {
    name: "roadmap_sync",
    description: "Mutates roadmap artifacts by reconciling declared roadmap state with workflow history.",
    safety: "write",
    cliCommand: "roadmap-sync",
    mutates: true,
  },
  {
    name: "archive_change",
    description: "Performs a release-class mutation by archiving a verified strict change.",
    safety: "release",
    cliCommand: "archive",
    mutates: true,
  },
  {
    name: "cancel_change",
    description: "Performs a destructive mutation by permanently deleting an active strict change; requires confirmation.",
    safety: "destructive",
    cliCommand: "cancel",
    mutates: true,
  },
  {
    name: "harness_start",
    description: "Performs a lifecycle mutation by starting harness-managed project components.",
    safety: "lifecycle",
    cliCommand: "harness-start",
    mutates: true,
  },
  {
    name: "harness_stop",
    description: "Performs a lifecycle mutation by stopping harness-managed project components.",
    safety: "lifecycle",
    cliCommand: "harness-stop",
    mutates: true,
  },
  {
    name: "harness_session_create",
    description: "Mutates harness investigation state by creating a new harness session.",
    safety: "write",
    cliCommand: "harness-session",
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
  { name: "harness_declaration", uri: "strict://harness/declaration", description: "Strict harness declaration.", template: false },
];

export const MCP_PROMPT_INVENTORY: McpCapabilityInventory["prompts"] = [
  {
    name: "strict_propose_change",
    description: "Guide a strict change proposal using existing strict-spec-propose workflow rules.",
    arguments: [
      { name: "change", description: "Optional kebab-case strict change name.", required: false },
      { name: "summary", description: "Optional short description of the requested change.", required: false },
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
  {
    name: "strict_harness_investigation",
    description: "Guide a structured harness investigation session.",
    arguments: [
      { name: "session", description: "Harness session identifier.", required: true },
      { name: "environment", description: "Optional harness environment.", required: false },
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
