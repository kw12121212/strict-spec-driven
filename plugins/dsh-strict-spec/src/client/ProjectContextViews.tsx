/**
 * The dedicated project-context views: the workflow config, architecture,
 * technical standard, tech index, lesson, lessons index, SOP, SOP category,
 * SOPs index, and design system renderers the document view dispatches to
 * by declared artifact_type. Each view computes its structure through the
 * React-free context view models, renders its facts header from the scalar
 * fields exactly as the generic view draws them, and appends every
 * unrecognized top-level field through the generic additional-fields
 * section, so the dedicated layout never hides content. The technical
 * standard view draws its rule bodies through the shared rule layout the
 * delta tech view renders through. Components read data only through
 * props, per the plugin client conventions.
 */
import { Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ReactNode } from "react";
import type { DedicatedView, HeaderFact } from "./changeParts.ts";
import type { DedicatedViewProps } from "./ChangeArtifactViews.tsx";
import { RuleCard } from "./DeltaArtifactViews.tsx";
import {
  architectureView,
  configView,
  designSystemView,
  lessonView,
  lessonsIndexView,
  sopCategoryView,
  sopsIndexView,
  sopView,
  techIndexView,
  techStandardView,
} from "./contextParts.ts";
import type {
  ArchitectureBody,
  ConfigBody,
  DesignSystemBody,
  DesignTokenNode,
  LessonBody,
  LessonsIndexBody,
  SopBody,
  SopCategoryBody,
  SopsIndexBody,
  TechIndexBody,
  TechStandardBody,
} from "./contextParts.ts";
import { AdditionalFieldsView } from "./genericBlocks.tsx";
import styles from "./ArtifactViews.module.css";

/** The tone a declared lifecycle status badges with. */
const STATUS_TONES: Readonly<Record<string, "success" | "info" | "neutral" | "warning" | "outline" | "quiet">> = {
  active: "success",
  promoted: "info",
  obsolete: "neutral",
  draft: "warning",
};

/** Renders one dedicated view's facts header from its scalar fields. */
function ViewFacts(props: { readonly header: readonly HeaderFact[] }): ReactNode {
  const { header } = props;
  if (header.length === 0) {
    return null;
  }
  return (
    <header className={styles.facts}>
      {header.map((fact) => (
        <span key={fact.key} className={styles.fact}>
          <span className={styles.factKey}>{fact.key}</span>
          <span className={styles.factText}>{fact.text}</span>
        </span>
      ))}
    </header>
  );
}

/** Renders one titled section of a dedicated view. */
function ViewSection(props: { readonly title: string; readonly children: ReactNode }): ReactNode {
  const { title, children } = props;
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

/** Renders one labeled value row of a dedicated view. */
function MetaRow(props: { readonly label: string; readonly value: string }): ReactNode {
  const { label, value } = props;
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaKey}>{label}</span>
      <span className={styles.metaText}>{value}</span>
    </div>
  );
}

/** Renders optional meta rows for the fields a body declares. */
function MetaRows(props: { readonly rows: readonly { readonly label: string; readonly value: string }[] }): ReactNode {
  const { rows } = props;
  const present = rows.filter((row) => row.value !== undefined && row.value !== "");
  if (present.length === 0) {
    return null;
  }
  return (
    <div className={styles.meta}>
      {present.map((row) => (
        <MetaRow key={row.label} label={row.label} value={row.value as string} />
      ))}
    </div>
  );
}

/** Renders one string list section entry list, or nothing when empty. */
function EntryList(props: { readonly entries: readonly string[] }): ReactNode {
  const { entries } = props;
  if (entries.length === 0) {
    return null;
  }
  return (
    <ul className={styles.entries}>
      {entries.map((entry, index) => (
        <li key={index} className={styles.entry}>{entry}</li>
      ))}
    </ul>
  );
}

/** Renders one string list section: present only when it holds entries. */
function ListSection(props: { readonly title: string; readonly entries: readonly string[] }): ReactNode {
  const { title, entries } = props;
  if (entries.length === 0) {
    return null;
  }
  return (
    <ViewSection title={title}>
      <EntryList entries={entries} />
    </ViewSection>
  );
}

/** Renders one wrapped paragraph section: present only when declared. */
function ParagraphSection(props: { readonly title: string; readonly text?: string }): ReactNode {
  const { title, text } = props;
  if (text === undefined) {
    return null;
  }
  return (
    <ViewSection title={title}>
      <p className={styles.statement}>{text}</p>
    </ViewSection>
  );
}

/** Renders one declared status as a badge. */
function StatusTag(props: { readonly status?: string }): ReactNode {
  const { status } = props;
  if (status === undefined) {
    return null;
  }
  return <Tag tone={STATUS_TONES[status] ?? "outline"}>{status}</Tag>;
}

/** Renders one family's token nodes: scalars as rows, groups as named blocks. */
function TokenNodes(props: { readonly nodes: readonly DesignTokenNode[] }): ReactNode {
  const { nodes } = props;
  if (nodes.length === 0) {
    return null;
  }
  return (
    <div className={styles.meta}>
      {nodes.map((node) =>
        node.value === undefined ? (
          <div key={node.name} className={styles.scenario}>
            <span className={styles.cardId}>{node.name}</span>
            <TokenNodes nodes={node.children} />
          </div>
        ) : (
          <MetaRow key={node.name} label={node.name} value={node.value} />
        ),
      )}
    </div>
  );
}

/** Renders the config view: context, grouped rules, evidence, and maintenance. */
export function ConfigView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model: DedicatedView<ConfigBody> = configView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      <ParagraphSection title={t("config.context")} text={body.context} />
      {body.ruleGroups.length === 0 ? null : (
        <ViewSection title={t("config.rules")}>
          {body.ruleGroups.map((group) => (
            <div key={group.category} className={styles.meta}>
              <span className={styles.cardId}>{group.category}</span>
              <EntryList entries={group.entries} />
            </div>
          ))}
        </ViewSection>
      )}
      {body.evidence.map((entry) => (
        <ViewSection key={entry.name} title={entry.name}>
          <MetaRows
            rows={[
              { label: t("config.method"), value: entry.method ?? "" },
              { label: t("config.command"), value: entry.command ?? "" },
              { label: t("config.meaning"), value: entry.meaning ?? "" },
              { label: t("config.unavailable"), value: entry.unavailableBehavior ?? "" },
            ]}
          />
          {entry.coverage === undefined ? null : (
            <div className={styles.meta}>
              <span className={styles.cardId}>{t("config.coverage")}</span>
              <MetaRows
                rows={[
                  { label: t("config.threshold"), value: entry.coverage.threshold ?? "" },
                  { label: t("config.metric"), value: entry.coverage.metric ?? "" },
                ]}
              />
              <ListSection title={t("config.include")} entries={entry.coverage.include} />
              <ListSection title={t("config.exclude")} entries={entry.coverage.exclude} />
            </div>
          )}
        </ViewSection>
      ))}
      {body.maintenanceChecks.length === 0 ? null : (
        <ViewSection title={t("config.maintenance")}>
          {body.maintenanceChecks.map((check, index) => (
            <div key={index} className={styles.meta}>
              {check.text === undefined ? null : <span className={styles.entry}>{check.text}</span>}
              {check.fields.map((field) => (
                <MetaRow key={field.key} label={field.key} value={field.text} />
              ))}
            </div>
          ))}
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the architecture view: identity, components, flows, and decisions. */
export function ArchitectureView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model: DedicatedView<ArchitectureBody> = architectureView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      {body.identity === undefined ? null : (
        <div className={styles.meta}>
          <MetaRows
            rows={[
              { label: t("ctx.id"), value: body.identity.id ?? "" },
              { label: t("ctx.title"), value: body.identity.title ?? "" },
            ]}
          />
        </div>
      )}
      {body.components.length === 0 ? null : (
        <ViewSection title={t("architecture.components")}>
          {body.components.map((component) => (
            <div key={component.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{component.id}</span>
              </div>
              <MetaRows
                rows={[
                  { label: t("ctx.title"), value: component.title ?? "" },
                  { label: t("architecture.responsibility"), value: component.responsibility ?? "" },
                ]}
              />
              <EntryList entries={component.boundaries} />
              <div className={styles.meta}>
                {component.dependsOn.length === 0 ? null : (
                  <MetaRow label={t("architecture.depends-on")} value={component.dependsOn.join(", ")} />
                )}
                {component.implementation.length === 0 ? null : (
                  <MetaRow label={t("architecture.implementation")} value={component.implementation.join(", ")} />
                )}
              </div>
            </div>
          ))}
        </ViewSection>
      )}
      {body.dataFlows.length === 0 ? null : (
        <ViewSection title={t("architecture.data-flows")}>
          {body.dataFlows.map((flow) => (
            <div key={flow.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{flow.id}</span>
              </div>
              <MetaRows
                rows={[
                  { label: t("ctx.title"), value: flow.title ?? "" },
                  { label: t("ctx.trigger"), value: flow.trigger ?? "" },
                  { label: t("architecture.flow-components"), value: flow.components.join(", ") },
                ]}
              />
              <EntryList entries={flow.steps} />
            </div>
          ))}
        </ViewSection>
      )}
      {body.decisions.length === 0 ? null : (
        <ViewSection title={t("architecture.decisions")}>
          {body.decisions.map((decision) => (
            <div key={decision.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{decision.id}</span>
                <StatusTag status={decision.status} />
              </div>
              <MetaRows
                rows={[
                  { label: t("ctx.title"), value: decision.title ?? "" },
                  { label: t("architecture.statement"), value: decision.statement ?? "" },
                  { label: t("architecture.rationale"), value: decision.rationale ?? "" },
                ]}
              />
              <ListSection title={t("architecture.alternatives")} entries={decision.alternatives} />
            </div>
          ))}
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the technical standard view: identity with category and rules. */
export function TechStandardView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model: DedicatedView<TechStandardBody> = techStandardView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      <div className={styles.meta}>
        <MetaRows
          rows={[
            { label: t("ctx.id"), value: body.identity?.id ?? "" },
            { label: t("ctx.title"), value: body.identity?.title ?? "" },
            { label: t("ctx.category"), value: body.category ?? "" },
          ]}
        />
      </div>
      <ViewSection title={t("tech.rules")}>
        {body.rules.map((rule) => (
          <RuleCard key={rule.id} rule={rule} t={t} />
        ))}
      </ViewSection>
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the tech index view: the recorded standards. */
export function TechIndexView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model: DedicatedView<TechIndexBody> = techIndexView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      {body.standards.length === 0 ? null : (
        <ViewSection title={t("tech-index.standards")}>
          {body.standards.map((standard) => (
            <div key={standard.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{standard.id}</span>
              </div>
              <MetaRows
                rows={[
                  { label: t("ctx.title"), value: standard.title ?? "" },
                  { label: t("ctx.category"), value: standard.category ?? "" },
                  { label: t("ctx.path"), value: standard.path ?? "" },
                ]}
              />
            </div>
          ))}
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the lesson view: identity, narrative, occurrences, and lifecycle. */
export function LessonView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model: DedicatedView<LessonBody> = lessonView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      <div className={styles.meta}>
        <MetaRows
          rows={[
            { label: t("ctx.id"), value: body.identity?.id ?? "" },
            { label: t("ctx.title"), value: body.identity?.title ?? "" },
            { label: t("ctx.category"), value: body.category ?? "" },
          ]}
        />
      </div>
      <StatusTag status={body.status} />
      <ParagraphSection title={t("lesson.context")} text={body.context} />
      <ParagraphSection title={t("lesson.observation")} text={body.observation} />
      <ParagraphSection title={t("lesson.takeaway")} text={body.takeaway} />
      <ParagraphSection title={t("lesson.applies-when")} text={body.appliesWhen} />
      {body.occurrences.length === 0 ? null : (
        <ViewSection title={t("lesson.occurrences")}>
          {body.occurrences.map((occurrence, index) => (
            <div key={index} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{occurrence.origin}</span>
              </div>
              <MetaRows
                rows={[
                  { label: t("lesson.occurrence-date"), value: occurrence.date ?? "" },
                  { label: t("lesson.occurrence-evidence"), value: occurrence.evidence ?? "" },
                ]}
              />
            </div>
          ))}
        </ViewSection>
      )}
      {body.promotedTo === undefined ? null : (
        <div className={styles.meta}>
          <MetaRows
            rows={[
              { label: t("lesson.promoted-to"), value: body.promotedTo.standard ?? "" },
              { label: t("lesson.promoted-rule"), value: body.promotedTo.rule ?? "" },
            ]}
          />
        </div>
      )}
      {body.obsoletedReason === undefined && body.obsoletedAt === undefined ? null : (
        <div className={styles.meta}>
          <MetaRows
            rows={[
              { label: t("lesson.obsoleted-reason"), value: body.obsoletedReason ?? "" },
              { label: t("lesson.obsoleted-at"), value: body.obsoletedAt ?? "" },
            ]}
          />
        </div>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the lessons index view: lessons grouped by their categories. */
export function LessonsIndexView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model: DedicatedView<LessonsIndexBody> = lessonsIndexView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      {body.categories.map((category) => (
        <ViewSection key={category.category} title={category.category}>
          {category.lessons.map((lesson) => (
            <div key={lesson.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{lesson.id}</span>
                <StatusTag status={lesson.status} />
              </div>
              <MetaRows
                rows={[
                  { label: t("ctx.title"), value: lesson.title ?? "" },
                  { label: t("lessons-index.occurrences"), value: lesson.occurrences ?? "" },
                  { label: t("ctx.path"), value: lesson.path ?? "" },
                ]}
              />
            </div>
          ))}
        </ViewSection>
      ))}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the SOP view: narrative, roles, ordered steps, and outcomes. */
export function SopView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model: DedicatedView<SopBody> = sopView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      <div className={styles.meta}>
        <MetaRows
          rows={[
            { label: t("ctx.id"), value: body.identity?.id ?? "" },
            { label: t("ctx.title"), value: body.identity?.title ?? "" },
            { label: t("ctx.category"), value: body.category ?? "" },
          ]}
        />
      </div>
      <StatusTag status={body.status} />
      <ParagraphSection title={t("sop.purpose")} text={body.purpose} />
      <ParagraphSection title={t("ctx.trigger")} text={body.trigger} />
      {body.scopeIn.length === 0 && body.scopeOut.length === 0 ? null : (
        <ViewSection title={t("sop.scope")}>
          <div className={styles.meta}>
            <ListSection title={t("sop.scope-in")} entries={body.scopeIn} />
            <ListSection title={t("sop.scope-out")} entries={body.scopeOut} />
          </div>
        </ViewSection>
      )}
      {body.roles.length === 0 ? null : (
        <ViewSection title={t("sop.roles")}>
          {body.roles.map((role) => (
            <div key={role.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{role.id}</span>
              </div>
              <MetaRows
                rows={[
                  { label: t("ctx.title"), value: role.name ?? "" },
                  { label: t("sop.role-responsibility"), value: role.responsibility ?? "" },
                ]}
              />
            </div>
          ))}
        </ViewSection>
      )}
      <ListSection title={t("sop.prerequisites")} entries={body.prerequisites} />
      <ViewSection title={t("sop.steps")}>
        <ol className={styles.flowSteps}>
          {body.steps.map((step) => (
            <li key={step.id} className={styles.flowStep}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{step.id}</span>
                {step.order === undefined ? null : <span className={styles.completion}>{step.order}</span>}
              </div>
              <MetaRows
                rows={[
                  { label: t("sop.actor"), value: step.actor ?? "" },
                  { label: t("sop.expected-result"), value: step.expectedResult ?? "" },
                ]}
              />
              {step.action === undefined ? null : <p className={styles.statement}>{step.action}</p>}
              {step.branches.length === 0 ? null : (
                <div className={styles.meta}>
                  {step.branches.map((branch, index) => (
                    <MetaRow
                      key={index}
                      label={t("sop.branches")}
                      value={`${branch.condition ?? ""}${branch.gotoStep === undefined ? "" : ` → ${branch.gotoStep}`}`}
                    />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      </ViewSection>
      {body.exceptions.length === 0 ? null : (
        <ViewSection title={t("sop.exceptions")}>
          {body.exceptions.map((exception, index) => (
            <div key={index} className={styles.card}>
              <p className={styles.statement}>{exception.condition ?? ""}</p>
              <MetaRows rows={[{ label: t("sop.exception-handling"), value: exception.handling ?? "" }]} />
            </div>
          ))}
        </ViewSection>
      )}
      <ListSection title={t("sop.success-criteria")} entries={body.successCriteria} />
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the SOP category view: identity, intake questions, and constraints. */
export function SopCategoryView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model: DedicatedView<SopCategoryBody> = sopCategoryView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      <div className={styles.meta}>
        <MetaRows
          rows={[
            { label: t("ctx.id"), value: body.identity?.id ?? "" },
            { label: t("ctx.title"), value: body.identity?.title ?? "" },
            { label: t("ctx.description"), value: body.identity?.description ?? "" },
          ]}
        />
      </div>
      {body.questions.length === 0 ? null : (
        <ViewSection title={t("sop-category.questions")}>
          {body.questions.map((question) => (
            <div key={question.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{question.id}</span>
                {question.required === true ? <Tag tone="info">{t("sop-category.required")}</Tag> : null}
              </div>
              <p className={styles.statement}>{question.prompt ?? ""}</p>
              <MetaRows rows={[{ label: t("sop-category.maps-to"), value: question.mapsTo ?? "" }]} />
            </div>
          ))}
        </ViewSection>
      )}
      {body.constraints === undefined ? null : (
        <ViewSection title={t("sop-category.constraints")}>
          <div className={styles.meta}>
            <MetaRows rows={[{ label: t("sop-category.min-steps"), value: body.constraints.minSteps ?? "" }]} />
            <EntryList entries={body.constraints.requiredSections} />
          </div>
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the SOPs index view: the recorded SOPs. */
export function SopsIndexView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model: DedicatedView<SopsIndexBody> = sopsIndexView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      {body.sops.length === 0 ? null : (
        <ViewSection title={t("sops-index.sops")}>
          {body.sops.map((sop) => (
            <div key={sop.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{sop.id}</span>
                <StatusTag status={sop.status} />
              </div>
              <MetaRows
                rows={[
                  { label: t("ctx.title"), value: sop.title ?? "" },
                  { label: t("ctx.category"), value: sop.category ?? "" },
                  { label: t("ctx.path"), value: sop.path ?? "" },
                ]}
              />
            </div>
          ))}
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the design system view: identity, tokens, components, and guidance. */
export function DesignSystemView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model: DedicatedView<DesignSystemBody> = designSystemView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      <div className={styles.meta}>
        <MetaRows
          rows={[
            { label: t("ctx.id"), value: body.identity?.id ?? "" },
            { label: t("ctx.title"), value: body.identity?.title ?? "" },
          ]}
        />
      </div>
      {body.tokenFamilies.length === 0 ? null : (
        <ViewSection title={t("design-system.tokens")}>
          {body.tokenFamilies.map((family) => (
            <div key={family.family} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{family.family}</span>
              </div>
              <TokenNodes nodes={family.nodes} />
            </div>
          ))}
        </ViewSection>
      )}
      {body.components.length === 0 ? null : (
        <ViewSection title={t("design-system.components")}>
          {body.components.map((component) => (
            <div key={component.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{component.id}</span>
              </div>
              <MetaRows
                rows={[
                  { label: t("ctx.title"), value: component.title ?? "" },
                  { label: t("ctx.description"), value: component.description ?? "" },
                ]}
              />
              {component.tokenRefs.length === 0 ? null : (
                <div className={styles.meta}>
                  {component.tokenRefs.map((ref) => (
                    <MetaRow key={ref.key} label={`${t("design-system.token-references")}: ${ref.key}`} value={ref.value} />
                  ))}
                </div>
              )}
              <ListSection title={t("design-system.implementation")} entries={component.implementation} />
              <ListSection title={t("design-system.snapshots")} entries={component.snapshots} />
            </div>
          ))}
        </ViewSection>
      )}
      {body.guidance === undefined ? null : (
        <ViewSection title={t("design-system.guidance")}>
          <ParagraphSection title={t("design-system.overview")} text={body.guidance.overview} />
          <ListSection title={t("design-system.do")} entries={body.guidance.do} />
          <ListSection title={t("design-system.dont")} entries={body.guidance.dont} />
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}
