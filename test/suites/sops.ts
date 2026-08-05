import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { cli, loadDistModule, TestContext, type YamlModule } from "../support/harness.js";

type SopsModule = {
  deriveSopId: (input: { title: string; category: string; purpose: string }) => string;
};

function makeWorkspace(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "strict-sops-"));
  mkdirSync(path.join(root, ".strict-spec-driven", "sops"), { recursive: true });
  return root;
}

function parseJson(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

const BASE_STEP = ["--step-id", "s1", "--step-actor", "operator", "--step-action", "do the thing", "--step-expected", "the thing is done"];

function genericCreateArgs(title: string, extra: string[] = []): string[] {
  return [
    "sop-create",
    "--title",
    title,
    "--category",
    "generic",
    "--purpose",
    "achieve the goal",
    "--trigger",
    "a condition occurs",
    "--scope-in",
    "the in-scope work",
    "--success",
    "the goal is observably met",
    ...BASE_STEP,
    ...extra,
  ];
}

export async function runSopsSuite(context: TestContext): Promise<void> {
  const sopsModule = await loadDistModule<SopsModule>("sops.js");
  const yamlModule = await loadDistModule<YamlModule>("yaml.js");
  const yamlParse = (text: string): Record<string, unknown> => yamlModule.parseYamlDocument<Record<string, unknown>>(text);
  const sopFilePath = (root: string, sopId: string): string => path.join(root, ".strict-spec-driven", "sops", `${sopId}.yaml`);

  context.section("[sops] conflict-resistant content-derived ids");

  const idA = sopsModule.deriveSopId({ title: "Restart web frontend", category: "operational", purpose: "restore health" });
  const idAgain = sopsModule.deriveSopId({ title: "Restart web frontend", category: "operational", purpose: "restore health" });
  const idB = sopsModule.deriveSopId({ title: "Rotate credentials", category: "operational", purpose: "rotate secrets" });
  context.assert(idA === idAgain, "sop id is deterministic for identical content");
  context.assert(idA !== idB, "sop id differs for different content");
  context.assert(/-[0-9a-f]{6}$/.test(idA), "sop id carries a content-hash suffix rather than a sequential counter");
  context.assert(idA.startsWith("restart-web-frontend-"), "sop id is derived from a slug of the title");

  context.section("[sops] sop-category-list / sop-category-show");

  const catListRoot = makeWorkspace();
  const catList = cli(["sop-category-list"], { cwd: catListRoot });
  context.assert(catList.status === 0, "sop-category-list exits zero");
  const catListJson = parseJson(catList.stdout);
  const categories = catListJson.categories as Array<{ id: string; title: string }>;
  const categoryIds = categories.map((entry) => entry.id);
  context.assert(
    ["generic", "incident-response", "operational", "release"].every((id) => categoryIds.includes(id)),
    "sop-category-list enumerates the four bundled categories",
  );
  context.assert(
    JSON.stringify(categoryIds) === JSON.stringify([...categoryIds].sort()),
    "sop-category-list output is deterministically ordered by id",
  );

  const catShow = cli(["sop-category-show", "incident-response"], { cwd: catListRoot });
  context.assert(catShow.status === 0, "sop-category-show exits zero for a known category");
  const catShowJson = parseJson(catShow.stdout);
  const categoryDefinition = catShowJson.category as { questions: unknown[]; constraints: Record<string, unknown> };
  context.assert(Array.isArray(categoryDefinition.questions) && categoryDefinition.questions.length > 0, "sop-category-show returns the category question list");
  context.assert(
    Array.isArray((categoryDefinition.constraints as { required_sections: unknown[] }).required_sections),
    "sop-category-show returns the category constraints",
  );

  const catShowMissing = cli(["sop-category-show", "no-such-category"], { cwd: catListRoot });
  context.assert(catShowMissing.status !== 0, "sop-category-show exits non-zero for an unknown category");
  context.assert(
    /not found/.test(JSON.stringify(parseJson(catShowMissing.stdout).diagnostics)),
    "sop-category-show reports a not-found diagnostic for an unknown category",
  );
  rmSync(catListRoot, { recursive: true, force: true });

  context.section("[sops] sop-create");

  const createRoot = makeWorkspace();
  const created = cli(genericCreateArgs("Restart the web frontend", ["--scope-out", "schema changes"]), { cwd: createRoot });
  context.assert(created.status === 0, "sop-create exits zero for a complete generic SOP");
  const createdJson = parseJson(created.stdout);
  context.assert(createdJson.created === true, "sop-create reports the SOP as newly created");
  const createdId = createdJson.sopId as string;
  context.assert(typeof createdId === "string" && createdId.length > 0, "sop-create reports a generated sop id");
  context.assert(
    typeof createdJson.path === "string" && existsSync(path.join(createRoot, createdJson.path as string)),
    "sop-create writes the SOP file at the reported path",
  );
  context.assert(
    existsSync(path.join(createRoot, ".strict-spec-driven", "sops", "INDEX.yaml")),
    "sop-create maintains the SOPs index",
  );
  const createdArtifact = yamlParse(readFileSync(path.join(createRoot, createdJson.path as string), "utf8"));
  context.assert(createdArtifact.status === "draft", "sop-create writes the SOP in draft status");
  context.assert(createdArtifact.category === "generic", "sop-create records the chosen category");
  context.assert((createdArtifact.steps as unknown[]).length === 1, "sop-create records the supplied step");
  context.assert(
    (createdArtifact.steps as Array<{ order: number }>)[0].order === 1,
    "sop-create auto-numbers step order from one",
  );

  const recreated = cli(genericCreateArgs("Restart the web frontend", ["--scope-out", "schema changes"]), { cwd: createRoot });
  context.assert(recreated.status === 0, "sop-create rerun exits zero");
  const recreatedJson = parseJson(recreated.stdout);
  context.assert(recreatedJson.created === false, "sop-create rerun does not create a second SOP");
  context.assert(recreatedJson.sopId === createdId, "sop-create rerun resolves the same sop id");

  const unknownCategory = cli(
    ["sop-create", "--title", "Mystery", "--category", "no-such-category", "--purpose", "p", "--trigger", "t", "--scope-in", "s", "--success", "d", ...BASE_STEP],
    { cwd: makeWorkspace() },
  );
  context.assert(unknownCategory.status !== 0, "sop-create rejects an unknown category");
  context.assert(
    /unknown sop category/.test(JSON.stringify(parseJson(unknownCategory.stdout).diagnostics)),
    "sop-create reports an unknown-category diagnostic",
  );

  const incompleteRoot = makeWorkspace();
  const missingExceptions = cli(
    [
      "sop-create",
      "--title",
      "Operational without rollback",
      "--category",
      "operational",
      "--purpose",
      "p",
      "--trigger",
      "t",
      "--scope-in",
      "s",
      "--success",
      "d",
      "--prerequisite",
      "access",
      ...BASE_STEP,
    ],
    { cwd: incompleteRoot },
  );
  context.assert(missingExceptions.status !== 0, "sop-create rejects an operational SOP missing the required exceptions section");
  context.assert(
    /exceptions/.test(JSON.stringify(parseJson(missingExceptions.stdout).diagnostics)),
    "sop-create names the missing required section",
  );
  context.assert(
    !existsSync(path.join(incompleteRoot, ".strict-spec-driven", "sops", "INDEX.yaml")),
    "sop-create does not write any artifact when a required section is missing",
  );
  rmSync(incompleteRoot, { recursive: true, force: true });

  const missingArg = cli(
    ["sop-create", "--title", "No steps", "--category", "generic", "--purpose", "p", "--trigger", "t", "--scope-in", "s", "--success", "d"],
    { cwd: makeWorkspace() },
  );
  context.assert(missingArg.status !== 0, "sop-create rejects a SOP with no steps");

  context.section("[sops] category overlay and branch validation");

  const incidentRoot = makeWorkspace();
  const incidentArgs = (classification: string): string[] => [
    "sop-create",
    "--title",
    `Incident ${classification}`,
    "--category",
    "incident-response",
    "--purpose",
    "respond to the incident",
    "--trigger",
    "an alert fires",
    "--scope-in",
    "mitigation",
    "--success",
    "service recovered",
    "--classification",
    classification,
    "--escalation-trigger",
    "unresolved after 15 minutes",
    "--escalation-to",
    "incident-lead",
    "--exception-condition",
    "mitigation fails",
    "--exception-handling",
    "page the incident lead",
    ...BASE_STEP,
  ];
  const goodIncident = cli(incidentArgs("SEV1"), { cwd: incidentRoot });
  context.assert(goodIncident.status === 0, "sop-create accepts an incident SOP with an allowed classification");
  const badIncident = cli(incidentArgs("SEV9"), { cwd: incidentRoot });
  context.assert(badIncident.status !== 0, "sop-create rejects an incident SOP with a classification outside the category scale");
  context.assert(
    /allowed classifications/.test(JSON.stringify(parseJson(badIncident.stdout).diagnostics)),
    "sop-create reports the disallowed classification against the category scale",
  );
  rmSync(incidentRoot, { recursive: true, force: true });

  const branchRoot = makeWorkspace();
  const badBranch = cli(
    [...genericCreateArgs("Branchy procedure"), "--branch-step", "s1", "--branch-condition", "the check fails", "--branch-goto", "nonexistent-step"],
    { cwd: branchRoot },
  );
  context.assert(badBranch.status !== 0, "sop-create rejects a branch targeting an unknown step");
  context.assert(
    /goto_step/.test(JSON.stringify(parseJson(badBranch.stdout).diagnostics)),
    "sop-create names the offending branch goto_step",
  );
  const goodBranch = cli(
    [...genericCreateArgs("Branchy procedure"), "--branch-step", "s1", "--branch-condition", "the check fails", "--branch-goto", "s1"],
    { cwd: branchRoot },
  );
  context.assert(goodBranch.status === 0, "sop-create accepts a branch targeting an existing step");
  rmSync(branchRoot, { recursive: true, force: true });

  context.section("[sops] sop-validate over hand-authored files");

  const validateRoot = makeWorkspace();
  cli(genericCreateArgs("Valid procedure"), { cwd: validateRoot });
  const validateAll = cli(["sop-validate"], { cwd: validateRoot });
  context.assert(validateAll.status === 0, "sop-validate passes for a compliant SOP and index");

  const malformedRoot = makeWorkspace();
  writeFileSync(
    sopFilePath(malformedRoot, "broken-000000"),
    "schema: strict-spec-driven/sop/v1\nschema_version: 1\nartifact_type: sop\nschema_file: x\nsop:\n  id: broken-000000\n",
    "utf8",
  );
  const validateMalformed = cli(["sop-validate", "broken-000000"], { cwd: malformedRoot });
  context.assert(validateMalformed.status !== 0, "sop-validate fails for a SOP that violates the base schema");
  context.assert(
    (parseJson(validateMalformed.stdout).diagnostics as unknown[]).length > 0,
    "sop-validate reports path-aware diagnostics for a malformed SOP",
  );
  rmSync(malformedRoot, { recursive: true, force: true });

  const overlayRoot = makeWorkspace();
  const operationalMissingExceptions = [
    "schema: strict-spec-driven/sop/v1",
    "schema_version: 1",
    "artifact_type: sop",
    "schema_file: templates/strict-spec-driven/schemas/sop.yaml",
    "sop:",
    "  id: overlay-000000",
    "  title: Overlay probe",
    "category: operational",
    "status: draft",
    'created_at: "2026-06-30T00:00:00.000Z"',
    'updated_at: "2026-06-30T00:00:00.000Z"',
    "purpose: probe the overlay",
    "scope:",
    "  in:",
    "    - probing",
    "trigger: a probe runs",
    "prerequisites:",
    "  - access",
    "steps:",
    "  - id: s1",
    "    order: 1",
    "    actor: operator",
    "    action: probe",
    "    expected_result: probed",
    "success_criteria:",
    "  - probe complete",
    "",
  ].join("\n");
  writeFileSync(sopFilePath(overlayRoot, "overlay-000000"), operationalMissingExceptions, "utf8");
  const validateOverlay = cli(["sop-validate", "overlay-000000"], { cwd: overlayRoot });
  context.assert(validateOverlay.status !== 0, "sop-validate fails a schema-valid SOP that violates its category required sections");
  context.assert(
    /exceptions/.test(JSON.stringify(parseJson(validateOverlay.stdout).diagnostics)),
    "sop-validate names the category constraint the SOP violates",
  );
  rmSync(overlayRoot, { recursive: true, force: true });

  context.section("[sops] link-target validation");

  const linkRoot = makeWorkspace();
  mkdirSync(path.join(linkRoot, ".strict-spec-driven", "changes", "existing-change"), { recursive: true });
  const resolvableLink = cli(
    [...genericCreateArgs("Linked to change"), "--link-kind", "change", "--link-target", "existing-change"],
    { cwd: linkRoot },
  );
  context.assert(resolvableLink.status === 0, "sop-create accepts a link whose change target exists");
  const danglingLink = cli(
    [...genericCreateArgs("Linked to nothing"), "--link-kind", "change", "--link-target", "no-such-change"],
    { cwd: linkRoot },
  );
  context.assert(danglingLink.status !== 0, "sop-create rejects a link whose target does not resolve");
  context.assert(
    /does not resolve/.test(JSON.stringify(parseJson(danglingLink.stdout).diagnostics)),
    "sop-create reports a path-aware diagnostic for a dangling link",
  );
  rmSync(linkRoot, { recursive: true, force: true });

  context.section("[sops] sop-list / sop-show");

  const list = cli(["sop-list"], { cwd: validateRoot });
  context.assert(list.status === 0, "sop-list exits zero");
  const listSops = parseJson(list.stdout).sops as Array<{ id: string; category: string; status: string }>;
  context.assert(Array.isArray(listSops) && listSops.length === 1, "sop-list enumerates the created SOP");
  context.assert(listSops[0].category === "generic" && listSops[0].status === "draft", "sop-list reports category and status");

  const emptyList = cli(["sop-list"], { cwd: makeWorkspace() });
  context.assert(emptyList.status === 0 && (parseJson(emptyList.stdout).sops as unknown[]).length === 0, "sop-list on empty state reports no SOPs");

  const validId = listSops[0].id;
  const show = cli(["sop-show", validId], { cwd: validateRoot });
  context.assert(show.status === 0 && (parseJson(show.stdout).sop as Record<string, unknown>) !== null, "sop-show returns the SOP contents");
  const showMissing = cli(["sop-show", "does-not-exist-000000"], { cwd: validateRoot });
  context.assert(showMissing.status !== 0, "sop-show exits non-zero for an unknown sop id");

  context.section("[sops] sop-edit");

  const beforeEdit = parseJson(cli(["sop-show", validId], { cwd: validateRoot }).stdout).sop as Record<string, any>;
  const originalCreatedAt = beforeEdit.created_at as string;
  const edited = cli(["sop-edit", validId, "--title", "Refined procedure", "--purpose", "a refined purpose"], { cwd: validateRoot });
  context.assert(edited.status === 0, "sop-edit exits zero for a valid edit");
  const editedSop = parseJson(edited.stdout).sop as Record<string, any>;
  context.assert(editedSop.sop.title === "Refined procedure", "sop-edit updates the title");
  context.assert(editedSop.purpose === "a refined purpose", "sop-edit updates the purpose");
  context.assert(editedSop.sop.id === validId, "sop-edit keeps the sop id stable");
  context.assert(editedSop.status === "draft", "sop-edit keeps the status unchanged");
  context.assert(editedSop.created_at === originalCreatedAt, "sop-edit preserves created_at");
  context.assert(editedSop.updated_at !== originalCreatedAt, "sop-edit refreshes updated_at");
  const editIndex = yamlParse(readFileSync(path.join(validateRoot, ".strict-spec-driven", "sops", "INDEX.yaml"), "utf8")) as {
    sops: Record<string, { title: string }>;
  };
  context.assert(editIndex.sops[validId].title === "Refined procedure", "sop-edit refreshes the SOPs index with the new title");

  const editUnknown = cli(["sop-edit", "does-not-exist-000000", "--title", "x"], { cwd: validateRoot });
  context.assert(editUnknown.status !== 0, "sop-edit exits non-zero for an unknown sop id");
  const noopEdit = cli(["sop-edit", validId], { cwd: validateRoot });
  context.assert(noopEdit.status !== 0, "sop-edit requires at least one editable field");
  const blankEdit = cli(["sop-edit", validId, "--title", ""], { cwd: validateRoot });
  context.assert(blankEdit.status !== 0, "sop-edit rejects a blank required field");

  const structuredEdit = cli([
    "sop-edit", validId,
    "--status", "active",
    "--scope-in", "additional work",
    "--scope-out", "unrelated work",
    "--success", "secondary check passes",
    "--role-id", "reviewer", "--role-name", "Reviewer", "--role-responsibility", "approve the result",
    "--prerequisite", "review access",
    "--step-id", "s2", "--step-actor", "reviewer", "--step-action", "review", "--step-expected", "approved",
    "--output", "approval record",
    "--reference-label", "runbook", "--reference-target", "docs/runbook.md",
  ], { cwd: validateRoot });
  context.assert(structuredEdit.status === 0, "sop-edit appends structured fields and activates a draft SOP", structuredEdit.stdout || structuredEdit.stderr);
  const structuredSop = parseJson(structuredEdit.stdout).sop as Record<string, any>;
  context.assert(
    structuredSop.status === "active"
      && structuredSop.scope.in.join(",") === "the in-scope work,additional work"
      && structuredSop.success_criteria.join(",") === "the goal is observably met,secondary check passes"
      && structuredSop.roles[0].id === "reviewer"
      && structuredSop.steps[1].id === "s2"
      && structuredSop.steps[1].order === 2
      && structuredSop.references[0].label === "runbook",
    "sop-edit preserves existing collections while adding keyed and scalar entries",
  );

  const namedRemoval = cli([
    "sop-edit", validId,
    "--remove-scope-in", "additional work",
    "--remove-scope-out", "unrelated work",
    "--remove-success", "secondary check passes",
    "--remove-role", "reviewer",
    "--remove-prerequisite", "review access",
    "--remove-step", "s2",
    "--remove-output", "approval record",
    "--remove-reference", "runbook",
  ], { cwd: validateRoot });
  context.assert(namedRemoval.status === 0, "sop-edit removes exact named entries", namedRemoval.stdout || namedRemoval.stderr);
  const trimmedSop = parseJson(namedRemoval.stdout).sop as Record<string, any>;
  context.assert(
    trimmedSop.scope.in.join(",") === "the in-scope work"
      && trimmedSop.scope.out === undefined
      && trimmedSop.success_criteria.join(",") === "the goal is observably met"
      && trimmedSop.roles === undefined
      && trimmedSop.prerequisites === undefined
      && trimmedSop.steps.length === 1
      && trimmedSop.outputs === undefined
      && trimmedSop.references === undefined,
    "sop-edit removes only the explicitly named entries and preserves required siblings",
  );

  const bytesBeforeRejectedRemoval = readFileSync(sopFilePath(validateRoot, validId), "utf8");
  const indexBeforeRejectedRemoval = readFileSync(path.join(validateRoot, ".strict-spec-driven", "sops", "INDEX.yaml"), "utf8");
  const rejectedRemoval = cli(["sop-edit", validId, "--remove-step", "s1"], { cwd: validateRoot });
  context.assert(rejectedRemoval.status !== 0, "sop-edit rejects removal of category-required content");
  context.assert(
    readFileSync(sopFilePath(validateRoot, validId), "utf8") === bytesBeforeRejectedRemoval
      && readFileSync(path.join(validateRoot, ".strict-spec-driven", "sops", "INDEX.yaml"), "utf8") === indexBeforeRejectedRemoval,
    "a rejected SOP mutation leaves both the SOP and index byte-identical",
  );

  const unmatchedRemoval = cli(["sop-edit", validId, "--remove-role", "missing-role"], { cwd: validateRoot });
  context.assert(unmatchedRemoval.status !== 0, "sop-edit rejects a named removal that matches no entry");
  const unmatchedRemovalJson = parseJson(unmatchedRemoval.stdout);
  context.assert(
    unmatchedRemovalJson.diagnostics.some((entry: { fieldPath?: string; message?: string }) =>
      entry.fieldPath === "$.roles" && entry.message?.includes("missing-role")),
    "an unmatched SOP removal reports a deterministic field-path diagnostic",
  );
  context.assert(
    readFileSync(sopFilePath(validateRoot, validId), "utf8") === bytesBeforeRejectedRemoval
      && readFileSync(path.join(validateRoot, ".strict-spec-driven", "sops", "INDEX.yaml"), "utf8") === indexBeforeRejectedRemoval,
    "an unmatched SOP removal leaves both the SOP and index byte-identical",
  );

  const reverseLifecycle = cli(["sop-edit", validId, "--status", "draft"], { cwd: validateRoot });
  context.assert(reverseLifecycle.status !== 0, "sop-edit rejects returning an active SOP to draft");

  rmSync(validateRoot, { recursive: true, force: true });
  rmSync(createRoot, { recursive: true, force: true });
}
