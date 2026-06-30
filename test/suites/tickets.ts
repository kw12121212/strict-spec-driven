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
  const ticketFilePath = (root: string, ticketId: string): string =>
    path.join(root, ".strict-spec-driven", "tickets", `${ticketId}.yaml`);
  const rewriteTicketTimes = (root: string, ticketId: string, createdAt: string, updatedAt = createdAt): void => {
    const filePath = ticketFilePath(root, ticketId);
    const artifact = yamlParse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    artifact.created_at = createdAt;
    artifact.updated_at = updatedAt;
    writeFileSync(filePath, yamlModule.stringifyYamlDocument(artifact), "utf8");
  };

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
  const createdTicketArtifact = yamlParse(readFileSync(path.join(createRoot, createdJson.path as string), "utf8"));
  context.assert(
    typeof createdTicketArtifact.created_at === "string" && createdTicketArtifact.created_at.length > 0,
    "ticket-create records created_at",
  );
  context.assert(
    createdTicketArtifact.updated_at === createdTicketArtifact.created_at,
    "ticket-create initializes updated_at to the creation timestamp",
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
  context.assert(!("createdAt" in listTickets[0]), "ticket-list does not expose its internal created_at sort key");

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
      'updated_at: "2026-06-13T00:00:00Z"',
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
  rewriteTicketTimes(roadmapRoot, promoteTicket, "2026-06-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z");
  const promote = cli(
    ["ticket-resolve", promoteTicket, "--outcome", "not_implemented", "--rationale", "not found in specs, code, or docs"],
    { cwd: roadmapRoot },
  );
  context.assert(promote.status === 0, "ticket-resolve promote exits zero");
  const promoteJson = parseJson(promote.stdout);
  context.assert(promoteJson.status === "promoted", "promote sets ticket status to promoted");
  context.assert(promoteJson.milestoneCreated === true, "promote creates a milestone");
  context.assert(
    promoteJson.ticketPath === `.strict-spec-driven/tickets/archived/${promoteTicket}.yaml`
      && existsSync(path.join(roadmapRoot, promoteJson.ticketPath as string)),
    "promote archives the resolved ticket",
  );
  context.assert(
    !existsSync(path.join(roadmapRoot, ".strict-spec-driven", "tickets", `${promoteTicket}.yaml`)),
    "promote removes the ticket from the active tickets directory",
  );
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
  context.assert(promotedTicketArtifact.created_at === "2026-06-01T00:00:00.000Z", "ticket-resolve preserves created_at");
  context.assert(
    typeof promotedTicketArtifact.updated_at === "string" && promotedTicketArtifact.updated_at !== "2026-06-01T00:00:00.000Z",
    "ticket-resolve refreshes updated_at on the archived ticket",
  );
  context.assert(
    (promotedTicketArtifact.provenance as Record<string, unknown>)?.promoted_to === milestoneId,
    "ticket records promoted_to pointing at the milestone",
  );
  const promotedTicketValidate = cli(["ticket-validate", promoteTicket], { cwd: roadmapRoot });
  context.assert(promotedTicketValidate.status === 0, "ticket-validate can validate an archived promoted ticket by id");
  const activeTicketsAfterPromote = parseJson(cli(["ticket-list"], { cwd: roadmapRoot }).stdout).tickets as unknown[];
  context.assert(
    activeTicketsAfterPromote.every((entry) => (entry as { id: string }).id !== promoteTicket),
    "ticket-list omits archived promoted tickets from active ticket state",
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
  context.assert(
    existsSync(path.join(roadmapRoot, ".strict-spec-driven", "tickets", "archived", `${secondTicket}.yaml`)),
    "a second promotion archives the second resolved ticket",
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
  context.assert(
    implemented.ticketPath === `.strict-spec-driven/tickets/archived/${implementedTicket}.yaml`
      && existsSync(path.join(roadmapRoot, implemented.ticketPath as string)),
    "implemented decision archives the resolved ticket",
  );
  context.assert(
    !existsSync(path.join(roadmapRoot, ".strict-spec-driven", "tickets", `${implementedTicket}.yaml`)),
    "implemented decision removes the active ticket file",
  );
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
  context.assert(
    rejected.ticketPath === `.strict-spec-driven/tickets/archived/${rejectedTicket}.yaml`
      && existsSync(path.join(roadmapRoot, rejected.ticketPath as string)),
    "not-wanted decision archives the resolved ticket",
  );
  context.assert(
    !existsSync(path.join(roadmapRoot, ".strict-spec-driven", "tickets", `${rejectedTicket}.yaml`)),
    "not-wanted decision removes the active ticket file",
  );
  const rejectedShow = parseJson(cli(["ticket-show", rejectedTicket], { cwd: roadmapRoot }).stdout);
  const rejectedArtifact = rejectedShow.ticket as Record<string, unknown>;
  context.assert(
    (rejectedArtifact.dispatch_decision as Record<string, unknown>)?.rationale === "out of product scope",
    "not-wanted decision preserves the rationale in the dispatch-decision record",
  );
  const recreateArchived = cli(
    ["ticket-create", "--title", "Unwanted feature", "--problem", "someone asked", "--desired-outcome", "not pursued"],
    { cwd: roadmapRoot },
  );
  const recreateArchivedJson = parseJson(recreateArchived.stdout);
  context.assert(
    recreateArchived.status === 0
      && recreateArchivedJson.created === false
      && recreateArchivedJson.path === `.strict-spec-driven/tickets/archived/${rejectedTicket}.yaml`,
    "ticket-create remains idempotent when the matching ticket is archived",
  );

  const resolveMissing = cli(["ticket-resolve", "nope-000000", "--outcome", "implemented", "--rationale", "x"], { cwd: roadmapRoot });
  context.assert(resolveMissing.status !== 0, "ticket-resolve exits non-zero for an unknown ticket");
  const resolveBadOutcome = cli(["ticket-resolve", promoteTicket, "--outcome", "maybe", "--rationale", "x"], { cwd: roadmapRoot });
  context.assert(resolveBadOutcome.status !== 0, "ticket-resolve rejects an invalid outcome");

  context.section("[tickets] ticket-edit");

  const editRoot = makeWorkspace();
  const editCreate = parseJson(
    cli(
      [
        "ticket-create",
        "--title",
        "Initial title",
        "--problem",
        "initial problem",
        "--desired-outcome",
        "initial outcome",
        "--intent",
        "initial intent",
        "--label",
        "alpha",
        "--label",
        "beta",
        "--external-label",
        "gh",
        "--external-target",
        "https://example.com/1",
      ],
      { cwd: editRoot },
    ).stdout,
  );
  const editId = editCreate.ticketId as string;
  rewriteTicketTimes(editRoot, editId, "2026-06-10T00:00:00.000Z", "2026-06-10T00:00:00.000Z");
  const beforeEdit = (parseJson(cli(["ticket-show", editId], { cwd: editRoot }).stdout).ticket as Record<string, unknown>);
  const originalCreatedAt = beforeEdit.created_at as string;
  const originalUpdatedAt = beforeEdit.updated_at as string;

  const edited = cli(
    [
      "ticket-edit",
      editId,
      "--title",
      "Refined title",
      "--problem",
      "refined problem",
      "--desired-outcome",
      "refined outcome",
      "--intent",
      "refined intent",
    ],
    { cwd: editRoot },
  );
  context.assert(edited.status === 0, "ticket-edit exits zero for a valid edit");
  const editedJson = parseJson(edited.stdout);
  context.assert(editedJson.edited === true, "ticket-edit reports the ticket as edited");
  const editedTicket = editedJson.ticket as Record<string, any>;
  context.assert(editedTicket.ticket.title === "Refined title", "ticket-edit updates the title");
  context.assert(editedTicket.requirement.problem === "refined problem", "ticket-edit updates the problem");
  context.assert(editedTicket.requirement.desired_outcome === "refined outcome", "ticket-edit updates the desired outcome");
  context.assert(editedTicket.requirement.intent === "refined intent", "ticket-edit updates the intent");
  context.assert(editedTicket.ticket.id === editId, "ticket-edit keeps the ticket id stable");
  context.assert(editedTicket.status === "open", "ticket-edit keeps the ticket status unchanged");
  context.assert(editedTicket.created_at === originalCreatedAt, "ticket-edit preserves created_at");
  context.assert(editedTicket.updated_at !== originalUpdatedAt, "ticket-edit refreshes updated_at");

  const showAfterEdit = parseJson(cli(["ticket-show", editId], { cwd: editRoot }).stdout).ticket as Record<string, any>;
  context.assert(showAfterEdit.ticket.title === "Refined title", "ticket-edit persists the updated title to disk");

  const editIndex = yamlParse(
    readFileSync(path.join(editRoot, ".strict-spec-driven", "tickets", "INDEX.yaml"), "utf8"),
  ) as { tickets: Record<string, { title: string }> };
  context.assert(editIndex.tickets[editId].title === "Refined title", "ticket-edit refreshes the tickets index with the new title");

  const orderRoot = makeWorkspace();
  const laterTicket = createTicketViaCli(orderRoot, "Later ticket", "later problem", "later outcome");
  const sameTimeB = createTicketViaCli(orderRoot, "Same time B", "same b problem", "same b outcome");
  const sameTimeA = createTicketViaCli(orderRoot, "Same time A", "same a problem", "same a outcome");
  rewriteTicketTimes(orderRoot, laterTicket, "2026-06-12T00:00:00.000Z");
  rewriteTicketTimes(orderRoot, sameTimeB, "2026-06-11T00:00:00.000Z");
  rewriteTicketTimes(orderRoot, sameTimeA, "2026-06-11T00:00:00.000Z");
  const expectedChronologicalIds = [sameTimeA, sameTimeB].sort().concat(laterTicket);
  const rebuildOrder = cli(["ticket-edit", laterTicket, "--title", "Later ticket"], { cwd: orderRoot });
  context.assert(rebuildOrder.status === 0, "ticket-edit rebuilds the tickets index after manual fixture timestamp setup");
  const orderedIndex = yamlParse(readFileSync(path.join(orderRoot, ".strict-spec-driven", "tickets", "INDEX.yaml"), "utf8")) as {
    tickets: Record<string, unknown>;
  };
  context.assert(
    JSON.stringify(Object.keys(orderedIndex.tickets)) === JSON.stringify(expectedChronologicalIds),
    "tickets INDEX.yaml is ordered by created_at with ticket id as the tie-breaker",
  );
  const orderedList = parseJson(cli(["ticket-list"], { cwd: orderRoot }).stdout).tickets as Array<{ id: string }>;
  context.assert(
    JSON.stringify(orderedList.map((entry) => entry.id)) === JSON.stringify(expectedChronologicalIds),
    "ticket-list output is ordered by created_at with ticket id as the tie-breaker",
  );

  const cleared = parseJson(
    cli(["ticket-edit", editId, "--clear-intent", "--clear-labels", "--clear-external-tracker"], { cwd: editRoot }).stdout,
  ).ticket as Record<string, any>;
  context.assert(cleared.requirement.intent === undefined, "--clear-intent removes the intent");
  context.assert(cleared.labels === undefined, "--clear-labels removes the labels");
  context.assert(cleared.external_tracker === undefined, "--clear-external-tracker removes the external tracker");
  context.assert(cleared.requirement.problem === "refined problem", "clearing optional fields leaves the required fields intact");

  const relabeled = parseJson(cli(["ticket-edit", editId, "--label", "gamma"], { cwd: editRoot }).stdout).ticket as Record<string, any>;
  context.assert(
    JSON.stringify(relabeled.labels) === JSON.stringify(["gamma"]),
    "ticket-edit replaces the label set with the provided labels",
  );

  const editUnknown = cli(["ticket-edit", "does-not-exist-000000", "--title", "x"], { cwd: editRoot });
  context.assert(editUnknown.status !== 0, "ticket-edit exits non-zero for an unknown ticket id");
  context.assert(
    /not found/.test(JSON.stringify(parseJson(editUnknown.stdout).diagnostics)),
    "ticket-edit reports a not-found diagnostic for an unknown id",
  );

  const noopEdit = cli(["ticket-edit", editId], { cwd: editRoot });
  context.assert(noopEdit.status !== 0, "ticket-edit requires at least one editable field");

  const conflictEdit = cli(["ticket-edit", editId, "--intent", "x", "--clear-intent"], { cwd: editRoot });
  context.assert(conflictEdit.status !== 0, "ticket-edit rejects combining a set value with its clear flag");

  const blankEdit = cli(["ticket-edit", editId, "--title", ""], { cwd: editRoot });
  context.assert(blankEdit.status !== 0, "ticket-edit rejects a blank required field");

  const persistedAfterRejections = parseJson(cli(["ticket-show", editId], { cwd: editRoot }).stdout).ticket as Record<string, any>;
  context.assert(
    persistedAfterRejections.ticket.title === "Refined title",
    "rejected ticket-edit invocations leave the ticket file unchanged",
  );

  const archRoot = makeWorkspace();
  const archTicket = createTicketViaCli(archRoot, "Done already", "thought missing", "it works");
  cli(["ticket-resolve", archTicket, "--outcome", "not_wanted", "--rationale", "out of scope"], { cwd: archRoot });
  const editArchived = cli(["ticket-edit", archTicket, "--title", "new"], { cwd: archRoot });
  context.assert(editArchived.status !== 0, "ticket-edit refuses to edit a resolved/archived ticket");
  context.assert(
    /archived/.test(JSON.stringify(parseJson(editArchived.stdout).diagnostics)),
    "ticket-edit distinguishes a resolved ticket from an unknown id",
  );

  rmSync(editRoot, { recursive: true, force: true });
  rmSync(orderRoot, { recursive: true, force: true });
  rmSync(archRoot, { recursive: true, force: true });
  rmSync(createRoot, { recursive: true, force: true });
  rmSync(malformedRoot, { recursive: true, force: true });
  rmSync(roadmapRoot, { recursive: true, force: true });
}
