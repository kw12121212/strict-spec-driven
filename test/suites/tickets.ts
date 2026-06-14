import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { cli, loadDistModule, TestContext, type YamlModule } from "../support/harness.js";

type TicketsModule = {
  deriveTicketId: (input: { title: string; problem: string; desiredOutcome: string }) => string;
};

function makeWorkspace(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-tickets-"));
  mkdirSync(path.join(root, ".strict-spec-driven", "tickets"), { recursive: true });
  return root;
}

function makeRoadmapWorkspace(): string {
  const root = makeWorkspace();
  const roadmapDir = path.join(root, ".strict-spec-driven", "roadmap");
  mkdirSync(path.join(roadmapDir, "milestones"), { recursive: true });
  writeFileSync(
    path.join(roadmapDir, "INDEX.yaml"),
    [
      "schema: strict-spec-driven/roadmap-index/v2",
      "schema_version: 2",
      "artifact_type: roadmap_index",
      "schema_file: ../schemas/roadmap-index.yaml",
      "milestones: {}",
      "",
    ].join("\n"),
    "utf8",
  );
  return root;
}

function parseJson(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

function createTicketViaCli(root: string, title: string, problem: string, desiredOutcome: string): string {
  const result = cli(
    ["ticket-create", "--title", title, "--problem", problem, "--desired-outcome", desiredOutcome],
    { cwd: root },
  );
  return parseJson(result.stdout).ticketId as string;
}

export async function runTicketsSuite(context: TestContext): Promise<void> {
  const ticketsModule = await loadDistModule<TicketsModule>("tickets.js");
  const yamlModule = await loadDistModule<YamlModule>("yaml.js");
  const yamlParse = (text: string): Record<string, unknown> => yamlModule.parseYamlDocument<Record<string, unknown>>(text);

  context.section("[tickets] conflict-resistant content-derived ids");

  const idA = ticketsModule.deriveTicketId({
    title: "Export changes as CSV",
    problem: "no tabular snapshot",
    desiredOutcome: "a CSV listing",
  });
  const idAgain = ticketsModule.deriveTicketId({
    title: "Export changes as CSV",
    problem: "no tabular snapshot",
    desiredOutcome: "a CSV listing",
  });
  const idB = ticketsModule.deriveTicketId({
    title: "Add dark mode",
    problem: "no dark theme",
    desiredOutcome: "a dark theme toggle",
  });
  context.assert(idA === idAgain, "ticket id is deterministic for identical requirement content");
  context.assert(idA !== idB, "ticket id differs for different requirement content");
  context.assert(/-[0-9a-f]{6}$/.test(idA), "ticket id carries a content-hash suffix rather than a sequential counter");
  context.assert(idA.startsWith("export-changes-as-csv-"), "ticket id is derived from a slug of the title");

  context.section("[tickets] ticket-create");

  const createRoot = makeWorkspace();
  const created = cli(
    [
      "ticket-create",
      "--title",
      "Export changes as CSV",
      "--problem",
      "Operators cannot get a tabular snapshot of strict changes.",
      "--desired-outcome",
      "A user can obtain a CSV listing of strict changes.",
      "--label",
      "reporting",
    ],
    { cwd: createRoot },
  );
  context.assert(created.status === 0, "ticket-create exits zero for a complete requirement");
  const createdJson = parseJson(created.stdout);
  context.assert(createdJson.created === true, "ticket-create reports the ticket as newly created");
  context.assert(typeof createdJson.ticketId === "string", "ticket-create reports a generated ticket id");
  context.assert(
    typeof createdJson.path === "string" && existsSync(path.join(createRoot, createdJson.path as string)),
    "ticket-create writes the ticket file at the reported path",
  );
  context.assert(
    existsSync(path.join(createRoot, ".strict-spec-driven", "tickets", "INDEX.yaml")),
    "ticket-create maintains the tickets index",
  );

  const recreated = cli(
    [
      "ticket-create",
      "--title",
      "Export changes as CSV",
      "--problem",
      "Operators cannot get a tabular snapshot of strict changes.",
      "--desired-outcome",
      "A user can obtain a CSV listing of strict changes.",
    ],
    { cwd: createRoot },
  );
  context.assert(recreated.status === 0, "ticket-create rerun exits zero");
  const recreatedJson = parseJson(recreated.stdout);
  context.assert(recreatedJson.created === false, "ticket-create rerun does not create a second ticket");
  context.assert(recreatedJson.ticketId === createdJson.ticketId, "ticket-create rerun resolves the same ticket id");

  const incomplete = cli(
    ["ticket-create", "--title", "Missing outcome", "--problem", "something is wrong"],
    { cwd: makeWorkspace() },
  );
  context.assert(incomplete.status !== 0, "ticket-create rejects an incomplete requirement");

  context.section("[tickets] ticket-list / ticket-show / ticket-validate");

  const list = cli(["ticket-list"], { cwd: createRoot });
  context.assert(list.status === 0, "ticket-list exits zero");
  const listJson = parseJson(list.stdout);
  const listTickets = listJson.tickets as Array<{ id: string; status: string; title: string; path: string }>;
  context.assert(Array.isArray(listTickets) && listTickets.length === 1, "ticket-list enumerates the created ticket");
  context.assert(listTickets[0].status === "open", "ticket-list reports the open status");

  const emptyList = cli(["ticket-list"], { cwd: makeWorkspace() });
  context.assert(emptyList.status === 0, "ticket-list on empty state exits zero");
  context.assert(
    (parseJson(emptyList.stdout).tickets as unknown[]).length === 0,
    "ticket-list on empty state reports no tickets",
  );

  const show = cli(["ticket-show", createdJson.ticketId as string], { cwd: createRoot });
  context.assert(show.status === 0, "ticket-show exits zero for an existing ticket");
  context.assert(
    (parseJson(show.stdout).ticket as Record<string, unknown>) !== null,
    "ticket-show returns the ticket contents",
  );

  const showMissing = cli(["ticket-show", "does-not-exist-000000"], { cwd: createRoot });
  context.assert(showMissing.status !== 0, "ticket-show exits non-zero for an unknown ticket id");

  const validate = cli(["ticket-validate"], { cwd: createRoot });
  context.assert(validate.status === 0, "ticket-validate passes for valid tickets");

  const malformedRoot = makeWorkspace();
  writeFileSync(
    path.join(malformedRoot, ".strict-spec-driven", "tickets", "broken-000000.yaml"),
    "schema: strict-spec-driven/ticket/v1\nschema_version: 1\nartifact_type: ticket\nschema_file: x\nticket:\n  id: broken-000000\n",
    "utf8",
  );
  const validateBroken = cli(["ticket-validate"], { cwd: malformedRoot });
  context.assert(validateBroken.status !== 0, "ticket-validate fails for a malformed ticket");
  const brokenValidateJson = parseJson(validateBroken.stdout);
  context.assert(
    Array.isArray(brokenValidateJson.diagnostics) && (brokenValidateJson.diagnostics as unknown[]).length > 0,
    "ticket-validate reports path-aware diagnostics for a malformed ticket",
  );

  const unknownStatusRoot = makeWorkspace();
  writeFileSync(
    path.join(unknownStatusRoot, ".strict-spec-driven", "tickets", "badstatus-000000.yaml"),
    [
      "schema: strict-spec-driven/ticket/v1",
      "schema_version: 1",
      "artifact_type: ticket",
      "schema_file: templates/strict-spec-driven/schemas/ticket.yaml",
      "ticket:",
      "  id: badstatus-000000",
      "  title: Bad status ticket",
      "requirement:",
      "  problem: p",
      "  desired_outcome: o",
      "status: not_a_real_status",
      'created_at: "2026-06-13T00:00:00Z"',
      "",
    ].join("\n"),
    "utf8",
  );
  const validateUnknownStatus = cli(["ticket-validate", "badstatus-000000"], { cwd: unknownStatusRoot });
  context.assert(validateUnknownStatus.status !== 0, "ticket-validate rejects a ticket with an unknown status enum");
  rmSync(unknownStatusRoot, { recursive: true, force: true });

  context.section("[tickets] ticket-resolve dispatch transitions");

  const roadmapRoot = makeRoadmapWorkspace();
  const promoteTicket = createTicketViaCli(roadmapRoot, "Add CSV export", "no tabular export", "a CSV export exists");
  const promote = cli(
    ["ticket-resolve", promoteTicket, "--outcome", "not_implemented", "--rationale", "not found in specs, code, or docs"],
    { cwd: roadmapRoot },
  );
  context.assert(promote.status === 0, "ticket-resolve promote exits zero");
  const promoteJson = parseJson(promote.stdout);
  context.assert(promoteJson.status === "promoted", "promote sets ticket status to promoted");
  context.assert(promoteJson.milestoneCreated === true, "promote creates a milestone");
  const milestoneId = promoteJson.milestoneId as string;
  context.assert(/^\d{4}-/.test(milestoneId), "promote allocates a 4-digit milestone id");
  const milestoneFile = path.join(roadmapRoot, ".strict-spec-driven", "roadmap", "milestones", `${milestoneId}.yaml`);
  context.assert(existsSync(milestoneFile), "promote writes the milestone file");
  const milestoneArtifact = yamlParse(readFileSync(milestoneFile, "utf8"));
  context.assert(milestoneArtifact.source_ticket === promoteTicket, "milestone records the source-ticket back-reference");
  context.assert(milestoneArtifact.goal === "a CSV export exists", "milestone goal is copied from the ticket desired outcome");
  context.assert(milestoneArtifact.status === "proposed", "promoted milestone status is proposed");
  const milestoneScope = milestoneArtifact.scope as { in: string[]; out: string[] };
  context.assert(
    milestoneScope.in.some((entry) => entry.includes("REFINEMENT NEEDED")),
    "promoted milestone scope is left as an explicit refinement stub",
  );
  const promotedTicketShow = parseJson(cli(["ticket-show", promoteTicket], { cwd: roadmapRoot }).stdout);
  const promotedTicketArtifact = promotedTicketShow.ticket as Record<string, unknown>;
  context.assert(
    (promotedTicketArtifact.provenance as Record<string, unknown>)?.promoted_to === milestoneId,
    "ticket records promoted_to pointing at the milestone",
  );
  const roadmapIndex = yamlParse(
    readFileSync(path.join(roadmapRoot, ".strict-spec-driven", "roadmap", "INDEX.yaml"), "utf8"),
  ) as { milestones: Record<string, unknown> };
  context.assert(milestoneId in roadmapIndex.milestones, "promotion registers the milestone in the roadmap index");

  const promoteAgain = cli(
    ["ticket-resolve", promoteTicket, "--outcome", "not_implemented", "--rationale", "re-running dispatch"],
    { cwd: roadmapRoot },
  );
  const promoteAgainJson = parseJson(promoteAgain.stdout);
  context.assert(promoteAgainJson.milestoneCreated === false, "re-promoting a ticket does not create a second milestone");
  context.assert(promoteAgainJson.milestoneId === milestoneId, "re-promotion returns the existing milestone id");

  const secondTicket = createTicketViaCli(roadmapRoot, "Add JSON export", "no json export", "a JSON export exists");
  const secondPromote = parseJson(
    cli(["ticket-resolve", secondTicket, "--outcome", "not_implemented", "--rationale", "absent"], { cwd: roadmapRoot }).stdout,
  );
  context.assert(
    (secondPromote.milestoneId as string) !== milestoneId
      && /^\d{4}-/.test(secondPromote.milestoneId as string),
    "a second promotion allocates a distinct sequential milestone number",
  );

  const implementedTicket = createTicketViaCli(roadmapRoot, "Already done feature", "thought it was missing", "it works");
  const implemented = parseJson(
    cli(
      [
        "ticket-resolve",
        implementedTicket,
        "--outcome",
        "implemented",
        "--rationale",
        "covered by existing spec",
        "--evidence-label",
        "spec",
        "--evidence-target",
        ".strict-spec-driven/specs/ticket/domain-behavior.yaml",
      ],
      { cwd: roadmapRoot },
    ).stdout,
  );
  context.assert(implemented.status === "implemented", "implemented decision closes the ticket");
  const implementedShow = parseJson(cli(["ticket-show", implementedTicket], { cwd: roadmapRoot }).stdout);
  const implementedArtifact = implementedShow.ticket as Record<string, unknown>;
  context.assert(
    ((implementedArtifact.provenance as Record<string, unknown>)?.implemented_by as unknown[])?.length === 1,
    "implemented decision records evidence links",
  );

  const rejectedTicket = createTicketViaCli(roadmapRoot, "Unwanted feature", "someone asked", "not pursued");
  const rejected = parseJson(
    cli(["ticket-resolve", rejectedTicket, "--outcome", "not_wanted", "--rationale", "out of product scope"], { cwd: roadmapRoot }).stdout,
  );
  context.assert(rejected.status === "rejected", "not-wanted decision rejects the ticket");
  const rejectedShow = parseJson(cli(["ticket-show", rejectedTicket], { cwd: roadmapRoot }).stdout);
  const rejectedArtifact = rejectedShow.ticket as Record<string, unknown>;
  context.assert(
    (rejectedArtifact.dispatch_decision as Record<string, unknown>)?.rationale === "out of product scope",
    "not-wanted decision preserves the rationale in the dispatch-decision record",
  );

  const resolveMissing = cli(["ticket-resolve", "nope-000000", "--outcome", "implemented", "--rationale", "x"], { cwd: roadmapRoot });
  context.assert(resolveMissing.status !== 0, "ticket-resolve exits non-zero for an unknown ticket");
  const resolveBadOutcome = cli(["ticket-resolve", promoteTicket, "--outcome", "maybe", "--rationale", "x"], { cwd: roadmapRoot });
  context.assert(resolveBadOutcome.status !== 0, "ticket-resolve rejects an invalid outcome");

  rmSync(createRoot, { recursive: true, force: true });
  rmSync(malformedRoot, { recursive: true, force: true });
  rmSync(roadmapRoot, { recursive: true, force: true });
}
