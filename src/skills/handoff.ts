/**
 * Recognizing when shipped guidance assumes one particular agent or harness.
 *
 * Two forms of that assumption are matched here, because both fail the same way and a future author
 * looking for either should find one place rather than two.
 *
 * A skill handoff is a routing instruction: it names the skill that owns the next phase and lets the
 * running harness decide how that skill is loaded. Naming the mechanism instead — "invoke it via the
 * Skill tool" — makes the instruction true only on the harness that happens to offer that name, and
 * an agent running elsewhere reads the step as naming something it does not have and stops at the
 * handoff. Naming an AI product as the actor the guidance addresses — "use when <product> should
 * scaffold" — fails one step earlier: an agent that is not that product reads the skill as addressed
 * to someone else and never routes to it at all.
 *
 * Both failures are silent: the guidance still validates, still reads fluently, and the workflow
 * simply becomes manual at the point it was supposed to continue on its own.
 *
 * This module owns the matching so the shipped validation command reads one source. A matcher that
 * lived only in a test suite would prove the pattern fires, never that the command an operator runs
 * reports the failure.
 */

/** A named harness mechanism found in guidance, with the 1-based line it appears on. */
export type HarnessMechanismReference = {
  mechanism: string;
  line: number;
};

/**
 * The mechanism half of the match: a determiner, a capitalised name, and the word `tool`.
 *
 * It is written generically rather than as an enumeration of known harness tool names because the
 * defect is precisely that guidance named a mechanism some other harness does not offer — a list
 * only ever covers the harnesses someone already thought of, so the next unlisted name would
 * reproduce the failure the rule exists to stop. Whitespace is matched permissively so a phrase the
 * author wrapped across two lines is still one mechanism rather than an invisible exemption, and the
 * optional backticks catch the form that reads as a literal tool identifier.
 */
export const HARNESS_TOOL_MECHANISM_PATTERN =
  /\b(?:the|a|your|its|our)\s+`?([A-Z][A-Za-z]*)`?\s+tool\b/g;

/**
 * Capitalised names that denote a program a skill runs rather than a way to reach another skill.
 *
 * The strict CLI is named in almost every skill, beside the word skill, for reasons that have
 * nothing to do with a handoff. Admitting it would make the check report correct guidance, which is
 * the fastest way to teach an author to work around a check rather than obey it.
 */
export const NON_HARNESS_MECHANISM_NAMES: ReadonlySet<string> = new Set(["CLI"]);

/** Guidance that routes the reader to a skill, either by the word itself or by a package name. */
const SKILL_ROUTING_PATTERN = /\bskills?\b|strict-(?:spec|roadmap|tech)-[a-z0-9-]+/i;

/** The blank-line-delimited block `index` falls inside. */
function blockAround(text: string, index: number): string {
  const separator = /\n[ \t]*\n/g;
  const preceding = [...text.slice(0, index).matchAll(separator)].pop();
  const start = preceding === undefined ? 0 : (preceding.index ?? 0) + preceding[0].length;
  const following = text.slice(index).match(/\n[ \t]*\n/);
  const end = index + (following?.index ?? text.length - index);
  return text.slice(start, end);
}

/**
 * Every named harness mechanism in `text` that appears inside guidance routing the reader to a skill.
 *
 * Both halves are required because the rule governs how a handoff is worded, not every mention of a
 * program: a line naming some command-line tool while routing the reader nowhere is not the defect,
 * and reporting it would make the check a source of findings an author has to argue with. The
 * matched phrase is removed before the routing half is tested, because the phrase can itself contain
 * the word `Skill` and would otherwise satisfy the test it is supposed to be judged against.
 *
 * The surrounding block rather than the line is what gets tested, since a step long enough to name a
 * mechanism is normally wrapped across several lines, and asking the line alone would let the same
 * sentence pass or fail on where the author happened to break it.
 */
export function findHarnessMechanismHandoffs(text: string): HarnessMechanismReference[] {
  const found: HarnessMechanismReference[] = [];
  for (const match of text.matchAll(HARNESS_TOOL_MECHANISM_PATTERN)) {
    if (NON_HARNESS_MECHANISM_NAMES.has(match[1] as string)) continue;
    const index = match.index ?? 0;
    const routingContext = blockAround(text, index).split(match[0]).join(" ");
    if (!SKILL_ROUTING_PATTERN.test(routingContext)) continue;
    found.push({
      mechanism: match[0].replace(/\s+/g, " "),
      line: text.slice(0, index).split("\n").length,
    });
  }
  return found;
}

/** Text tying guidance to one AI product, with the 1-based line it appears on. */
export type NamedProductReference = {
  text: string;
  category: "named-product" | "product-actor-clause";
  line: number;
};

/**
 * AI product names that are not ordinary words in this repository's prose.
 *
 * Names that double as common English words are deliberately absent. Admitting one would make the
 * check report correct guidance, and a check that argues with correct text teaches an author to work
 * around it rather than obey it; the clause matcher below is what covers the names this list omits.
 */
export const NAMED_AI_PRODUCTS: readonly string[] = [
  "Aider",
  "Anthropic",
  "ChatGPT",
  "Claude",
  "Codex",
  "Copilot",
  "Cursor",
  "Devin",
  "Gemini",
  "GPT",
  "OpenAI",
  "Windsurf",
];

const NAMED_AI_PRODUCT_PATTERN = new RegExp(`\\b(?:${NAMED_AI_PRODUCTS.join("|")})\\b`, "g");

/**
 * The routing clause an Agent Skills description is written in, with a capitalised actor.
 *
 * It exists for the product the list cannot name: one that did not exist when the list was written.
 * The literal `use when` prefix keeps it tight — that phrase is the description idiom, so a
 * capitalised word in that position is a named actor rather than ordinary prose, and the bundled
 * descriptions that word the same clause around a condition ("use when the request names a
 * milestone") carry a lowercase subject and are not matched.
 */
export const PRODUCT_ACTOR_CLAUSE_PATTERN =
  /\b[Uu]se\s+when\s+([A-Z][A-Za-z]+)\s+(?:should|shall|has|have|needs?|must|wants?|can|is|are)\b/g;

/**
 * Every mention in `text` that ties the guidance to one named AI product.
 *
 * A clause whose actor the product list already names is not reported twice: the list covers a known
 * name wherever it is written, and the clause exists only to catch a name the list does not know, so
 * reporting both would give two findings for one defect and one fix.
 */
export function findNamedAiProducts(text: string): NamedProductReference[] {
  const lineOf = (index: number): number => text.slice(0, index).split("\n").length;
  const found: NamedProductReference[] = [];
  for (const match of text.matchAll(NAMED_AI_PRODUCT_PATTERN)) {
    found.push({ text: match[0], category: "named-product", line: lineOf(match.index ?? 0) });
  }
  for (const match of text.matchAll(PRODUCT_ACTOR_CLAUSE_PATTERN)) {
    if (NAMED_AI_PRODUCTS.includes(match[1] as string)) continue;
    found.push({
      text: match[0].replace(/\s+/g, " "),
      category: "product-actor-clause",
      line: lineOf(match.index ?? 0),
    });
  }
  return found;
}
