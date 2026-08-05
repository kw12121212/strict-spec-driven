/**
 * The requirement-interrogation set, as typed workflow-required state.
 *
 * These five entries are seeded open when a change's questions artifact is first authored, so a
 * change starts blocked until a human answers them. They are answered only from the requester's own
 * words or from replayed roadmap detail — never from repository evidence, which can show what the
 * system does but never what a person wants.
 *
 * They are not placeholder content: the artifact-creation rule bars blank documents and placeholder
 * values but permits workflow-required state, and these carry real content a human must answer.
 * Keeping them in code rather than in a bundled template is what lets the questions artifact be
 * created from typed defaults, with no scaffold file to copy or to pattern-match later.
 */

export type CanonicalRequirementQuestion = {
  /** Stable, language-neutral id the readiness gate checks for. */
  id: string;
  /** Short restatement used in readiness diagnostics, so a blocked ready is actionable. */
  asks: string;
  /** The human-facing question text. */
  question: string;
  /** Why the question is asked, what a sufficient answer contains, and what the answer changes. */
  context: string;
};

export const CANONICAL_REQUIREMENT_QUESTIONS: ReadonlyArray<CanonicalRequirementQuestion> = [
  {
    id: "requirement-problem",
    asks: "what is concretely going wrong today, and for whom",
    question: "What is concretely going wrong today, and for whom?",
    context:
      "Why this is asked: the change is planned against a need, and the need lives only with the "
      + "requester. A \"problem\" here means what someone does or suffers today — not a feature that is "
      + "missing. If the answer names a button, a field, a page, or an endpoint, it is a solution, and "
      + "the underlying problem is still unstated. What a sufficient answer contains: who is affected, "
      + "what they do today instead, and how often. Worked example: \"every Monday one person spends "
      + "forty minutes copying order rows into a spreadsheet to send the weekly report\". What it "
      + "changes: this becomes the proposal's why, and it decides whether the change is worth making.",
  },
  {
    id: "requirement-outcome",
    asks: "what observable difference proves the problem is solved",
    question: "What observable difference proves the problem is solved?",
    context:
      "Why this is asked: without a success condition, nobody can tell afterwards whether the change "
      + "worked. \"Observable\" means someone outside the system can check it without reading the code. "
      + "What a sufficient answer contains: what a person will see, or no longer have to do, once this "
      + "is done. Worked example: \"the report is in the manager's inbox on Monday morning without "
      + "anyone assembling it\". What it changes: this becomes the delta spec's scenarios and the "
      + "acceptance evidence at review time.",
  },
  {
    id: "requirement-trigger",
    asks: "why now — what forced this",
    question: "Why now — what forced this?",
    context:
      "Why this is asked: work that nothing forced is the work most often thrown away later. This "
      + "question catches a request that sounds reasonable but has no real driver behind it. What a "
      + "sufficient answer contains: the concrete event, deadline, incident, or cost that made this "
      + "surface now, or an honest statement that nothing did. Worked example: \"the report was missed "
      + "last month and it was raised with the team\". What it changes: a change with no trigger is a "
      + "candidate for deferral, and the answer is weighed at review before archive.",
  },
  {
    id: "requirement-non-goals",
    asks: "what must explicitly not change",
    question: "What must explicitly not change?",
    context:
      "Why this is asked: the requester knows which nearby behavior other people depend on, and the "
      + "agent does not. A \"non-goal\" is something the change must leave alone even though it sits "
      + "close to the work. What a sufficient answer contains: the behavior, setting, or output that "
      + "must survive untouched, and who relies on it. Worked example: \"do not change the saved "
      + "filters — several people rely on their own\". What it changes: these become the proposal's "
      + "unchanged_behavior items, which review checks the finished result against.",
  },
  {
    id: "requirement-interpretation",
    asks: "which reading of the request is intended",
    question: "Which reading of the request is intended, where more than one is possible?",
    context:
      "Why this is asked: a short request usually admits several readings, and building the wrong one "
      + "is indistinguishable from building nothing. What a sufficient answer contains: the reading "
      + "that is meant, stated plainly enough to rule the others out — or a statement that only one "
      + "reading exists and what it is. Worked example: \"export means the version sent to the manager, "
      + "not the one I read myself\". What it changes: this fixes the scope boundary before any code is "
      + "written, and settles disputes about what was asked for.",
  },
];

/** The seeded open entries a newly created questions artifact starts with. */
export function buildSeededRequirementQuestions(): Record<string, unknown>[] {
  return CANONICAL_REQUIREMENT_QUESTIONS.map((canonical) => ({
    id: canonical.id,
    question: canonical.question,
    context: canonical.context,
    kind: "requirement",
    status: "open",
  }));
}
