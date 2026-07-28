import type { CliCommandMetadata } from "./command-metadata.js";

const CHANGE_NAME_ARG = {
  name: "change-name",
  description: "Kebab-case name of the strict change under .strict-spec-driven/changes/.",
  required: true,
} as const;

const VALIDITY_EXIT_CODES = [
  { code: 0, meaning: "The command succeeded and the reported result is valid." },
  { code: 1, meaning: "Usage error, runtime failure, or a result reporting valid: false." },
];

const SUCCESS_EXIT_CODES = [
  { code: 0, meaning: "The command succeeded." },
  { code: 1, meaning: "Usage error or runtime failure." },
];

export const COMMAND_METADATA_ENTRIES: Record<string, CliCommandMetadata> = {
  init: {
    name: "init",
    group: "workflow",
    summary: "Create the .strict-spec-driven/ scaffold in the current project root.",
    mcpDescription: "Mutates project state by initializing strict workflow artifacts in the project root.",
    usage: "Usage: strict-spec-cli init\n",
    arguments: [],
    flags: [],
    output: {
      format: "text",
      description: "Human-readable lines naming the initialized root and the created and skipped file counts.",
    },
    exitCodes: SUCCESS_EXIT_CODES,
    notes: ["Existing scaffold files are skipped, never overwritten."],
  },

  "check-workflow-state": {
    name: "check-workflow-state",
    group: "workflow",
    summary: "Report whether .strict-spec-driven/ exists and its config.yaml validates.",
    mcpDescription: "Check whether strict workflow state exists.",
    usage: "Usage: strict-spec-cli check-workflow-state\n",
    arguments: [],
    flags: [],
    output: {
      format: "text",
      description: "A confirmation line on stdout, or a missing-state error plus remediation hint on stderr.",
    },
    exitCodes: [
      { code: 0, meaning: "Workflow state exists and its config validates." },
      { code: 1, meaning: "Workflow state is missing or config.yaml is invalid." },
    ],
    notes: ["Run this before any other workflow command; run /strict-spec-init when it reports missing state."],
  },

  propose: {
    name: "propose",
    group: "change",
    summary: "Scaffold a new strict change directory with empty planning artifacts.",
    mcpDescription: "Mutates strict workflow state by creating a new change scaffold.",
    usage: "Usage: strict-spec-cli propose <change-name>\n",
    arguments: [CHANGE_NAME_ARG],
    flags: [],
    output: {
      format: "text",
      description: "The created change directory followed by each scaffolded planning artifact path.",
    },
    exitCodes: SUCCESS_EXIT_CODES,
    notes: ["Creates proposal.yaml, design.yaml, tasks.yaml, questions.yaml, and an empty specs/ directory."],
  },

  generate: {
    name: "generate",
    group: "generation",
    summary: "Write or merge a change planning artifact from named arguments.",
    mcpDescription: "Mutates strict workflow state by generating or updating a change planning artifact.",
    usage: [
      "Usage: strict-spec-cli generate <change-name> <proposal|design|questions|tasks|delta-spec|delta-tech> --<named-args>",
      "",
      "Examples:",
      "  strict-spec-cli generate <change-name> proposal --what <text> --why <text> [--in <text>] [--out <text>] [--unchanged <text>]",
      "  strict-spec-cli generate <change-name> design [--reset] --approach <text> [--decision <id> --decision-text <text> --rationale <text>]",
      "  strict-spec-cli generate <change-name> questions [--reset] [(--open <id> --question <text> --context <text>)|(--resolved <id> --question <text> --context <text> --answer <text>)|(--resolve <id> --answer <text>)]...",
      "  strict-spec-cli generate <change-name> tasks [--reset [--force]] [--section <Implementation|Testing|Verification> --task <id> [--text <text>] [--status <pending|complete>] [--command <text>]]... [--remove <id>]... [--validation-task <id>] [--unit-test-task <id>]",
      "  strict-spec-cli generate <change-name> delta-spec --target-spec <id> [--spec-path <path>] [--title <text> --new-spec-path <repo-relative-path>] [--reset] [--implementation <path>] [--test <path>] [--operation <ADDED|MODIFIED|REMOVED> --requirement <id> ...]...",
      "  strict-spec-cli generate <change-name> delta-tech --target-standard <id> [--tech-path <path>] [--reset] [--title <text> --category <cat>] [--implementation <path>] [--enforcement <path>] [--operation <ADDED|MODIFIED|REMOVED> --rule <id> --strength <MUST|SHOULD|MAY> --statement <text> --rationale <text> --method <lint|ci|test|review|manual> [--detail <text>] [--example-good <text>] [--example-bad <text>] [--exception <text>] | --rule <id> --reason <text>]...",
    ].join("\n") + "\n",
    arguments: [
      CHANGE_NAME_ARG,
      {
        name: "artifact",
        description: "One of proposal, design, questions, tasks, delta-spec, or delta-tech.",
        required: true,
      },
    ],
    flags: [
      {
        name: "--reset",
        arity: "boolean",
        description:
          "Rebuild the target artifact from scratch instead of merging into existing content; for tasks it refuses to discard completed tasks unless --force is also supplied, and it requires at least one task group.",
      },
      {
        name: "--force",
        arity: "boolean",
        description: "Allow a tasks --reset to discard tasks already recorded as complete.",
      },
      {
        name: "--section",
        arity: "value",
        valueLabel: "<Implementation|Testing|Verification>",
        description: "Opens a tasks group; the following --task, --text, --status, and --command belong to it.",
        repeatable: true,
        repeatSemantics: "Repeat once per task.",
      },
      {
        name: "--task",
        arity: "value",
        valueLabel: "<id>",
        description: "Kebab-case task id, upserted by (section, task id).",
        repeatable: true,
      },
      {
        name: "--text",
        arity: "value",
        valueLabel: "<text>",
        description: "Task text; required for a new task, optional when editing an existing one.",
        repeatable: true,
      },
      {
        name: "--status",
        arity: "value",
        valueLabel: "<pending|complete>",
        description: "Task status; defaults to pending and is preserved when omitted on an existing task.",
        repeatable: true,
      },
      {
        name: "--command",
        arity: "value",
        valueLabel: "<text>",
        description: "Runnable command recorded with the task.",
        repeatable: true,
      },
      {
        name: "--remove",
        arity: "value",
        valueLabel: "<id>",
        description: "Delete a task by id; removals run before upserts so a task can move sections in one call.",
        repeatable: true,
      },
      {
        name: "--validation-task",
        arity: "value",
        valueLabel: "<id>",
        description: "Set the validation testing gate; must name a task id in the Testing section.",
      },
      {
        name: "--unit-test-task",
        arity: "value",
        valueLabel: "<id>",
        description: "Set the unit-test testing gate; must name a task id in the Testing section.",
      },
    ],
    output: {
      format: "json",
      keys: ["changeName", "artifact", "artifactPath", "replaced", "valid", "diagnostics", "ready"],
      description: "A JSON result describing the write.",
    },
    exitCodes: [
      { code: 0, meaning: "The artifact was written." },
      { code: 1, meaning: "Usage error, unsupported argument, or a rejected merge." },
    ],
    notes: [
      "valid reports write success; ready (tasks only) reports completeness. A ready: false result is a successful write, not a failure, and must not be retried with --reset.",
      "Restating an existing (section, task id) is a field-level merge: it overwrites only the fields supplied, so status and command survive a text-only edit.",
      "Use the --flag=value form when a value begins with a dash, such as task text naming a CLI flag.",
      "A value beginning with @ is read from the file at that path.",
      "Repeating --scenario under one delta-spec requirement appends scenarios idempotently; --reset rebuilds the whole delta artifact.",
    ],
  },

  apply: {
    name: "apply",
    group: "change",
    summary: "Mark the next pending task in a change complete.",
    mcpDescription: "Mutates task state by marking the next pending strict change task complete.",
    usage: "Usage: strict-spec-cli apply <change-name>\n",
    arguments: [CHANGE_NAME_ARG],
    flags: [],
    output: {
      format: "json",
      keys: ["sectionName", "taskId", "totalTasks", "remainingPending"],
      description: "A JSON result naming the task that was marked complete.",
    },
    exitCodes: SUCCESS_EXIT_CODES,
    notes: ["This command mutates tasks.yaml; never run it merely to inspect status — use next instead."],
  },

  verify: {
    name: "verify",
    group: "change",
    summary: "Check a change's artifact structure, task completion, and open questions.",
    mcpDescription: "Verify a strict change.",
    usage: "Usage: strict-spec-cli verify <change-name>\n",
    arguments: [CHANGE_NAME_ARG],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics", "changeName", "totalTasks", "completeTasks", "remainingPending", "openQuestionCount"],
      description: "A JSON verification result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
    notes: ["At proposal time pending-task diagnostics are expected, because implementation has not started."],
  },

  ready: {
    name: "ready",
    group: "workflow",
    summary: "Report whether a change is ready to hand off from proposal to implementation.",
    mcpDescription: "Check proposal handoff readiness for a strict change.",
    usage: "Usage: strict-spec-cli ready <change-name>\n",
    arguments: [CHANGE_NAME_ARG],
    flags: [],
    output: {
      format: "json",
      keys: ["changeName", "ready", "diagnostics", "suggestions"],
      description: "A JSON readiness result with deterministic blockers and suggested commands.",
    },
    exitCodes: [
      { code: 0, meaning: "The change is ready for implementation handoff." },
      { code: 1, meaning: "Usage error, runtime failure, or a change that is not ready." },
    ],
  },

  next: {
    name: "next",
    group: "workflow",
    summary: "Report deterministic workflow state, blockers, and suggested next commands.",
    mcpDescription: "Inspect deterministic next-step guidance for a strict change.",
    usage: "Usage: strict-spec-cli next <change-name>\n",
    arguments: [CHANGE_NAME_ARG],
    flags: [],
    output: {
      format: "json",
      keys: ["changeName", "valid", "totalTasks", "completeTasks", "remainingPending", "openQuestionCount", "blockers", "suggestions"],
      description: "A JSON workflow-state result.",
    },
    exitCodes: SUCCESS_EXIT_CODES,
    notes: ["Read-only: unlike apply, this never mutates tasks.yaml."],
  },

  "verify-spec-mappings": {
    name: "verify-spec-mappings",
    group: "operations",
    summary: "Audit that strict spec implementation and test mappings resolve to real files.",
    mcpDescription: "Audit strict spec implementation and test mappings.",
    usage: "Usage: strict-spec-cli verify-spec-mappings\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON audit result listing unresolved mapping entries.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "verify-tech-mappings": {
    name: "verify-tech-mappings",
    group: "operations",
    summary: "Audit that technical-standard implementation and enforcement mappings resolve to real files.",
    mcpDescription: "Audit strict technical-standard mappings.",
    usage: "Usage: strict-spec-cli verify-tech-mappings\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON audit result listing unresolved mapping entries.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "tech-status": {
    name: "tech-status",
    group: "operations",
    summary: "Report the registered technical standards with their rules and strengths.",
    mcpDescription: "Report strict technical-standard status.",
    usage: "Usage: strict-spec-cli tech-status\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: ["techDirExists", "standardCount", "ruleCount", "strengthCounts", "standards"],
      description: "A JSON summary of .strict-spec-driven/tech/.",
    },
    exitCodes: SUCCESS_EXIT_CODES,
  },

  "architecture-generate": {
    name: "architecture-generate",
    group: "operations",
    summary: "Render ARCHITECTURE.md from the architecture artifact, the spec index, and the technical standards.",
    mcpDescription: "Mutates project state by rendering the generated architecture document, unless --check is supplied.",
    usage: "Usage: strict-spec-cli architecture-generate [--check] [--output <path>]\n",
    arguments: [],
    flags: [
      {
        name: "--check",
        arity: "boolean",
        description:
          "Compare the rendered document against the file on disk without writing it; exits non-zero when they differ or the file is absent, and names the source artifacts that went stale.",
      },
      {
        name: "--output",
        arity: "value",
        valueLabel: "<path>",
        description:
          "Repo-relative path to render instead of ARCHITECTURE.md; check mode compares against this same path. Accepts the --output=<path> form.",
      },
    ],
    output: {
      format: "json",
      keys: ["outputPath", "mode", "written", "documentExists", "current", "sources", "staleSources"],
      description: "A JSON render result naming the output path, the mode, and the source artifacts.",
    },
    exitCodes: [
      { code: 0, meaning: "The document was written, or check mode found it current." },
      {
        code: 1,
        meaning:
          "Usage error, a missing or invalid architecture artifact, or check mode finding the document stale or absent.",
      },
    ],
    notes: [
      "Neither flag is repeatable and there is no reset semantics: each run renders the whole document from its sources.",
      "The rendered document carries a generated banner and must never be hand-edited; change the sources and re-render.",
      "Fails rather than degrading when .strict-spec-driven/architecture.yaml is missing; run /strict-spec-architecture to author it.",
    ],
  },

  "architecture-status": {
    name: "architecture-status",
    group: "operations",
    summary: "Validate the architecture artifact and report its counts and implementation-mapping drift.",
    mcpDescription: "Report strict architecture artifact status.",
    usage: "Usage: strict-spec-cli architecture-status\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: [
        "artifactPath",
        "exists",
        "valid",
        "diagnostics",
        "componentCount",
        "dataFlowCount",
        "decisionCount",
        "mappingDrift",
      ],
      description: "A JSON summary of .strict-spec-driven/architecture.yaml with schema diagnostics and mapping drift.",
    },
    exitCodes: [
      { code: 0, meaning: "The architecture artifact exists and validates." },
      { code: 1, meaning: "Usage error, a missing architecture artifact, or a schema-invalid artifact." },
    ],
    notes: ["Read-only: mapping drift is reported, never repaired."],
  },

  "design-generate": {
    name: "design-generate",
    group: "operations",
    summary: "Render DESIGN.md in the design.md format from the design-system artifact.",
    mcpDescription: "Mutates project state by rendering the generated design document, unless --check is supplied.",
    usage: "Usage: strict-spec-cli design-generate [--check] [--output <path>]\n",
    arguments: [],
    flags: [
      {
        name: "--check",
        arity: "boolean",
        description:
          "Compare the rendered document against the file on disk without writing it; exits non-zero when they differ or the file is absent, and names the source artifact that went stale.",
      },
      {
        name: "--output",
        arity: "value",
        valueLabel: "<path>",
        description:
          "Repo-relative path to render instead of DESIGN.md; check mode compares against this same path. Accepts the --output=<path> form.",
      },
    ],
    output: {
      format: "json",
      keys: ["outputPath", "mode", "written", "documentExists", "current", "sources", "staleSources"],
      description: "A JSON render result naming the output path, the mode, and the source artifacts.",
    },
    exitCodes: [
      { code: 0, meaning: "The document was written, or check mode found it current." },
      {
        code: 1,
        meaning:
          "Usage error, a missing or invalid design-system artifact, or check mode finding the document stale or absent.",
      },
    ],
    notes: [
      "Neither flag is repeatable and there is no reset semantics: each run renders the whole document from its source.",
      "The rendered document leads with YAML front-matter tokens, then a generated banner, then the canonical design.md sections; it must never be hand-edited.",
      "Sections whose token group is absent from the artifact are omitted rather than rendered empty.",
      "Fails rather than degrading when .strict-spec-driven/design-system.yaml is missing; run /strict-spec-design to author it. The artifact is optional, so projects with no user interface simply do not have one.",
    ],
  },

  "design-status": {
    name: "design-status",
    group: "operations",
    summary: "Validate the design-system artifact and report its token counts and mapping drift.",
    mcpDescription: "Report strict design-system artifact status.",
    usage: "Usage: strict-spec-cli design-status\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: [
        "artifactPath",
        "exists",
        "valid",
        "diagnostics",
        "tokenGroupCount",
        "tokenCount",
        "componentCount",
        "mappingDrift",
      ],
      description: "A JSON summary of .strict-spec-driven/design-system.yaml with schema diagnostics and mapping drift.",
    },
    exitCodes: [
      { code: 0, meaning: "The design-system artifact exists and validates." },
      { code: 1, meaning: "Usage error, a missing design-system artifact, or a schema-invalid artifact." },
    ],
    notes: [
      "Read-only: mapping drift is reported, never repaired.",
      "Mapping drift covers both component implementation paths and component visual-regression snapshot paths; each entry names the declaring component and its kind.",
    ],
  },

  "validate-skills": {
    name: "validate-skills",
    group: "operations",
    summary: "Validate bundled strict skill packaging under skills/.",
    usage: "Usage: strict-spec-cli validate-skills\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON packaging-validation result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "schema-list": {
    name: "schema-list",
    group: "assets",
    summary: "List the bundled strict YAML schema asset keys.",
    usage: "Usage: strict-spec-cli schema-list\n",
    arguments: [],
    flags: [],
    output: { format: "text", description: "One schema key per line." },
    exitCodes: SUCCESS_EXIT_CODES,
  },

  "schema-show": {
    name: "schema-show",
    group: "assets",
    summary: "Print a bundled strict YAML schema asset.",
    usage: "Usage: strict-spec-cli schema-show <schema-name|schema-key>\n",
    arguments: [
      {
        name: "schema-name|schema-key",
        description: "Bare schema name such as proposal, or a full bundled key.",
        required: true,
      },
    ],
    flags: [],
    output: { format: "text", description: "The raw schema file content." },
    exitCodes: [
      { code: 0, meaning: "The schema asset was found and printed." },
      { code: 1, meaning: "Usage error or unknown schema asset." },
    ],
  },

  "sample-list": {
    name: "sample-list",
    group: "assets",
    summary: "List the bundled minimal valid strict YAML sample keys.",
    usage: "Usage: strict-spec-cli sample-list\n",
    arguments: [],
    flags: [],
    output: { format: "text", description: "One sample key per line." },
    exitCodes: SUCCESS_EXIT_CODES,
  },

  "sample-show": {
    name: "sample-show",
    group: "assets",
    summary: "Print a bundled minimal valid strict YAML sample artifact.",
    usage: "Usage: strict-spec-cli sample-show <sample-name|sample-key>\n",
    arguments: [
      {
        name: "sample-name|sample-key",
        description: "Bare sample name, or a full bundled example key.",
        required: true,
      },
    ],
    flags: [],
    output: { format: "text", description: "The raw sample file content." },
    exitCodes: [
      { code: 0, meaning: "The sample asset was found and printed." },
      { code: 1, meaning: "Usage error or unknown sample asset." },
    ],
  },

  "template-list": {
    name: "template-list",
    group: "assets",
    summary: "List every bundled strict scaffold and schema template key.",
    usage: "Usage: strict-spec-cli template-list\n",
    arguments: [],
    flags: [],
    output: { format: "text", description: "One template key per line." },
    exitCodes: SUCCESS_EXIT_CODES,
  },

  "template-show": {
    name: "template-show",
    group: "assets",
    summary: "Print a bundled strict scaffold or schema template.",
    usage: "Usage: strict-spec-cli template-show <template-key>\n",
    arguments: [
      {
        name: "template-key",
        description: "Template key, with or without the strict-spec-driven/ prefix.",
        required: true,
      },
    ],
    flags: [],
    output: { format: "text", description: "The raw template file content." },
    exitCodes: [
      { code: 0, meaning: "The template asset was found and printed." },
      { code: 1, meaning: "Usage error or unknown template asset." },
    ],
  },

  "harness-infer": {
    name: "harness-infer",
    group: "harness",
    summary: "Draft .strict-spec-driven/harness.yaml from repository metadata without running components.",
    usage: "Usage: strict-spec-cli harness-infer [--write] [--force]\n",
    arguments: [],
    flags: [
      { name: "--write", arity: "boolean", description: "Write the inferred harness.yaml instead of only reporting it." },
      { name: "--force", arity: "boolean", description: "Overwrite an existing harness.yaml when writing." },
    ],
    output: {
      format: "json",
      keys: ["ok", "diagnostics"],
      description: "A JSON inference result.",
    },
    exitCodes: [
      { code: 0, meaning: "Inference succeeded." },
      { code: 1, meaning: "Usage error or failed inference." },
    ],
  },

  "harness-doctor": {
    name: "harness-doctor",
    group: "harness",
    summary: "Diagnose and optionally repair the harness declaration.",
    usage: "Usage: strict-spec-cli harness-doctor [--fix]\n",
    arguments: [],
    flags: [{ name: "--fix", arity: "boolean", description: "Apply the safe repairs the diagnosis identifies." }],
    output: {
      format: "json",
      keys: ["ok", "diagnostics"],
      description: "A JSON diagnosis result.",
    },
    exitCodes: [
      { code: 0, meaning: "The harness declaration is healthy." },
      { code: 1, meaning: "Usage error or unresolved harness problems." },
    ],
  },

  "harness-plan": {
    name: "harness-plan",
    group: "harness",
    summary: "Report the harness execution plan without starting any component.",
    mcpDescription: "Report harness execution plan.",
    usage: "Usage: strict-spec-cli harness-plan [--environment <id>] [--component <id> ...]\n",
    arguments: [],
    flags: [
      { name: "--environment", arity: "value", valueLabel: "<id>", description: "Select the declared environment to plan." },
      {
        name: "--component",
        arity: "value",
        valueLabel: "<id>",
        description: "Restrict the plan to specific declared components.",
        repeatable: true,
        repeatSemantics: "Repeat to select several components.",
      },
    ],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON plan describing declared long-running commands.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
    notes: ["Run this before harness-start and explain the declared commands before starting them."],
  },

  "harness-start": {
    name: "harness-start",
    group: "harness",
    summary: "Start declared harness components.",
    mcpDescription: "Performs a lifecycle mutation by starting harness-managed project components.",
    usage: "Usage: strict-spec-cli harness-start [--environment <id>] [--component <id> ...] [--confirm]\n",
    arguments: [],
    flags: [
      { name: "--environment", arity: "value", valueLabel: "<id>", description: "Select the declared environment to start." },
      {
        name: "--component",
        arity: "value",
        valueLabel: "<id>",
        description: "Restrict startup to specific declared components.",
        repeatable: true,
        repeatSemantics: "Repeat to select several components.",
      },
      { name: "--confirm", arity: "boolean", description: "Confirm a lifecycle mutation that starts real processes." },
    ],
    output: {
      format: "json",
      keys: ["ok", "diagnostics"],
      description: "A JSON startup result.",
    },
    exitCodes: [
      { code: 0, meaning: "The selected components started." },
      { code: 1, meaning: "Usage error or failed startup." },
    ],
  },

  "harness-stop": {
    name: "harness-stop",
    group: "harness",
    summary: "Stop all harness-managed components.",
    mcpDescription: "Performs a lifecycle mutation by stopping harness-managed project components.",
    usage: "Usage: strict-spec-cli harness-stop [--confirm]\n",
    arguments: [],
    flags: [{ name: "--confirm", arity: "boolean", description: "Confirm a lifecycle mutation that stops running processes." }],
    output: {
      format: "json",
      keys: ["ok", "diagnostics"],
      description: "A JSON shutdown result.",
    },
    exitCodes: [
      { code: 0, meaning: "The components stopped." },
      { code: 1, meaning: "Usage error, component selection arguments, or failed shutdown." },
    ],
    notes: ["This command stops every managed component and rejects --environment or --component selection."],
  },

  "harness-status": {
    name: "harness-status",
    group: "harness",
    summary: "Report harness runtime status for declared components.",
    mcpDescription: "Report harness runtime status.",
    usage: "Usage: strict-spec-cli harness-status\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: ["ok", "diagnostics"],
      description: "A JSON runtime-status result.",
    },
    exitCodes: [
      { code: 0, meaning: "Status was reported successfully." },
      { code: 1, meaning: "Usage error or status could not be determined." },
    ],
  },

  "harness-logs": {
    name: "harness-logs",
    group: "harness",
    summary: "Read bounded logs captured from harness components.",
    mcpDescription: "Read bounded harness logs.",
    usage: "Usage: strict-spec-cli harness-logs [component-id] [--tail <n> | --all]\n",
    arguments: [
      {
        name: "component-id",
        description: "Declared component whose log should be read; defaults to all captured components.",
        required: false,
      },
    ],
    flags: [
      { name: "--tail", arity: "value", valueLabel: "<n>", description: "Return only the last n lines." },
      { name: "--all", arity: "boolean", description: "Return the full captured log instead of a bounded tail." },
    ],
    output: {
      format: "text",
      description: "Captured log content on stdout, or a JSON error result when the log cannot be read.",
    },
    exitCodes: [
      { code: 0, meaning: "Log content was returned." },
      { code: 1, meaning: "Usage error or the log could not be read." },
    ],
    notes: ["--tail and --all are mutually exclusive."],
  },

  "harness-scripts": {
    name: "harness-scripts",
    group: "harness",
    summary: "Generate or verify project-local harness scripts.",
    usage: "Usage: strict-spec-cli harness-scripts <generate|verify>\n",
    arguments: [
      { name: "generate|verify", description: "Whether to write the scripts or check the existing ones.", required: true },
    ],
    flags: [],
    output: {
      format: "json",
      keys: ["ok", "diagnostics"],
      description: "A JSON script generation or verification result.",
    },
    exitCodes: [
      { code: 0, meaning: "Scripts were generated or verified successfully." },
      { code: 1, meaning: "Usage error or failed generation or verification." },
    ],
  },

  "harness-session": {
    name: "harness-session",
    group: "harness",
    summary: "Create, validate, or archive a harness investigation session.",
    mcpDescription: "Mutates harness investigation state by creating a new harness session.",
    usage: "Usage: strict-spec-cli harness-session <create|validate|archive> <session-id|session.yaml>\n",
    arguments: [
      { name: "create|validate|archive", description: "The session lifecycle action to perform.", required: true },
      { name: "session-id|session.yaml", description: "Session id, or a path to a session.yaml file.", required: true },
    ],
    output: {
      format: "json",
      keys: ["ok", "diagnostics"],
      description: "A JSON session lifecycle result.",
    },
    flags: [],
    exitCodes: [
      { code: 0, meaning: "The session action succeeded." },
      { code: 1, meaning: "Usage error or failed session action." },
    ],
  },

  "mcp-install": {
    name: "mcp-install",
    group: "mcp",
    summary: "Register the strict MCP server with one or more agent clients.",
    usage:
      "Usage: strict-spec-cli mcp-install --client <claude-code|codex|opencode|copilot|json|all> " +
      "[--client <...>] [--scope <project|user>] [--name <entry-name>] [--project <path>] [--config <path>]\n",
    arguments: [],
    flags: [
      {
        name: "--client",
        arity: "value",
        valueLabel: "<claude-code|codex|opencode|copilot|json|all>",
        description: "Target client; all expands to every named client except json.",
        required: true,
        repeatable: true,
        repeatSemantics: "Repeat to register several clients in one run.",
      },
      { name: "--scope", arity: "value", valueLabel: "<project|user>", description: "Registration scope; defaults to project." },
      { name: "--name", arity: "value", valueLabel: "<entry-name>", description: "Server entry name; defaults to strict-spec-driven." },
      { name: "--project", arity: "value", valueLabel: "<path>", description: "Project root used to resolve project-scoped config." },
      { name: "--config", arity: "value", valueLabel: "<path>", description: "Explicit config file path; required for the json client." },
    ],
    output: {
      format: "json",
      keys: ["results"],
      description: "A JSON result listing each client's registration status.",
    },
    exitCodes: [
      { code: 0, meaning: "Every selected client was registered or intentionally skipped." },
      { code: 1, meaning: "Usage error or a client registration error." },
    ],
  },

  migrate: {
    name: "migrate",
    group: "migration",
    summary: "Convert a legacy .spec-driven/ Markdown workflow into .strict-spec-driven/ YAML.",
    usage: "Usage: strict-spec-cli migrate\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON migration report on stdout, with timestamped progress lines on stderr.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
    notes: ["The legacy .spec-driven/ directory is read as input and is never modified."],
  },

  "roadmap-generate": {
    name: "roadmap-generate",
    group: "roadmap",
    summary: "Create or update a roadmap milestone or planned change.",
    usage: [
      "Usage: strict-spec-cli roadmap-generate milestone --id <milestone-id> --title <text> --goal <text> --intake-question \"id|question|context|impact|recommendation\" [--scope-in <text>] [--scope-out <text>] [--done <text>] [--dependency <text>] [--risk <text>] [--note <text>] [--details <text>] [--reset] [--reset-intake-questions]",
      "       strict-spec-cli roadmap-generate planned-change --milestone <milestone-id> --id <planned-change-id> --summary <text> --details <text> [--depends-on <planned-change-id>] [--status <planned|complete>] [--reset]",
      "",
      "Notes:",
      "  New milestones require at least one --intake-question value.",
      "  Repeat --intake-question to append structured milestone clarification questions.",
      "  Existing scalar fields with different values require --reset.",
      "  List fields append unique values by default; with --reset, supplied list fields replace existing values.",
      "  --reset never removes or replaces existing intake questions; --intake-question values always merge additively unless --reset-intake-questions is supplied.",
      "  --reset-intake-questions replaces the milestone's intake_questions with exactly the supplied --intake-question values and requires at least one of them.",
      "  planned-change writes the artifact at its canonical filename <milestone-id>-<planned-change-id>.yaml under roadmap/planned-changes/ (the milestone prefix is not duplicated when the id already starts with it); callers never choose filenames.",
    ].join("\n") + "\n",
    arguments: [
      { name: "milestone|planned-change", description: "Which roadmap artifact kind to generate.", required: true },
    ],
    flags: [
      { name: "--id", arity: "value", valueLabel: "<id>", description: "Milestone or planned-change id.", required: true },
      { name: "--milestone", arity: "value", valueLabel: "<milestone-id>", description: "Owning milestone; required for planned-change." },
      { name: "--title", arity: "value", valueLabel: "<text>", description: "Milestone title." },
      { name: "--goal", arity: "value", valueLabel: "<text>", description: "Milestone goal." },
      {
        name: "--intake-question",
        arity: "value",
        valueLabel: "\"id|question|context|impact|recommendation\"",
        description: "Pipe-delimited milestone clarification question with all five fields.",
        repeatable: true,
        repeatSemantics: "Repeated values merge additively unless --reset-intake-questions is supplied.",
      },
      { name: "--scope-in", arity: "value", valueLabel: "<text>", description: "In-scope item.", repeatable: true, repeatSemantics: "Appends unique values." },
      { name: "--scope-out", arity: "value", valueLabel: "<text>", description: "Out-of-scope item.", repeatable: true, repeatSemantics: "Appends unique values." },
      { name: "--done", arity: "value", valueLabel: "<text>", description: "Done criterion.", repeatable: true, repeatSemantics: "Appends unique values." },
      { name: "--dependency", arity: "value", valueLabel: "<text>", description: "Milestone dependency.", repeatable: true, repeatSemantics: "Appends unique values." },
      { name: "--risk", arity: "value", valueLabel: "<text>", description: "Milestone risk.", repeatable: true, repeatSemantics: "Appends unique values." },
      { name: "--note", arity: "value", valueLabel: "<text>", description: "Milestone note.", repeatable: true, repeatSemantics: "Appends unique values." },
      { name: "--details", arity: "value", valueLabel: "<text>", description: "Long-form details." },
      { name: "--summary", arity: "value", valueLabel: "<text>", description: "Planned-change summary." },
      { name: "--depends-on", arity: "value", valueLabel: "<planned-change-id>", description: "Planned-change dependency.", repeatable: true },
      { name: "--status", arity: "value", valueLabel: "<planned|complete>", description: "Planned-change status." },
      { name: "--reset", arity: "boolean", description: "Replace conflicting scalar fields and supplied list fields instead of merging." },
      { name: "--reset-intake-questions", arity: "boolean", description: "Replace intake questions with exactly the supplied values; requires at least one." },
    ],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON generation result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "roadmap-status": {
    name: "roadmap-status",
    group: "roadmap",
    summary: "Report roadmap milestone and planned-change status as JSON.",
    mcpDescription: "Report strict roadmap status.",
    usage: "Usage: strict-spec-cli roadmap-status\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "warnings", "diagnostics", "milestones"],
      description: "A JSON roadmap status result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "roadmap-overview": {
    name: "roadmap-overview",
    group: "roadmap",
    summary: "Render the roadmap status as a human-readable overview.",
    mcpDescription: "Render strict roadmap overview.",
    usage: "Usage: strict-spec-cli roadmap-overview\n",
    arguments: [],
    flags: [],
    output: { format: "text", description: "A formatted roadmap overview on stdout." },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "roadmap-sync": {
    name: "roadmap-sync",
    group: "roadmap",
    summary: "Reconcile roadmap state against active and archived changes.",
    mcpDescription: "Mutates roadmap artifacts by reconciling declared roadmap state with workflow history.",
    usage: "Usage: strict-spec-cli roadmap-sync [--materialize-planned-changes] [--fix-names]\n",
    arguments: [],
    flags: [
      {
        name: "--materialize-planned-changes",
        arity: "boolean",
        description: "Write inline milestone planned changes out as standalone planned-change artifacts.",
      },
      { name: "--fix-names", arity: "boolean", description: "Rename planned-change files to their canonical milestone-prefixed names." },
    ],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON reconciliation result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
    notes: ["Roadmap commands never write change artifacts; drift is reported as a warning naming the repairing command."],
  },

  "roadmap-reorder": {
    name: "roadmap-reorder",
    group: "roadmap",
    summary: "Change one active milestone's order value.",
    usage: "Usage: strict-spec-cli roadmap-reorder <milestone-id> (--before <milestone-id> | --after <milestone-id> | --order <integer>)\n",
    arguments: [{ name: "milestone-id", description: "The milestone to move.", required: true }],
    flags: [
      { name: "--before", arity: "value", valueLabel: "<milestone-id>", description: "Place the milestone immediately before this neighbor." },
      { name: "--after", arity: "value", valueLabel: "<milestone-id>", description: "Place the milestone immediately after this neighbor." },
      { name: "--order", arity: "value", valueLabel: "<integer>", description: "Set an explicit integer order value." },
    ],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON reorder result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
    notes: ["Supply exactly one of --before, --after, or --order."],
  },

  "roadmap-renumber": {
    name: "roadmap-renumber",
    group: "roadmap",
    summary: "Renumber active milestone order values into a dense sequence.",
    usage: "Usage: strict-spec-cli roadmap-renumber\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON renumber result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "roadmap-move-planned-change": {
    name: "roadmap-move-planned-change",
    group: "roadmap",
    summary: "Move a planned change to another milestone and rename it canonically.",
    usage: "Usage: strict-spec-cli roadmap-move-planned-change <planned-change-id> --milestone <milestone-id> [--allow-complete]\n",
    arguments: [{ name: "planned-change-id", description: "The planned change to move.", required: true }],
    flags: [
      { name: "--milestone", arity: "value", valueLabel: "<milestone-id>", description: "Destination milestone.", required: true },
      { name: "--allow-complete", arity: "boolean", description: "Permit moving a planned change already marked complete." },
    ],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON move result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "roadmap-recommend": {
    name: "roadmap-recommend",
    group: "roadmap",
    summary: "Recommend the next roadmap-backed planned change to work on.",
    mcpDescription: "Recommend the next strict roadmap change.",
    usage: "Usage: strict-spec-cli roadmap-recommend [--details] [--milestone <milestone-id>]\n",
    arguments: [],
    flags: [
      { name: "--details", arity: "boolean", description: "Return the full candidate evaluation instead of the summary." },
      { name: "--milestone", arity: "value", valueLabel: "<milestone-id>", description: "Restrict candidates to one milestone." },
    ],
    output: {
      format: "json",
      keys: ["valid", "status", "warnings", "diagnostics", "recommendation", "candidateSummary", "blockers", "detailsCommand"],
      description: "A JSON recommendation summary, or the full result with --details.",
    },
    exitCodes: [
      { code: 0, meaning: "A planned change was recommended." },
      { code: 1, meaning: "Usage error, or no planned change could be recommended." },
    ],
  },

  "roadmap-archive": {
    name: "roadmap-archive",
    group: "roadmap",
    summary: "Archive completed milestones and their completed planned changes.",
    usage: "Usage: strict-spec-cli roadmap-archive [milestone-id]\n",
    arguments: [
      {
        name: "milestone-id",
        description: "Milestone to archive; defaults to every unarchived completed milestone.",
        required: false,
      },
    ],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON archive result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "roadmap-reopen": {
    name: "roadmap-reopen",
    group: "roadmap",
    summary: "Reopen a completed milestone and seed a follow-up planned change.",
    usage: "Usage: strict-spec-cli roadmap-reopen <milestone-id> [--reason \"...\"]\n",
    arguments: [{ name: "milestone-id", description: "The completed milestone to reopen.", required: true }],
    flags: [{ name: "--reason", arity: "value", valueLabel: "<text>", description: "Recorded reason for reopening." }],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON reopen result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
    notes: ["Completed planned changes are preserved."],
  },

  "roadmap-pause": {
    name: "roadmap-pause",
    group: "roadmap",
    summary: "Pause a milestone so it is held out of recommendation and forced blocked.",
    usage: "Usage: strict-spec-cli roadmap-pause <milestone-id> [--reason \"...\"]\n",
    arguments: [{ name: "milestone-id", description: "The milestone to pause.", required: true }],
    flags: [{ name: "--reason", arity: "value", valueLabel: "<text>", description: "Recorded reason for pausing." }],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON pause result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
    notes: ["The pause is sticky until roadmap-resume clears it."],
  },

  "roadmap-resume": {
    name: "roadmap-resume",
    group: "roadmap",
    summary: "Clear a milestone's pause so it re-derives status and re-enters recommendation.",
    usage: "Usage: strict-spec-cli roadmap-resume <milestone-id> [--reason \"...\"]\n",
    arguments: [{ name: "milestone-id", description: "The paused milestone to resume.", required: true }],
    flags: [{ name: "--reason", arity: "value", valueLabel: "<text>", description: "Recorded reason for resuming." }],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON resume result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "sop-create": {
    name: "sop-create",
    group: "sop",
    summary: "Create a schema-validated standard operating procedure.",
    usage:
      "Usage: strict-spec-cli sop-create --title <text> --category <id> --purpose <text> --trigger <text> --scope-in <text>... --success <text>... --step-id <id> --step-actor <text> --step-action <text> --step-expected <text> [step/role/branch/exception/escalation/link flags]\n",
    arguments: [],
    flags: [
      { name: "--title", arity: "value", valueLabel: "<text>", description: "SOP title.", required: true },
      { name: "--category", arity: "value", valueLabel: "<id>", description: "SOP category id.", required: true },
      { name: "--purpose", arity: "value", valueLabel: "<text>", description: "Why the procedure exists.", required: true },
      { name: "--trigger", arity: "value", valueLabel: "<text>", description: "What causes the procedure to run.", required: true },
      { name: "--scope-in", arity: "value", valueLabel: "<text>", description: "In-scope item; at least one required.", required: true, repeatable: true },
      { name: "--scope-out", arity: "value", valueLabel: "<text>", description: "Out-of-scope item.", repeatable: true },
      { name: "--success", arity: "value", valueLabel: "<text>", description: "Success criterion; at least one required.", required: true, repeatable: true },
      { name: "--classification", arity: "value", valueLabel: "<text>", description: "Handling classification." },
      { name: "--prerequisite", arity: "value", valueLabel: "<text>", description: "Prerequisite condition.", repeatable: true },
      { name: "--step-id", arity: "value", valueLabel: "<id>", description: "Step id; at least one step is required.", required: true, repeatable: true, repeatSemantics: "Repeat with the other --step-* flags once per step, in order." },
      { name: "--step-actor", arity: "value", valueLabel: "<text>", description: "Who performs the step.", required: true, repeatable: true },
      { name: "--step-action", arity: "value", valueLabel: "<text>", description: "What the step does.", required: true, repeatable: true },
      { name: "--step-expected", arity: "value", valueLabel: "<text>", description: "Expected result of the step.", required: true, repeatable: true },
      { name: "--role-id", arity: "value", valueLabel: "<id>", description: "Role id.", repeatable: true, repeatSemantics: "Repeat with --role-name and --role-responsibility once per role." },
      { name: "--role-name", arity: "value", valueLabel: "<text>", description: "Role display name.", repeatable: true },
      { name: "--role-responsibility", arity: "value", valueLabel: "<text>", description: "What the role is responsible for.", repeatable: true },
      { name: "--branch-step", arity: "value", valueLabel: "<step-id>", description: "Step that owns a conditional branch; must match a --step-id.", repeatable: true, repeatSemantics: "Repeat with --branch-condition and --branch-goto once per branch." },
      { name: "--branch-condition", arity: "value", valueLabel: "<text>", description: "Condition that selects the branch.", repeatable: true },
      { name: "--branch-goto", arity: "value", valueLabel: "<step-id>", description: "Step the branch jumps to.", repeatable: true },
      { name: "--exception-condition", arity: "value", valueLabel: "<text>", description: "Exception condition.", repeatable: true, repeatSemantics: "Repeat with --exception-handling once per exception." },
      { name: "--exception-handling", arity: "value", valueLabel: "<text>", description: "How the exception is handled.", repeatable: true },
      { name: "--escalation-trigger", arity: "value", valueLabel: "<text>", description: "What triggers escalation.", repeatable: true, repeatSemantics: "Repeat with --escalation-to and --escalation-action once per escalation." },
      { name: "--escalation-to", arity: "value", valueLabel: "<text>", description: "Who the escalation goes to.", repeatable: true },
      { name: "--escalation-action", arity: "value", valueLabel: "<text>", description: "Action taken on escalation.", repeatable: true },
      { name: "--output", arity: "value", valueLabel: "<text>", description: "Artifact the procedure produces.", repeatable: true },
      { name: "--reference-label", arity: "value", valueLabel: "<text>", description: "Reference label.", repeatable: true, repeatSemantics: "Repeat with --reference-target once per reference." },
      { name: "--reference-target", arity: "value", valueLabel: "<text>", description: "Reference target.", repeatable: true },
      { name: "--link-kind", arity: "value", valueLabel: "<text>", description: "Link kind.", repeatable: true, repeatSemantics: "Repeat with --link-target once per link." },
      { name: "--link-target", arity: "value", valueLabel: "<text>", description: "Link target.", repeatable: true },
    ],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON SOP creation result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
    notes: [
      "Grouped flags are zipped positionally: the nth --step-id pairs with the nth --step-actor, --step-action, and --step-expected.",
      "Step order is assigned from the order the --step-id values are supplied.",
    ],
  },

  "sop-list": {
    name: "sop-list",
    group: "sop",
    summary: "List the registered standard operating procedures.",
    usage: "Usage: strict-spec-cli sop-list\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON list of registered SOPs.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "sop-show": {
    name: "sop-show",
    group: "sop",
    summary: "Show one standard operating procedure.",
    usage: "Usage: strict-spec-cli sop-show <sop-id>\n",
    arguments: [{ name: "sop-id", description: "The SOP to show.", required: true }],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON SOP document result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "sop-edit": {
    name: "sop-edit",
    group: "sop",
    summary: "Edit the header fields of an existing standard operating procedure.",
    usage:
      "Usage: strict-spec-cli sop-edit <sop-id> [--title <text>] [--purpose <text>] [--trigger <text>] [--scope-in <text>]... [--scope-out <text>]... [--success <text>]...\n",
    arguments: [{ name: "sop-id", description: "The SOP to edit.", required: true }],
    flags: [
      { name: "--title", arity: "value", valueLabel: "<text>", description: "Replacement title." },
      { name: "--purpose", arity: "value", valueLabel: "<text>", description: "Replacement purpose." },
      { name: "--trigger", arity: "value", valueLabel: "<text>", description: "Replacement trigger." },
      { name: "--scope-in", arity: "value", valueLabel: "<text>", description: "Replacement in-scope item.", repeatable: true },
      { name: "--scope-out", arity: "value", valueLabel: "<text>", description: "Replacement out-of-scope item.", repeatable: true },
      { name: "--success", arity: "value", valueLabel: "<text>", description: "Replacement success criterion.", repeatable: true },
    ],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON SOP edit result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "sop-validate": {
    name: "sop-validate",
    group: "sop",
    summary: "Validate one or all standard operating procedures against the SOP schema.",
    usage: "Usage: strict-spec-cli sop-validate [<sop-id>]\n",
    arguments: [
      { name: "sop-id", description: "The SOP to validate; defaults to every registered SOP.", required: false },
    ],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON validation result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "sop-category-list": {
    name: "sop-category-list",
    group: "sop",
    summary: "List the available SOP categories.",
    usage: "Usage: strict-spec-cli sop-category-list\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON list of SOP categories.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  "sop-category-show": {
    name: "sop-category-show",
    group: "sop",
    summary: "Show one SOP category definition.",
    usage: "Usage: strict-spec-cli sop-category-show <category-id>\n",
    arguments: [{ name: "category-id", description: "The category to show.", required: true }],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON SOP category result.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  maintenance: {
    name: "maintenance",
    group: "migration",
    summary: "Run the configured maintenance checks against strict workflow repository state.",
    usage: "Usage: strict-spec-cli maintenance\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON maintenance report.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
  },

  ship: {
    name: "ship",
    group: "operations",
    summary: "Summarize an archived change and snapshot roadmap state for a focused commit.",
    usage: "Usage: strict-spec-cli ship <change-name>\n",
    arguments: [
      {
        name: "change-name",
        description: "Archived change name, or the full YYYY-MM-DD-<name> archive directory.",
        required: true,
      },
    ],
    flags: [],
    output: {
      format: "json",
      keys: ["changeName", "archivePath", "proposalSummary", "roadmapSnapshot"],
      description: "A JSON ship summary.",
    },
    exitCodes: [
      { code: 0, meaning: "The archived change was resolved and summarized." },
      { code: 1, meaning: "Usage error, unknown archived change, or an ambiguous bare name." },
    ],
    notes: ["This command never runs git; it only prepares commit material."],
  },

  "commit-and-push": {
    name: "commit-and-push",
    group: "operations",
    summary: "Commit all changes for the most recent archived change and push.",
    usage: "Usage: strict-spec-cli commit-and-push\n",
    arguments: [],
    flags: [],
    output: {
      format: "json",
      keys: ["changeName", "archiveDir", "commitMessage", "pushed", "pushError"],
      description: "A JSON result describing the commit and push outcome.",
    },
    exitCodes: [
      { code: 0, meaning: "The commit was created and pushed." },
      { code: 1, meaning: "Usage error, no archived changes, nothing to commit, or a failed git operation." },
    ],
    notes: [
      "Runs git add ., git commit, and git push against the whole working tree.",
      "The commit message is derived as feat: <archived change name>.",
    ],
  },

  archive: {
    name: "archive",
    group: "change",
    summary: "Archive a verified change, merging delta artifacts into the main specs and standards.",
    mcpDescription: "Performs a release-class mutation by archiving a verified strict change.",
    usage: "Usage: strict-spec-cli archive <change-name>\n",
    arguments: [CHANGE_NAME_ARG],
    flags: [],
    output: {
      format: "json",
      keys: ["valid", "diagnostics"],
      description: "A JSON archive result describing merged artifacts and reconciled roadmap state.",
    },
    exitCodes: VALIDITY_EXIT_CODES,
    notes: ["An empty specs/ directory is allowed and does not block archive."],
  },

  list: {
    name: "list",
    group: "change",
    summary: "List active and archived strict changes.",
    mcpDescription: "List active and archived strict changes.",
    usage: "Usage: strict-spec-cli list\n",
    arguments: [],
    flags: [],
    output: { format: "text", description: "Active changes with status, then archived change directories." },
    exitCodes: SUCCESS_EXIT_CODES,
  },

  modify: {
    name: "modify",
    group: "change",
    summary: "List active changes, or show one change's artifact paths.",
    usage: "Usage: strict-spec-cli modify [change-name|archive-dir]\n",
    arguments: [
      {
        name: "change-name|archive-dir",
        description: "Active change name or exact archive directory; omit to list active changes.",
        required: false,
      },
    ],
    flags: [],
    output: { format: "text", description: "Active change list, or the target change's artifact paths." },
    exitCodes: [
      { code: 0, meaning: "The listing or artifact inventory was printed." },
      { code: 1, meaning: "Usage error, unknown change, or a bare name that only matches archived directories." },
    ],
    notes: ["Archived targets require the exact YYYY-MM-DD-<name> directory name."],
  },

  cancel: {
    name: "cancel",
    group: "change",
    summary: "Permanently delete an active change directory.",
    mcpDescription:
      "Performs a destructive mutation by permanently deleting an active strict change; requires confirmation.",
    usage: "Usage: strict-spec-cli cancel <change-name>\n",
    arguments: [CHANGE_NAME_ARG],
    flags: [],
    output: { format: "text", description: "The deleted change directory path." },
    exitCodes: [
      { code: 0, meaning: "The active change was deleted." },
      { code: 1, meaning: "Usage error, unknown change, or an archived target." },
    ],
    notes: ["Deletion is irreversible and is limited to active changes; archived changes cannot be cancelled."],
  },
};
