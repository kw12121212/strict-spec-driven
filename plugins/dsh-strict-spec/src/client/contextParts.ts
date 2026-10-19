/**
 * The project-context view-model mappers: turn one parsed workflow config,
 * architecture document, technical standard, tech index, lesson, lessons
 * index, SOP, SOP category, SOPs index, and design system into the
 * presentation structure its dedicated renderer draws, keeping the mapping
 * React-free so rendered structure is deterministically testable under
 * bun test/run.ts.
 *
 * Every mapper follows the same unknown-field contract the milestone's
 * unknown-field-display answer settles: the scalar header renders exactly
 * as the generic view draws it, the dedicated body presents the declared
 * fields the layout knows, and every top-level field the layout does not
 * present survives as generic blocks an additional-fields section renders,
 * so a newer schema version never makes content disappear from the reader.
 * Each mapper reads only fields its artifact schema declares, so a group
 * appears only when the document declares it.
 */
import type { DedicatedView } from "./changeParts.ts";
import { partitionDocument, scalarField, scalarText, soleValue, stringEntries, stringField } from "./recordFields.ts";
import { techRule } from "./deltaParts.ts";
import type { TechRule } from "./deltaParts.ts";

/** The identity block a keyed artifact wrapper declares: an id and a title. */
export interface ArtifactIdentity {
  readonly id?: string;
  readonly title?: string;
  readonly description?: string;
}

/** Reads the identity of one keyed artifact wrapper, such as lesson or sop. */
function keyedIdentity(wrapper: unknown): ArtifactIdentity | undefined {
  if (wrapper === undefined) {
    return undefined;
  }
  return {
    id: stringField(wrapper, "id"),
    title: stringField(wrapper, "title"),
    description: stringField(wrapper, "description"),
  };
}

// ---------------------------------------------------------------------------
// Workflow config
// ---------------------------------------------------------------------------

/** One category group of the config's declared rules. */
export interface ConfigRuleGroup {
  readonly category: string;
  readonly entries: readonly string[];
}

/** The declared coverage contract of one review-evidence entry. */
export interface ConfigCoverage {
  readonly threshold?: string;
  readonly metric?: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

/** One named review-evidence entry with its command and coverage threshold. */
export interface ConfigEvidence {
  readonly name: string;
  readonly method?: string;
  readonly command?: string;
  readonly meaning?: string;
  readonly unavailableBehavior?: string;
  readonly coverage?: ConfigCoverage;
}

/** One declared maintenance check: a bare text or its scalar fields. */
export interface MaintenanceCheck {
  readonly text?: string;
  readonly fields: readonly { readonly key: string; readonly text: string }[];
}

/** The config view body: context, grouped rules, evidence, and maintenance. */
export interface ConfigBody {
  readonly context?: string;
  readonly ruleGroups: readonly ConfigRuleGroup[];
  readonly evidence: readonly ConfigEvidence[];
  readonly maintenanceChecks: readonly MaintenanceCheck[];
}

/** The top-level keys the config layout presents. */
const CONFIG_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "preferred_human_language",
  "context", "rules", "review_evidence", "maintenance",
]);

/** Maps one parsed workflow config onto the config view's presentation. */
export function configView(data: unknown): DedicatedView<ConfigBody> {
  const ruleGroups: ConfigRuleGroup[] = [];
  const rulesSource = soleValue(data, "rules");
  if (typeof rulesSource === "object" && rulesSource !== null) {
    for (const [category, entries] of Object.entries(rulesSource as Record<string, unknown>)) {
      const mapped = stringEntries(entries);
      if (mapped.length > 0) {
        ruleGroups.push({ category, entries: mapped });
      }
    }
  }
  const evidence: ConfigEvidence[] = [];
  const evidenceSource = soleValue(data, "review_evidence");
  if (typeof evidenceSource === "object" && evidenceSource !== null) {
    for (const [name, entry] of Object.entries(evidenceSource as Record<string, unknown>)) {
      const coverageSource = soleValue(entry, "coverage");
      const scope = coverageSource === undefined ? undefined : soleValue(coverageSource, "scope");
      evidence.push({
        name,
        method: stringField(entry, "method"),
        command: stringField(entry, "command"),
        meaning: stringField(entry, "meaning"),
        unavailableBehavior: stringField(entry, "unavailable_behavior"),
        coverage: coverageSource === undefined
          ? undefined
          : {
            threshold: scalarField(coverageSource, "threshold"),
            metric: scalarField(coverageSource, "metric"),
            include: scope === undefined ? [] : stringEntries(soleValue(scope, "include")),
            exclude: scope === undefined ? [] : stringEntries(soleValue(scope, "exclude")),
          },
      });
    }
  }
  const maintenanceChecks: MaintenanceCheck[] = [];
  const checksSource = soleValue(soleValue(data, "maintenance"), "checks");
  if (Array.isArray(checksSource)) {
    for (const check of checksSource) {
      const text = scalarText(check);
      if (text !== undefined) {
        maintenanceChecks.push({ text, fields: [] });
        continue;
      }
      if (typeof check === "object" && check !== null) {
        const fields: { key: string; text: string }[] = [];
        for (const [key, value] of Object.entries(check as Record<string, unknown>)) {
          const fieldText = scalarText(value);
          if (fieldText !== undefined) {
            fields.push({ key, text: fieldText });
          }
        }
        if (fields.length > 0) {
          maintenanceChecks.push({ fields });
        }
      }
    }
  }
  const body: ConfigBody = {
    context: stringField(data, "context"),
    ruleGroups,
    evidence,
    maintenanceChecks,
  };
  return { ...partitionDocument(data, CONFIG_KEYS), body };
}

// ---------------------------------------------------------------------------
// Architecture
// ---------------------------------------------------------------------------

/** One declared architecture component with its responsibility and links. */
export interface ArchitectureComponent {
  readonly id: string;
  readonly title?: string;
  readonly responsibility?: string;
  readonly boundaries: readonly string[];
  readonly dependsOn: readonly string[];
  readonly implementation: readonly string[];
}

/** One declared data flow with its trigger and ordered steps. */
export interface ArchitectureFlow {
  readonly id: string;
  readonly title?: string;
  readonly trigger?: string;
  readonly steps: readonly string[];
  readonly components: readonly string[];
}

/** One declared architecture decision. */
export interface ArchitectureDecision {
  readonly id: string;
  readonly title?: string;
  readonly statement?: string;
  readonly rationale?: string;
  readonly status?: string;
  readonly alternatives: readonly string[];
}

/** The architecture view body: identity, components, flows, and decisions. */
export interface ArchitectureBody {
  readonly identity?: ArtifactIdentity;
  readonly components: readonly ArchitectureComponent[];
  readonly dataFlows: readonly ArchitectureFlow[];
  readonly decisions: readonly ArchitectureDecision[];
}

/** The top-level keys the architecture layout presents. */
const ARCHITECTURE_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "architecture", "components", "data_flows", "decisions",
]);

/** Maps one parsed architecture document onto the architecture view's presentation. */
export function architectureView(data: unknown): DedicatedView<ArchitectureBody> {
  const components: ArchitectureComponent[] = [];
  const componentsSource = soleValue(data, "components");
  if (typeof componentsSource === "object" && componentsSource !== null) {
    for (const [id, entry] of Object.entries(componentsSource as Record<string, unknown>)) {
      const mapping = soleValue(entry, "mapping");
      components.push({
        id,
        title: stringField(entry, "title"),
        responsibility: stringField(entry, "responsibility"),
        boundaries: stringEntries(soleValue(entry, "boundaries")),
        dependsOn: stringEntries(soleValue(entry, "depends_on")),
        implementation: mapping === undefined ? [] : stringEntries(soleValue(mapping, "implementation")),
      });
    }
  }
  const dataFlows: ArchitectureFlow[] = [];
  const flowsSource = soleValue(data, "data_flows");
  if (typeof flowsSource === "object" && flowsSource !== null) {
    for (const [id, entry] of Object.entries(flowsSource as Record<string, unknown>)) {
      dataFlows.push({
        id,
        title: stringField(entry, "title"),
        trigger: stringField(entry, "trigger"),
        steps: stringEntries(soleValue(entry, "steps")),
        components: stringEntries(soleValue(entry, "components")),
      });
    }
  }
  const decisions: ArchitectureDecision[] = [];
  const decisionsSource = soleValue(data, "decisions");
  if (typeof decisionsSource === "object" && decisionsSource !== null) {
    for (const [id, entry] of Object.entries(decisionsSource as Record<string, unknown>)) {
      decisions.push({
        id,
        title: stringField(entry, "title"),
        statement: stringField(entry, "statement"),
        rationale: stringField(entry, "rationale"),
        status: stringField(entry, "status"),
        alternatives: stringEntries(soleValue(entry, "alternatives")),
      });
    }
  }
  const body: ArchitectureBody = {
    identity: keyedIdentity(soleValue(data, "architecture")),
    components,
    dataFlows,
    decisions,
  };
  return { ...partitionDocument(data, ARCHITECTURE_KEYS), body };
}

// ---------------------------------------------------------------------------
// Technical standard and tech index
// ---------------------------------------------------------------------------

/** The technical standard view body: identity and its rules. */
export interface TechStandardBody {
  readonly identity?: ArtifactIdentity;
  readonly category?: string;
  readonly rules: readonly TechRule[];
}

/** The top-level keys the technical standard layout presents. */
const TECH_STANDARD_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "standard", "rules",
]);

/** Maps one parsed technical standard onto the standard view's presentation. */
export function techStandardView(data: unknown): DedicatedView<TechStandardBody> {
  const standard = soleValue(data, "standard");
  const rules: TechRule[] = [];
  const rulesSource = soleValue(data, "rules");
  if (typeof rulesSource === "object" && rulesSource !== null) {
    for (const [id, entry] of Object.entries(rulesSource as Record<string, unknown>)) {
      rules.push(techRule(id, entry));
    }
  }
  const body: TechStandardBody = {
    identity: keyedIdentity(standard),
    category: standard === undefined ? undefined : stringField(standard, "category"),
    rules,
  };
  return { ...partitionDocument(data, TECH_STANDARD_KEYS), body };
}

/** One standards entry of the tech index. */
export interface TechIndexEntry {
  readonly id: string;
  readonly title?: string;
  readonly category?: string;
  readonly path?: string;
}

/** The tech index view body: its recorded standards. */
export interface TechIndexBody {
  readonly standards: readonly TechIndexEntry[];
}

/** The top-level keys the tech index layout presents. */
const TECH_INDEX_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "standards",
]);

/** Maps one parsed tech index onto the tech index view's presentation. */
export function techIndexView(data: unknown): DedicatedView<TechIndexBody> {
  const standards: TechIndexEntry[] = [];
  const standardsSource = soleValue(data, "standards");
  if (Array.isArray(standardsSource)) {
    for (const entry of standardsSource) {
      const id = stringField(entry, "id");
      if (id === undefined) {
        continue;
      }
      standards.push({
        id,
        title: stringField(entry, "title"),
        category: stringField(entry, "category"),
        path: stringField(entry, "path"),
      });
    }
  }
  return { ...partitionDocument(data, TECH_INDEX_KEYS), body: { standards } };
}

// ---------------------------------------------------------------------------
// Lesson and lessons index
// ---------------------------------------------------------------------------

/** One occurrence that proves a lesson's recurrence. */
export interface LessonOccurrence {
  readonly origin: string;
  readonly date?: string;
  readonly evidence?: string;
}

/** The lesson view body: identity, narrative, occurrences, and lifecycle. */
export interface LessonBody {
  readonly identity?: ArtifactIdentity;
  readonly category?: string;
  readonly status?: string;
  readonly context?: string;
  readonly observation?: string;
  readonly takeaway?: string;
  readonly appliesWhen?: string;
  readonly occurrences: readonly LessonOccurrence[];
  readonly promotedTo?: { readonly standard?: string; readonly rule?: string };
  readonly obsoletedReason?: string;
  readonly obsoletedAt?: string;
}

/** The top-level keys the lesson layout presents. */
const LESSON_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "lesson", "category", "status", "created_at", "updated_at",
  "context", "observation", "takeaway", "applies_when", "occurrences",
  "promoted_to", "obsoleted_reason", "obsoleted_at",
]);

/** Maps one parsed lesson onto the lesson view's presentation. */
export function lessonView(data: unknown): DedicatedView<LessonBody> {
  const occurrences: LessonOccurrence[] = [];
  const occurrencesSource = soleValue(data, "occurrences");
  if (Array.isArray(occurrencesSource)) {
    for (const entry of occurrencesSource) {
      const origin = stringField(entry, "origin");
      if (origin === undefined) {
        continue;
      }
      occurrences.push({
        origin,
        date: stringField(entry, "date"),
        evidence: stringField(entry, "evidence"),
      });
    }
  }
  const promotedTo = soleValue(data, "promoted_to");
  const body: LessonBody = {
    identity: keyedIdentity(soleValue(data, "lesson")),
    category: stringField(data, "category"),
    status: stringField(data, "status"),
    context: stringField(data, "context"),
    observation: stringField(data, "observation"),
    takeaway: stringField(data, "takeaway"),
    appliesWhen: stringField(data, "applies_when"),
    occurrences,
    promotedTo: promotedTo === undefined
      ? undefined
      : { standard: stringField(promotedTo, "standard"), rule: stringField(promotedTo, "rule") },
    obsoletedReason: stringField(data, "obsoleted_reason"),
    obsoletedAt: stringField(data, "obsoleted_at"),
  };
  return { ...partitionDocument(data, LESSON_KEYS), body };
}

/** One lesson entry of a lessons index category. */
export interface LessonsIndexEntry {
  readonly id: string;
  readonly title?: string;
  readonly status?: string;
  readonly occurrences?: string;
  readonly path?: string;
}

/** One category group of a lessons index. */
export interface LessonsIndexCategory {
  readonly category: string;
  readonly lessons: readonly LessonsIndexEntry[];
}

/** The lessons index view body: categories with their lessons. */
export interface LessonsIndexBody {
  readonly categories: readonly LessonsIndexCategory[];
}

/** The top-level keys the lessons index layout presents. */
const LESSONS_INDEX_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "categories",
]);

/** Maps one parsed lessons index onto the lessons index view's presentation. */
export function lessonsIndexView(data: unknown): DedicatedView<LessonsIndexBody> {
  const categories: LessonsIndexCategory[] = [];
  const categoriesSource = soleValue(data, "categories");
  if (typeof categoriesSource === "object" && categoriesSource !== null) {
    for (const [category, lessonsSource] of Object.entries(categoriesSource as Record<string, unknown>)) {
      const lessons: LessonsIndexEntry[] = [];
      if (typeof lessonsSource === "object" && lessonsSource !== null) {
        for (const [id, entry] of Object.entries(lessonsSource as Record<string, unknown>)) {
          lessons.push({
            id,
            title: stringField(entry, "title"),
            status: stringField(entry, "status"),
            occurrences: scalarField(entry, "occurrences"),
            path: stringField(entry, "path"),
          });
        }
      }
      if (lessons.length > 0) {
        categories.push({ category, lessons });
      }
    }
  }
  return { ...partitionDocument(data, LESSONS_INDEX_KEYS), body: { categories } };
}

// ---------------------------------------------------------------------------
// SOP, SOP category, and SOPs index
// ---------------------------------------------------------------------------

/** One declared SOP role. */
export interface SopRole {
  readonly id: string;
  readonly name?: string;
  readonly responsibility?: string;
}

/** One declared branch of an SOP step. */
export interface SopBranch {
  readonly condition?: string;
  readonly gotoStep?: string;
}

/** One declared SOP step, ordered by its declared order value. */
export interface SopStep {
  readonly id: string;
  readonly order?: string;
  readonly actor?: string;
  readonly action?: string;
  readonly expectedResult?: string;
  readonly branches: readonly SopBranch[];
}

/** One declared SOP exception. */
export interface SopException {
  readonly condition?: string;
  readonly handling?: string;
}

/** The SOP view body: identity, narrative, roles, steps, and outcomes. */
export interface SopBody {
  readonly identity?: ArtifactIdentity;
  readonly category?: string;
  readonly status?: string;
  readonly purpose?: string;
  readonly scopeIn: readonly string[];
  readonly scopeOut: readonly string[];
  readonly trigger?: string;
  readonly roles: readonly SopRole[];
  readonly prerequisites: readonly string[];
  readonly steps: readonly SopStep[];
  readonly exceptions: readonly SopException[];
  readonly successCriteria: readonly string[];
}

/** The top-level keys the SOP layout presents. */
const SOP_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "sop", "category", "status", "created_at", "updated_at",
  "purpose", "scope", "trigger", "roles", "prerequisites", "steps",
  "exceptions", "success_criteria",
]);

/** Reads the numeric order of one SOP step entry, when it declares one. */
function stepOrder(entry: readonly [unknown, SopStep]): number {
  const [source] = entry;
  const raw = scalarField(source, "order");
  if (raw === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

/** Maps one parsed SOP onto the SOP view's presentation. */
export function sopView(data: unknown): DedicatedView<SopBody> {
  const roles: SopRole[] = [];
  const rolesSource = soleValue(data, "roles");
  if (Array.isArray(rolesSource)) {
    for (const entry of rolesSource) {
      const id = stringField(entry, "id");
      if (id === undefined) {
        continue;
      }
      roles.push({
        id,
        name: stringField(entry, "name"),
        responsibility: stringField(entry, "responsibility"),
      });
    }
  }
  const scopedSteps: (readonly [unknown, SopStep])[] = [];
  const stepsSource = soleValue(data, "steps");
  if (Array.isArray(stepsSource)) {
    for (const entry of stepsSource) {
      const id = stringField(entry, "id");
      if (id === undefined) {
        continue;
      }
      const branches: SopBranch[] = [];
      const branchesSource = soleValue(entry, "branches");
      if (Array.isArray(branchesSource)) {
        for (const branch of branchesSource) {
          branches.push({
            condition: stringField(branch, "condition"),
            gotoStep: stringField(branch, "goto_step"),
          });
        }
      }
      scopedSteps.push([
        entry,
        {
          id,
          order: scalarField(entry, "order"),
          actor: stringField(entry, "actor"),
          action: stringField(entry, "action"),
          expectedResult: stringField(entry, "expected_result"),
          branches,
        },
      ]);
    }
  }
  // Steps list in the order their declared order values assign; the sort is
  // stable, so equal or absent order values keep their declaration order.
  const steps = scopedSteps
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => stepOrder(left.entry) - stepOrder(right.entry) || left.index - right.index)
    .map((sorted) => sorted.entry[1]);
  const exceptions: SopException[] = [];
  const exceptionsSource = soleValue(data, "exceptions");
  if (Array.isArray(exceptionsSource)) {
    for (const entry of exceptionsSource) {
      exceptions.push({
        condition: stringField(entry, "condition"),
        handling: stringField(entry, "handling"),
      });
    }
  }
  const scope = soleValue(data, "scope");
  const body: SopBody = {
    identity: keyedIdentity(soleValue(data, "sop")),
    category: stringField(data, "category"),
    status: stringField(data, "status"),
    purpose: stringField(data, "purpose"),
    scopeIn: scope === undefined ? [] : stringEntries(soleValue(scope, "in")),
    scopeOut: scope === undefined ? [] : stringEntries(soleValue(scope, "out")),
    trigger: stringField(data, "trigger"),
    roles,
    prerequisites: stringEntries(soleValue(data, "prerequisites")),
    steps,
    exceptions,
    successCriteria: stringEntries(soleValue(data, "success_criteria")),
  };
  return { ...partitionDocument(data, SOP_KEYS), body };
}

/** One intake question of an SOP category. */
export interface SopCategoryQuestion {
  readonly id: string;
  readonly prompt?: string;
  readonly mapsTo?: string;
  readonly required?: boolean;
}

/** The SOP category view body: identity, questions, and constraints. */
export interface SopCategoryBody {
  readonly identity?: ArtifactIdentity;
  readonly questions: readonly SopCategoryQuestion[];
  readonly constraints?: { readonly requiredSections: readonly string[]; readonly minSteps?: string };
}

/** The top-level keys the SOP category layout presents. */
const SOP_CATEGORY_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "category", "questions", "constraints",
]);

/** Maps one parsed SOP category onto the SOP category view's presentation. */
export function sopCategoryView(data: unknown): DedicatedView<SopCategoryBody> {
  const questions: SopCategoryQuestion[] = [];
  const questionsSource = soleValue(data, "questions");
  if (Array.isArray(questionsSource)) {
    for (const entry of questionsSource) {
      const id = stringField(entry, "id");
      if (id === undefined) {
        continue;
      }
      const required = soleValue(entry, "required");
      questions.push({
        id,
        prompt: stringField(entry, "prompt"),
        mapsTo: stringField(entry, "maps_to"),
        required: typeof required === "boolean" ? required : undefined,
      });
    }
  }
  const constraintsSource = soleValue(data, "constraints");
  const body: SopCategoryBody = {
    identity: keyedIdentity(soleValue(data, "category")),
    questions,
    constraints: constraintsSource === undefined
      ? undefined
      : {
        requiredSections: stringEntries(soleValue(constraintsSource, "required_sections")),
        minSteps: scalarField(constraintsSource, "min_steps"),
      },
  };
  return { ...partitionDocument(data, SOP_CATEGORY_KEYS), body };
}

/** One SOP entry of the SOPs index. */
export interface SopsIndexEntry {
  readonly id: string;
  readonly title?: string;
  readonly category?: string;
  readonly status?: string;
  readonly path?: string;
}

/** The SOPs index view body: its recorded SOPs. */
export interface SopsIndexBody {
  readonly sops: readonly SopsIndexEntry[];
}

/** The top-level keys the SOPs index layout presents. */
const SOPS_INDEX_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "sops",
]);

/** Maps one parsed SOPs index onto the SOPs index view's presentation. */
export function sopsIndexView(data: unknown): DedicatedView<SopsIndexBody> {
  const sops: SopsIndexEntry[] = [];
  const sopsSource = soleValue(data, "sops");
  if (typeof sopsSource === "object" && sopsSource !== null) {
    for (const [id, entry] of Object.entries(sopsSource as Record<string, unknown>)) {
      sops.push({
        id,
        title: stringField(entry, "title"),
        category: stringField(entry, "category"),
        status: stringField(entry, "status"),
        path: stringField(entry, "path"),
      });
    }
  }
  return { ...partitionDocument(data, SOPS_INDEX_KEYS), body: { sops } };
}

// ---------------------------------------------------------------------------
// Design system
// ---------------------------------------------------------------------------

/** One named token value or nested token group inside a family. */
export interface DesignTokenNode {
  readonly name: string;
  /** The token's declared value, when the entry is a scalar. */
  readonly value?: string;
  /** Nested token groups, when the entry groups tokens, such as typography. */
  readonly children: readonly DesignTokenNode[];
}

/** One token family with its named values and nested groups. */
export interface DesignTokenFamily {
  readonly family: string;
  readonly nodes: readonly DesignTokenNode[];
}

/** One declared design-system component. */
export interface DesignComponent {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly tokenRefs: readonly { readonly key: string; readonly value: string }[];
  readonly implementation: readonly string[];
  readonly snapshots: readonly string[];
}

/** The declared design-system guidance. */
export interface DesignGuidance {
  readonly overview?: string;
  readonly do: readonly string[];
  readonly dont: readonly string[];
}

/** The design system view body: identity, tokens, components, and guidance. */
export interface DesignSystemBody {
  readonly identity?: ArtifactIdentity;
  readonly tokenFamilies: readonly DesignTokenFamily[];
  readonly components: readonly DesignComponent[];
  readonly guidance?: DesignGuidance;
}

/** The top-level keys the design system layout presents. */
const DESIGN_SYSTEM_KEYS: ReadonlySet<string> = new Set([
  "schema", "schema_version", "artifact_type", "schema_file",
  "design_system", "tokens", "components", "guidance",
]);

/** Maps one named token entry: a scalar token or a nested token group. */
function tokenNodes(values: unknown): DesignTokenNode[] {
  if (typeof values !== "object" || values === null) {
    return [];
  }
  const nodes: DesignTokenNode[] = [];
  for (const [name, value] of Object.entries(values as Record<string, unknown>)) {
    const text = scalarText(value);
    if (text !== undefined) {
      nodes.push({ name, value: text, children: [] });
      continue;
    }
    const children = tokenNodes(value);
    if (children.length > 0) {
      nodes.push({ name, children });
    }
  }
  return nodes;
}

/** Maps one parsed design system onto the design system view's presentation. */
export function designSystemView(data: unknown): DedicatedView<DesignSystemBody> {
  const tokenFamilies: DesignTokenFamily[] = [];
  const tokensSource = soleValue(data, "tokens");
  if (typeof tokensSource === "object" && tokensSource !== null) {
    for (const [family, values] of Object.entries(tokensSource as Record<string, unknown>)) {
      const nodes = tokenNodes(values);
      if (nodes.length > 0) {
        tokenFamilies.push({ family, nodes });
      }
    }
  }
  const components: DesignComponent[] = [];
  const componentsSource = soleValue(data, "components");
  if (typeof componentsSource === "object" && componentsSource !== null) {
    for (const [id, entry] of Object.entries(componentsSource as Record<string, unknown>)) {
      const tokenRefsSource = soleValue(entry, "tokens");
      const tokenRefs: { key: string; value: string }[] = [];
      if (typeof tokenRefsSource === "object" && tokenRefsSource !== null) {
        for (const [key, value] of Object.entries(tokenRefsSource as Record<string, unknown>)) {
          const text = scalarText(value);
          if (text !== undefined) {
            tokenRefs.push({ key, value: text });
          }
        }
      }
      const mapping = soleValue(entry, "mapping");
      components.push({
        id,
        title: stringField(entry, "title"),
        description: stringField(entry, "description"),
        tokenRefs,
        implementation: mapping === undefined ? [] : stringEntries(soleValue(mapping, "implementation")),
        snapshots: mapping === undefined ? [] : stringEntries(soleValue(mapping, "snapshots")),
      });
    }
  }
  const guidanceSource = soleValue(data, "guidance");
  const guidance = guidanceSource === undefined
    ? undefined
    : {
      overview: stringField(guidanceSource, "overview"),
      do: stringEntries(soleValue(guidanceSource, "do")),
      dont: stringEntries(soleValue(guidanceSource, "dont")),
    };
  const body: DesignSystemBody = {
    identity: keyedIdentity(soleValue(data, "design_system")),
    tokenFamilies,
    components,
    guidance,
  };
  return { ...partitionDocument(data, DESIGN_SYSTEM_KEYS), body };
}
