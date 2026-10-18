/**
 * The dedicated change artifact views: the proposal, design, tasks, and
 * questions renderers the document view dispatches to by declared
 * artifact_type. Each view computes its structure through the React-free
 * change view models, renders its facts header from the scalar fields
 * exactly as the generic view draws them, and appends every unrecognized
 * top-level field through the generic additional-fields section, so the
 * dedicated layout never hides content. Components read data only through
 * props, per the plugin client conventions.
 */
import { Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import type { Translate } from "@deepseek-ai/dsh-client-ui-slots";
import type { ReactNode } from "react";
import { designView, proposalView, questionsView, tasksView } from "./changeParts.ts";
import type { DedicatedView, HeaderFact } from "./changeParts.ts";
import { AdditionalFieldsView } from "./genericBlocks.tsx";
import type { StrictSpecKey } from "./locales.ts";
import styles from "./ArtifactViews.module.css";

/** Props every dedicated view consumes: the parsed document and the translate function. */
export interface DedicatedViewProps {
  /** The open document's parsed data. */
  readonly data: unknown;
  /** The strictSpec translate function; every visible string renders through it. */
  readonly t: Translate<StrictSpecKey>;
}

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

/** Renders one string list section entry list without the empty case. */
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

/** Renders the proposal view: motivation, scope, unchanged behavior, and roadmap link. */
export function ProposalView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model: DedicatedView<ReturnType<typeof proposalView>["body"]> = proposalView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      {body.change === undefined ? null : (
        <div className={styles.meta}>
          {body.change.id === undefined ? null : <MetaRow label={t("proposal.change-id")} value={body.change.id} />}
          {body.change.status === undefined ? null : <MetaRow label={t("proposal.change-status")} value={body.change.status} />}
        </div>
      )}
      <ListSection title={t("proposal.what")} entries={body.what} />
      <ListSection title={t("proposal.why")} entries={body.why} />
      <ListSection title={t("proposal.in")} entries={body.in} />
      <ListSection title={t("proposal.out")} entries={body.out} />
      <ListSection title={t("proposal.unchanged")} entries={body.unchanged} />
      {body.roadmap === undefined ? null : (
        <ViewSection title={t("proposal.roadmap")}>
          <div className={styles.meta}>
            {body.roadmap.milestone === undefined ? null : (
              <MetaRow label={t("proposal.roadmap-milestone")} value={body.roadmap.milestone} />
            )}
            {body.roadmap.plannedChange === undefined ? null : (
              <MetaRow label={t("proposal.roadmap-planned-change")} value={body.roadmap.plannedChange} />
            )}
          </div>
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the design view: approach, decisions with rationale, alternatives, and risks. */
export function DesignView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model = designView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      <ListSection title={t("design.approach")} entries={body.approach} />
      {body.decisions.length === 0 ? null : (
        <ViewSection title={t("design.decisions")}>
          {body.decisions.map((decision) => (
            <div key={decision.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{decision.id}</span>
              </div>
              <p className={styles.statement}>{decision.text}</p>
              <div className={styles.meta}>
                <MetaRow label={t("design.rationale")} value={decision.rationale} />
              </div>
            </div>
          ))}
        </ViewSection>
      )}
      {body.alternatives.length === 0 ? null : (
        <ViewSection title={t("design.alternatives")}>
          {body.alternatives.map((alternative, index) => (
            <div key={index} className={styles.card}>
              <p className={styles.statement}>{alternative.option}</p>
              <div className={styles.meta}>
                <MetaRow label={t("design.reason")} value={alternative.reason} />
              </div>
            </div>
          ))}
        </ViewSection>
      )}
      <ListSection title={t("design.risks")} entries={body.risks} />
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the tasks view: sections with per-task markers and per-section and overall completion. */
export function TasksView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model = tasksView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      {body.overall === undefined ? null : (
        <div className={styles.completion}>{t("tasks.overall", { done: body.overall.done, total: body.overall.total })}</div>
      )}
      {body.sections.map((section) => (
        <ViewSection key={section.id} title={section.id}>
          <span className={styles.completion}>{t("tasks.completion", { done: section.completion.done, total: section.completion.total })}</span>
          <ul className={styles.entries}>
            {section.tasks.map((task) => (
              <li key={task.id} className={styles.entry}>
                <Tag tone={task.done ? "success" : "neutral"}>{t(task.done ? "tasks.done" : "tasks.pending")}</Tag>
                <span className={styles.cardId}>{task.id}</span>
                <span className={styles.entry}>{task.text}</span>
                {task.command === undefined ? null : (
                  <span className={styles.command}>{t("tasks.command", { command: task.command })}</span>
                )}
              </li>
            ))}
          </ul>
        </ViewSection>
      ))}
      {body.gates === undefined || (body.gates.validationTask === undefined && body.gates.unitTestTask === undefined) ? null : (
        <ViewSection title={t("tasks.gates")}>
          <div className={styles.meta}>
            {body.gates.validationTask === undefined ? null : (
              <MetaRow label={t("tasks.gate-validation")} value={body.gates.validationTask} />
            )}
            {body.gates.unitTestTask === undefined ? null : (
              <MetaRow label={t("tasks.gate-unit-test")} value={body.gates.unitTestTask} />
            )}
          </div>
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the questions view: open questions separated from resolved ones with their answers. */
export function QuestionsView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model = questionsView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      {body.open.length === 0 ? null : (
        <ViewSection title={t("questions.open")}>
          {body.open.map((question) => (
            <div key={question.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{question.id}</span>
              </div>
              <p className={styles.statement}>{question.question}</p>
              {question.context === undefined ? null : (
                <div className={styles.meta}>
                  <MetaRow label={t("questions.context")} value={question.context} />
                </div>
              )}
            </div>
          ))}
        </ViewSection>
      )}
      {body.resolved.length === 0 ? null : (
        <ViewSection title={t("questions.resolved")}>
          {body.resolved.map((question) => (
            <div key={question.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardId}>{question.id}</span>
              </div>
              <p className={styles.statement}>{question.question}</p>
              <div className={styles.meta}>
                {question.context === undefined ? null : (
                  <MetaRow label={t("questions.context")} value={question.context} />
                )}
                {question.answer === undefined ? null : (
                  <MetaRow label={t("questions.answer")} value={question.answer} />
                )}
              </div>
            </div>
          ))}
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}
