import { formatYamlParseSummary, getYamlDiagnosticDetails, getYamlParseDetails, parseYamlDocument } from "../yaml.js";
import { findUnpackagedSkillReferences } from "./references.js";
import {
  AUTHORING_PROTOCOL_HEADING,
  findProseMutationFlags,
  isMutationCapableSkill,
  loadPolicyRegistry,
  scanTextForPolicyViolations,
} from "../cli-only-yaml-policy.js";
import {
  YAML_AUTHORING_PROTOCOL_BOUNDARY,
  YAML_AUTHORING_PROTOCOL_STEPS,
} from "../yaml-authoring-protocol.js";
import {
  AUTHORING_PROTOCOL_POINTER_COMMAND,
  COMMAND_PREFIX,
  CORE_STRICT_SKILL_EXPECTATIONS,
  CHECK_WORKFLOW_STATE_COMMAND,
  GENERIC_COMMAND_PLACEHOLDER,
  PLANNING_STRICT_SKILL_EXPECTATIONS,
  ROADMAP_STRICT_SKILL_EXPECTATIONS,
  PREFERRED_HUMAN_LANGUAGE_HEADING,
  PREFERRED_HUMAN_LANGUAGE_SNIPPETS,
  REQUIREMENT_INTERROGATION_HEADING,
  REQUIREMENT_INTERROGATION_SKILLS,
  REQUIREMENT_INTERROGATION_SNIPPETS,
  REVIEW_INDEPENDENCE_HEADING,
  REVIEW_INDEPENDENCE_SKILLS,
  REVIEW_INDEPENDENCE_SNIPPETS,
  SKILL_COMMANDS_HEADING,
  STRICT_WORKFLOW_SHARED_ELEMENTS,
  directsTaskListAuthoring,
  TASK_ORDER_APPLY_SKILL,
  TASK_ORDER_APPLY_SNIPPETS,
  TASK_ORDER_PLACEMENT_SNIPPETS,
  STRICT_WORKFLOW_EXISTENCE_STEP_SNIPPET,
  STRICT_WORKFLOW_INIT_GUIDANCE_SNIPPET,
  STRICT_WORKFLOW_NO_INIT_SNIPPET,
  makeDiagnostic,
  type SkillContentExpectation,
  type SkillPackagingDiagnostic,
} from "./model.js";

function validateRequirementInterrogationGuidance(
  skillName: string,
  content: string,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  if (!(REQUIREMENT_INTERROGATION_SKILLS as readonly string[]).includes(skillName)) return;
  const normalizedContent = content.replace(/\s+/g, " ");

  if (!content.includes(REQUIREMENT_INTERROGATION_HEADING)) {
    diagnostics.push(
      makeDiagnostic(
        "skill.requirement_interrogation.heading.missing",
        skillPath,
        "proposal-oriented strict skills must carry a requirement-interrogation section that runs before the change-intake checklist",
        REQUIREMENT_INTERROGATION_HEADING,
      ),
    );
  }

  for (const expectation of REQUIREMENT_INTERROGATION_SNIPPETS) {
    if (normalizedContent.includes(expectation.snippet.replace(/\s+/g, " "))) continue;
    diagnostics.push(
      makeDiagnostic(
        "skill.requirement_interrogation.guidance.missing",
        skillPath,
        `proposal-oriented strict skills must document ${expectation.element}`,
        expectation.snippet,
      ),
    );
  }
}

/**
 * Requires the review-independence contract in every skill that reviews a change it implemented.
 *
 * The governed set is the explicit `REVIEW_INDEPENDENCE_SKILLS` list rather than a scan for
 * review-shaped content, because this check's own subject is text the same change inserts: a scope
 * derived from the guidance would read what it put there, and deleting the section from a skill
 * would drop that skill out of scope instead of failing it. Whitespace is collapsed before matching
 * so a line-wrapped phrase still counts as stated — the negative-case probe therefore has to remove
 * every occurrence counted in normalized text, not every literal one.
 */
function validateReviewIndependenceGuidance(
  skillName: string,
  content: string,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  if (!(REVIEW_INDEPENDENCE_SKILLS as readonly string[]).includes(skillName)) return;

  const section = skillSection(content, REVIEW_INDEPENDENCE_HEADING);
  if (section === undefined) {
    diagnostics.push(
      makeDiagnostic(
        "skill.review_independence.heading.missing",
        skillPath,
        "a strict skill that reviews a change must carry a review-independence section that separates requirement reconstruction from reading the implementation",
        REVIEW_INDEPENDENCE_HEADING,
      ),
    );
    return;
  }

  const normalizedSection = normalizeWhitespace(section);
  for (const { snippet, element } of REVIEW_INDEPENDENCE_SNIPPETS) {
    if (normalizedSection.includes(normalizeWhitespace(snippet))) continue;
    diagnostics.push(
      makeDiagnostic(
        "skill.review_independence.element.missing",
        skillPath,
        `review-independence guidance must state ${element}`,
        snippet,
      ),
    );
  }
}

/**
 * Requires task-ordering guidance in every skill that directs task-list authoring, and the
 * out-of-order completion guidance in the apply skill.
 *
 * The governed set is discovered by scanning content for task-authoring usage rather than read
 * from a list, so adding a task-authoring skill cannot silently skip the requirement.
 */
function validateTaskOrderGuidance(
  skillName: string,
  content: string,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  const normalizedContent = content.replace(/\s+/g, " ");

  if (skillName === TASK_ORDER_APPLY_SKILL) {
    for (const expectation of TASK_ORDER_APPLY_SNIPPETS) {
      if (normalizedContent.includes(expectation.snippet.replace(/\s+/g, " "))) continue;
      diagnostics.push(
        makeDiagnostic(
          "skill.task_order.apply_guidance.missing",
          skillPath,
          `the apply skill must document ${expectation.element}`,
          expectation.snippet,
        ),
      );
    }
    return;
  }

  if (!directsTaskListAuthoring(content)) return;

  for (const expectation of TASK_ORDER_PLACEMENT_SNIPPETS) {
    if (normalizedContent.includes(expectation.snippet.replace(/\s+/g, " "))) continue;
    diagnostics.push(
      makeDiagnostic(
        "skill.task_order.placement_guidance.missing",
        skillPath,
        `a skill that directs change task-list authoring must document ${expectation.element}`,
        expectation.snippet,
      ),
    );
  }
}

function requiresExistingStrictWorkflowState(skillName: string): boolean {
  return (
    skillName.startsWith("strict-spec-") ||
    skillName.startsWith("strict-roadmap-") ||
    skillName.startsWith("strict-tech-")
  )
    && skillName !== "strict-spec-init";
}

function validateStrictWorkflowStateGuidance(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  if (!requiresExistingStrictWorkflowState(skillName)) return;
  const normalizedContent = content.replace(/\s+/g, " ");

  const checkWorkflowStateCommand = commands["check-workflow-state"];
  if (!checkWorkflowStateCommand) {
    diagnostics.push(
      makeDiagnostic(
        "skill.strict_workflow.check_command.missing",
        `${skillPath}#commands.check-workflow-state`,
        "non-init strict skills must expose the scripted strict workflow state check command",
        CHECK_WORKFLOW_STATE_COMMAND,
      ),
    );
  } else if (!checkWorkflowStateCommand.includes(CHECK_WORKFLOW_STATE_COMMAND)) {
    diagnostics.push(
      makeDiagnostic(
        "skill.strict_workflow.check_command.invalid",
        `${skillPath}#commands.check-workflow-state`,
        "non-init strict skills must run the scripted strict workflow state check command before workflow work",
        CHECK_WORKFLOW_STATE_COMMAND,
        checkWorkflowStateCommand,
      ),
    );
  }

  for (const snippet of [
    STRICT_WORKFLOW_EXISTENCE_STEP_SNIPPET,
    STRICT_WORKFLOW_INIT_GUIDANCE_SNIPPET,
    STRICT_WORKFLOW_NO_INIT_SNIPPET,
  ]) {
    if (normalizedContent.includes(snippet.replace(/\s+/g, " "))) continue;
    diagnostics.push(
      makeDiagnostic(
        "skill.strict_workflow.precheck.missing",
        skillPath,
        "non-init strict skills must check for existing .strict-spec-driven/ state before any other step and stop with init guidance when it is missing",
        snippet,
      ),
    );
  }

  if (commands.init) {
    diagnostics.push(
      makeDiagnostic(
        "skill.strict_workflow.init_command.forbidden",
        `${skillPath}#commands.init`,
        "non-init strict skills must not declare the bundled init command as a fallback",
        "no init command entry",
        commands.init,
      ),
    );
  }
}

function validateSkillContentAgainstExpectation(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
  expectationMap: Record<string, SkillContentExpectation>,
  diagnosticPrefix: "skill.core" | "skill.roadmap" | "skill.planning",
  label: string,
): void {
  const expectation = expectationMap[skillName];
  if (!expectation) return;
  const normalizedContent = content.replace(/\s+/g, " ");

  if (content.includes(GENERIC_COMMAND_PLACEHOLDER)) {
    diagnostics.push(
      makeDiagnostic(
        `${diagnosticPrefix}.placeholder_command`,
        skillPath,
        `${label} must replace the generic placeholder command mapping with explicit commands`,
        "explicit command mapping",
        GENERIC_COMMAND_PLACEHOLDER,
      ),
    );
  }

  for (const heading of expectation.requiredHeadings) {
    if (!content.includes(heading)) {
      diagnostics.push(
        makeDiagnostic(
          `${diagnosticPrefix}.required_heading.missing`,
          skillPath,
          `${label} is missing required section heading '${heading}'`,
          heading,
        ),
      );
    }
  }

  for (const snippet of expectation.requiredSnippets) {
    if (!normalizedContent.includes(snippet.replace(/\s+/g, " "))) {
      diagnostics.push(
        makeDiagnostic(
          `${diagnosticPrefix}.required_snippet.missing`,
          skillPath,
          `${label} must reference '${snippet}'`,
          snippet,
        ),
      );
    }
  }

  for (const snippet of expectation.forbiddenSnippets ?? []) {
    if (normalizedContent.includes(snippet.replace(/\s+/g, " "))) {
      diagnostics.push(
        makeDiagnostic(
          `${diagnosticPrefix}.forbidden_snippet.present`,
          skillPath,
          `${label} contains misleading prompt text '${snippet}'`,
          "prompt text aligned with implemented CLI behavior",
          snippet,
        ),
      );
    }
  }

  for (const [commandName, expectedValue] of Object.entries(expectation.requiredCommands)) {
    const actualValue = commands[commandName];
    if (!actualValue) {
      diagnostics.push(
        makeDiagnostic(
          `${diagnosticPrefix}.command.missing`,
          `${skillPath}#commands.${commandName}`,
          `${label} is missing required command entry '${commandName}'`,
          expectedValue,
        ),
      );
      continue;
    }

    if (!actualValue.includes(expectedValue)) {
      diagnostics.push(
        makeDiagnostic(
          `${diagnosticPrefix}.command.invalid`,
          `${skillPath}#commands.${commandName}`,
          `${label} command '${commandName}' must reference the expected strict CLI subcommand`,
          expectedValue,
          actualValue,
        ),
      );
    }
  }
}

function validateCoreSkillContent(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  validateSkillContentAgainstExpectation(
    skillName,
    content,
    commands,
    skillPath,
    diagnostics,
    CORE_STRICT_SKILL_EXPECTATIONS,
    "skill.core",
    "core strict skill",
  );
}

function validateRoadmapSkillContent(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  validateSkillContentAgainstExpectation(
    skillName,
    content,
    commands,
    skillPath,
    diagnostics,
    ROADMAP_STRICT_SKILL_EXPECTATIONS,
    "skill.roadmap",
    "strict roadmap skill",
  );
}

function validatePlanningSkillContent(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  validateSkillContentAgainstExpectation(
    skillName,
    content,
    commands,
    skillPath,
    diagnostics,
    PLANNING_STRICT_SKILL_EXPECTATIONS,
    "skill.planning",
    "strict planning skill",
  );
}

const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, " ");

/** The section a heading opens, heading included, or undefined when the skill carries none. */
function skillSection(content: string, heading: string): string | undefined {
  const start = content.indexOf(heading);
  if (start === -1) return undefined;
  const next = content.indexOf("\n## ", start + heading.length);
  return next === -1 ? content.slice(start) : content.slice(start, next);
}

/** The authoring-protocol section of a skill, or undefined when the skill carries none. */
function authoringProtocolSection(content: string): string | undefined {
  return skillSection(content, AUTHORING_PROTOCOL_HEADING);
}

/**
 * Abbreviations whose trailing period does not end a sentence.
 *
 * The list is explicit rather than a general segmentation heuristic, so an abbreviation it does not
 * cover produces a diagnostic a reader can act on instead of a silent miscount. Adding to it is the
 * intended response when a skill legitimately needs another one.
 */
const PROSE_ABBREVIATIONS = ["e.g.", "i.e.", "etc.", "vs.", "cf."];

/**
 * Counts sentences in prose, ignoring the dots inside inline code spans and prose abbreviations.
 *
 * The guidance names `.strict-spec-driven/config.yaml` and `preferred_human_language`, so a naive
 * split on periods reports four sentences for a one-sentence rule; an abbreviation such as `e.g.`
 * inside that same sentence reports two, which would fail the single-sentence rule with a message
 * pointing at the wrong cause. Masking both is sufficient here and is deliberately not offered as a
 * general-purpose sentence splitter.
 */
function countProseSentences(text: string): number {
  let masked = text.replace(/`[^`]*`/g, "CODE");
  for (const abbreviation of PROSE_ABBREVIATIONS) {
    masked = masked.split(abbreviation).join(abbreviation.replace(/\./g, ""));
  }
  return (masked.match(/[.!?](\s|$)/g) ?? []).length;
}

/**
 * Requires every bundled skill to carry the preferred-human-language guidance as one sentence.
 *
 * The elements come from the typed model rather than from the guidance text, so a skill cannot
 * satisfy the check with the very paragraph it governs, and the sentence bound is what stops the
 * collapsed form from growing back into the nine-line copy this check replaced.
 */
function validatePreferredHumanLanguageGuidance(
  content: string,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  const section = skillSection(content, PREFERRED_HUMAN_LANGUAGE_HEADING);
  if (section === undefined) {
    diagnostics.push(
      makeDiagnostic(
        "skill.preferred_human_language.section.missing",
        skillPath,
        "every bundled strict skill must carry a preferred human language section",
        PREFERRED_HUMAN_LANGUAGE_HEADING,
      ),
    );
    return;
  }

  // Matched case-insensitively because these elements are phrases rather than identifiers, and
  // whether one opens a sentence is a wording choice the skill is free to make.
  const normalizedSection = normalizeWhitespace(section).toLowerCase();
  for (const { snippet, element } of PREFERRED_HUMAN_LANGUAGE_SNIPPETS) {
    if (normalizedSection.includes(normalizeWhitespace(snippet).toLowerCase())) continue;
    diagnostics.push(
      makeDiagnostic(
        "skill.preferred_human_language.element.missing",
        skillPath,
        `preferred human language guidance must name ${element}`,
        snippet,
      ),
    );
  }

  const body = section.slice(PREFERRED_HUMAN_LANGUAGE_HEADING.length);
  const sentenceCount = countProseSentences(body);
  if (sentenceCount > 1) {
    diagnostics.push(
      makeDiagnostic(
        "skill.preferred_human_language.not_single_sentence",
        skillPath,
        "preferred human language guidance must be stated as a single sentence, not a restated paragraph; fold any skill-specific rider into that sentence",
        "1 sentence",
        `${sentenceCount} sentences`,
      ),
    );
  }
}

/**
 * Splits a skill file into its level-two sections, keyed by heading line.
 *
 * The split is by heading rather than by a named lookup because the repetition rule is about any
 * two sections, so the check cannot know in advance which pair holds the duplicate.
 */
function skillSections(content: string): Array<{ heading: string; body: string }> {
  const sections: Array<{ heading: string; body: string }> = [];
  const pattern = /^## .*$/gm;
  const headings = [...content.matchAll(pattern)];
  // The text before the first heading is a section for this purpose: an instruction stated once in
  // the opening prose and once under a heading is stated twice, and a split that dropped the
  // preamble would call that file compliant.
  const preamble = content.slice(0, headings[0]?.index ?? content.length);
  if (preamble.trim().length > 0) sections.push({ heading: "the opening prose", body: preamble });
  for (const [index, match] of headings.entries()) {
    const start = match.index as number;
    const end = index + 1 < headings.length ? (headings[index + 1]?.index as number) : content.length;
    sections.push({ heading: match[0].trim(), body: content.slice(start, end) });
  }
  return sections;
}

/**
 * Rejects a skill that states shared workflow-state guidance in more than one of its sections.
 *
 * The rule is about repetition, not placement. A second copy of an instruction is a copy no check
 * reads, free to drift from the enforced one — which is the state 35 of 37 skills were in while
 * `validateStrictWorkflowStateGuidance` read only the Steps form. Keying the comparison to a named
 * Prerequisites section reproduced that defect one level up: it left a duplicate between any other
 * pair of sections exactly as invisible as the original duplicate was, while the spec requirement
 * and the technical rule both state the constraint as at most once per file. Stating the guidance
 * once satisfies this check whichever section holds it, so the committed policy fixtures that carry
 * it only under Prerequisites stay compliant. The commands block is excluded from the comparison
 * because it is the declared command source every skill keeps by design, not a restatement.
 *
 * The match tokens stay the two prose sentences of `STRICT_WORKFLOW_SHARED_ELEMENTS`: a command
 * name occurs wherever a skill merely references that command, so matching on one would report a
 * skill that states the instruction exactly once.
 */
function validateWorkflowStateGuidanceIsNotRestated(
  content: string,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  const sections = skillSections(content).filter((section) => section.heading !== SKILL_COMMANDS_HEADING);

  for (const { snippet, element } of STRICT_WORKFLOW_SHARED_ELEMENTS) {
    const normalizedSnippet = normalizeWhitespace(snippet);
    const statingSections = sections
      .filter((section) => normalizeWhitespace(section.body).includes(normalizedSnippet))
      .map((section) => section.heading);
    if (statingSections.length < 2) continue;
    diagnostics.push(
      makeDiagnostic(
        "skill.strict_workflow.precondition.restated",
        skillPath,
        `${statingSections.join(" and ")} both state ${element}; delete every copy but one rather than shortening it, keeping a Prerequisites section only for a precondition specific to this skill`,
        `${element} stated once`,
        statingSections.join(", "),
      ),
    );
  }
}

/**
 * Requires a mutation-capable skill to point at the protocol rather than restate it.
 *
 * A skill is static text an agent reads before it runs anything, so the pointer command and the
 * no-fallback boundary are what make the protocol reachable at all; the ordered steps are not
 * restated because the pointed-at command renders them bound to the artifact kind, current in a way
 * a copy cannot be. Scope and the expected values both come from sources independent of the
 * guidance text — the mutation inventory and the typed protocol module — so this check cannot be
 * satisfied by the very text it governs, and rewording a step in the module cannot silently make a
 * skill non-compliant.
 */
function validateAuthoringProtocolPointer(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  if (!isMutationCapableSkill(content)) return;

  const section = authoringProtocolSection(content);
  if (section === undefined) {
    diagnostics.push(
      makeDiagnostic(
        "skill.authoring_protocol.section.missing",
        skillPath,
        "mutation-capable skill must carry a CLI-only YAML authoring pointer section",
        AUTHORING_PROTOCOL_HEADING,
      ),
    );
    return;
  }

  const normalized = normalizeWhitespace(section);

  if (!normalized.includes(AUTHORING_PROTOCOL_POINTER_COMMAND)) {
    diagnostics.push(
      makeDiagnostic(
        "skill.authoring_protocol.pointer.missing",
        skillPath,
        "mutation-capable skill must name the command that renders the live authoring protocol",
        `${AUTHORING_PROTOCOL_POINTER_COMMAND} <artifact-kind>`,
      ),
    );
  }

  const { artifactKinds, validationCommandByKind, mutatingOwnerCommands } = loadPolicyRegistry();
  const namedKinds = [...artifactKinds].filter((kind) => normalized.includes(`\`${kind}\``));
  if (namedKinds.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        "skill.authoring_protocol.artifact_kind.missing",
        skillPath,
        "mutation-capable skill must name the artifact kinds it writes, so the pointer command can be run for them",
        "an artifact kind registered in inventory/yaml-mutation-surfaces.yaml",
      ),
    );
  } else {
    // A skill may write several kinds whose declared validation commands differ, so one per kind is
    // not required. The family default is accepted, and so is a non-mutating command the skill
    // itself declares: a family records one validation command, but a skill that edits an artifact
    // outside a change validates it differently from one that edits it inside a change, and the
    // skill's own command mapping is the accurate source for which of the two it is.
    const declaredValidationCommands = Object.values(commands)
      .map(commandNameOf)
      .filter((name): name is string => name !== undefined && !mutatingOwnerCommands.has(name));
    const acceptedCommands = new Set<string>(declaredValidationCommands);
    for (const kind of namedKinds) {
      const command = validationCommandByKind.get(kind);
      if (command !== undefined) acceptedCommands.add(command);
    }
    const namesAValidationCommand = [...acceptedCommands].some((command) =>
      normalized.includes(`${COMMAND_PREFIX} ${command}`),
    );
    if (!namesAValidationCommand) {
      diagnostics.push(
        makeDiagnostic(
          "skill.authoring_protocol.validation_command.missing",
          skillPath,
          "mutation-capable skill must name the validation command it runs after writing an artifact kind it names",
          [...acceptedCommands].map((command) => `${COMMAND_PREFIX} ${command}`).join(" or "),
        ),
      );
    }
  }

  if (!normalized.includes(normalizeWhitespace(YAML_AUTHORING_PROTOCOL_BOUNDARY.statement))) {
    diagnostics.push(
      makeDiagnostic(
        "skill.authoring_protocol.boundary.missing",
        skillPath,
        "mutation-capable skill must restate the no-fallback boundary verbatim, because it is the one instruction that must be read before any command runs",
        YAML_AUTHORING_PROTOCOL_BOUNDARY.statement,
      ),
    );
  }

  for (const step of YAML_AUTHORING_PROTOCOL_STEPS) {
    if (!normalized.includes(normalizeWhitespace(step.title))) continue;
    diagnostics.push(
      makeDiagnostic(
        "skill.authoring_protocol.step.restated",
        skillPath,
        `mutation-capable skill must not restate protocol step '${step.id}', which the pointer command renders bound to the artifact kind`,
        `${AUTHORING_PROTOCOL_POINTER_COMMAND} <artifact-kind>`,
        step.title,
      ),
    );
  }
}

/**
 * Rejects guidance that tells an agent to mutate repository-owned YAML outside the CLI. Only
 * mutation-capable packages are checked, and membership comes from the mutation inventory rather
 * than from the guidance text, so deleting a skill's protocol section fails this check instead of
 * reclassifying the package as exempt.
 */
function validateCliOnlyYamlPolicy(
  skillName: string,
  content: string,
  commands: Record<string, string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  if (!isMutationCapableSkill(content)) return;

  for (const match of scanTextForPolicyViolations(skillPath, content).matches) {
    diagnostics.push(
      makeDiagnostic(
        `skill.cli_only_yaml.${match.category.replace(/-/g, "_")}`,
        `${skillPath}:${match.line}`,
        `mutation-capable skill must not instruct a direct YAML mutation (${match.category})`,
        match.replacement,
        match.excerpt,
      ),
    );
  }

  const { mutatingOwnerCommands, declaredFlagsByCommand } = loadPolicyRegistry();
  const declaredCommandNames = new Set(
    Object.values(commands).map(commandNameOf).filter((name): name is string => name !== undefined),
  );
  // A skill names the same command and flag many times over. Each gap is one defect to fix, so it
  // is reported once rather than once per mention.
  const reported = new Set<string>();

  for (const { command, flag } of findProseMutationFlags(content)) {
    if (!mutatingOwnerCommands.has(command)) continue;

    if (!declaredCommandNames.has(command)) {
      if (reported.has(command)) continue;
      reported.add(command);
      diagnostics.push(
        makeDiagnostic(
          "skill.cli_only_yaml.missing_command_mapping",
          `${skillPath}#commands`,
          `skill directs the '${command}' mutation but declares no command mapping for it`,
          `a commands entry invoking '${COMMAND_PREFIX} ${command}'`,
          `no mapping for '${command}'`,
        ),
      );
      continue;
    }

    const declaredFlags = declaredFlagsByCommand.get(command);
    if (declaredFlags === undefined || declaredFlags.has(flag)) continue;
    if (reported.has(`${command} ${flag}`)) continue;
    reported.add(`${command} ${flag}`);
    diagnostics.push(
      makeDiagnostic(
        "skill.cli_only_yaml.undeclared_mutation_flag",
        `${skillPath}#commands.${command}`,
        `skill names flag '${flag}' for '${command}', which the command metadata registry does not declare`,
        `a flag declared in the '${command}' command metadata entry`,
        flag,
      ),
    );
  }
}

/** The subcommand a declared command mapping invokes, or undefined when it names none. */
function commandNameOf(commandValue: string): string | undefined {
  const match = commandValue.trim().match(new RegExp(`^${COMMAND_PREFIX}\\s+([a-z][a-z0-9-]*)`));
  return match?.[1];
}

export function validateCommandSection(
  skillName: string,
  content: string,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  const sectionMatch = content.match(/## This Skill's Commands[\s\S]*?```yaml\s*([\s\S]*?)```/m);
  if (!sectionMatch) {
    diagnostics.push(
      makeDiagnostic(
        "skill.commands_section.missing",
        skillPath,
        "skills that use the CLI must include a '## This Skill's Commands' section with a yaml command mapping",
      ),
    );
    return;
  }

  const yamlBlock = sectionMatch[1].trim();
  if (!yamlBlock) {
    diagnostics.push(
      makeDiagnostic(
        "skill.commands_section.empty",
        skillPath,
        "command mapping block cannot be empty",
      ),
    );
    return;
  }

  let commands: unknown;
  try {
    commands = parseYamlDocument<unknown>(yamlBlock, { source: skillPath });
  } catch (error) {
    const yamlDetails = getYamlParseDetails(error);
    const yamlDiagnosticDetails = getYamlDiagnosticDetails(error);
    diagnostics.push(
      {
        ...makeDiagnostic(
          "skill.commands_section.parse_error",
          skillPath,
          "command mapping block is not valid YAML",
          "parseable YAML mapping",
          yamlDetails ? formatYamlParseSummary(yamlDetails) : error instanceof Error ? error.message : String(error),
        ),
        ...yamlDiagnosticDetails,
      },
    );
    return;
  }

  if (!commands || typeof commands !== "object" || Array.isArray(commands)) {
    diagnostics.push(
      makeDiagnostic(
        "skill.commands_section.invalid_shape",
        skillPath,
        "command mapping block must be a YAML mapping",
      ),
    );
    return;
  }

  const entries = Object.entries(commands as Record<string, unknown>);
  if (entries.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        "skill.commands_section.no_commands",
        skillPath,
        "command mapping must declare at least one command entry",
      ),
    );
    return;
  }

  const normalizedCommands: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (typeof value !== "string" || value.trim().length === 0) {
      diagnostics.push(
        makeDiagnostic(
          "skill.commands_section.command.invalid",
          `${skillPath}#commands.${name}`,
          "command mapping values must be non-empty strings",
        ),
      );
      continue;
    }
    normalizedCommands[name] = value;
    if (value.includes("{{SKILL_DIR}}") || value.includes("~/.local/bin/strict-spec-driven") || value.includes("~/.local/bin/strict-spec-cli")) {
      diagnostics.push(
        makeDiagnostic(
          "skill.commands_section.command.machine_path",
          `${skillPath}#commands.${name}`,
          "command entries must use the PATH-resolved strict CLI command, not skill-relative or hard-coded user bin paths",
          `${COMMAND_PREFIX} <explicit-subcommand>`,
          value,
        ),
      );
      continue;
    }
    const trimmedValue = value.trim();
    if (trimmedValue !== COMMAND_PREFIX && !trimmedValue.startsWith(`${COMMAND_PREFIX} `)) {
      diagnostics.push(
        makeDiagnostic(
          "skill.commands_section.command.reference",
          `${skillPath}#commands.${name}`,
          "command entries must reference the PATH-resolved strict CLI command",
          COMMAND_PREFIX,
          value,
        ),
      );
      continue;
    }

    const commandSuffix = trimmedValue.slice(COMMAND_PREFIX.length).trim();
    if (commandSuffix.length === 0 || commandSuffix === "<command>" || value.includes(GENERIC_COMMAND_PLACEHOLDER)) {
      diagnostics.push(
        makeDiagnostic(
          "skill.commands_section.command.placeholder",
          `${skillPath}#commands.${name}`,
          "command entries must replace the generic strict CLI placeholder with an explicit subcommand and parameters",
          `${COMMAND_PREFIX} <explicit-subcommand>`,
          value,
        ),
      );
    }
  }

  validateCoreSkillContent(skillName, content, normalizedCommands, skillPath, diagnostics);
  validateRoadmapSkillContent(skillName, content, normalizedCommands, skillPath, diagnostics);
  validatePlanningSkillContent(skillName, content, normalizedCommands, skillPath, diagnostics);
  validateStrictWorkflowStateGuidance(skillName, content, normalizedCommands, skillPath, diagnostics);
  validatePreferredHumanLanguageGuidance(content, skillPath, diagnostics);
  validateWorkflowStateGuidanceIsNotRestated(content, skillPath, diagnostics);
  validateRequirementInterrogationGuidance(skillName, content, skillPath, diagnostics);
  validateReviewIndependenceGuidance(skillName, content, skillPath, diagnostics);
  validateTaskOrderGuidance(skillName, content, skillPath, diagnostics);
  validateCliOnlyYamlPolicy(skillName, content, normalizedCommands, skillPath, diagnostics);
  validateAuthoringProtocolPointer(skillName, content, normalizedCommands, skillPath, diagnostics);
}

/**
 * Rejects guidance that names a strict skill package absent from the validated skill set.
 *
 * The valid names are the package directories the packaging validator already discovered, so the
 * scope of this check comes from the filesystem rather than from the guidance it reads: deleting a
 * skill package makes every reference to it fail on the next run, with no list to keep in step. The
 * path carries the line because a skill file names many things, and a reader given only the file has
 * to search for the one that no longer resolves.
 *
 * The retirement-section carve-out that operator documentation uses is deliberately not applied
 * here. It exists so an upgrade note can name the commands it retires; a bundled skill has no such
 * text to write, and honouring the marker in a skill would turn it into a way for guidance to
 * exempt itself from the check.
 */
export function validateSkillReferences(
  content: string,
  packagedSkillNames: Iterable<string>,
  skillPath: string,
  diagnostics: SkillPackagingDiagnostic[],
): void {
  for (const { name, line } of findUnpackagedSkillReferences(content, packagedSkillNames)) {
    diagnostics.push(
      makeDiagnostic(
        "skill.reference.unpackaged",
        `${skillPath}:${line}`,
        `guidance names the skill '${name}', which has no package under skills/, so the slash command it routes to does not exist`,
        "a skill name with a package under skills/",
        name,
      ),
    );
  }
}
