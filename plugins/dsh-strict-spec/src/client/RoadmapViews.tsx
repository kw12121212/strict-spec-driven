/**
 * The dedicated roadmap artifact views: the roadmap index, milestone, and
 * planned-change renderers the document view dispatches to by declared
 * artifact_type. Each view computes its structure through the React-free
 * roadmap view models, renders its facts header from the scalar fields
 * exactly as the generic view draws them, and appends every unrecognized
 * top-level field through the generic additional-fields section, so the
 * dedicated layout never hides content.
 *
 * The views are the first dedicated renderers that navigate between
 * documents: they resolve depends_on targets and owned planned changes
 * against the tree's documents record from the view context and open them
 * through the shared open action only, per the rendered-view navigation
 * rule. Without a context — as in context-free static renders — the views
 * present declared data alone: index entries keep their declaration order
 * and dependencies render without their link affordance. Components read
 * data only through props and stores, per the plugin conventions.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import type { Translate } from "@deepseek-ai/dsh-client-ui-slots";
import type { DedicatedViewProps } from "./ChangeArtifactViews.tsx";
import type { HeaderFact, ViewContext } from "./changeParts.ts";
import { AdditionalFieldsView } from "./genericBlocks.tsx";
import { GoalLaunchControl } from "./GoalLaunchControl.tsx";
import {
  createRoadmapNavigator,
  milestoneView,
  orderedIndexMilestones,
  ownedPlannedChanges,
  plannedChangeView,
  resolvePlannedChangeTarget,
  roadmapIndexView,
} from "./roadmapParts.ts";
import type { MilestoneIntakeQuestion, OwnedPlannedChange, RoadmapIndexEntry } from "./roadmapParts.ts";
import type { MilestoneOwnershipState } from "../model/roadmapOwnership.ts";
import { initialMilestoneOwnershipState } from "../model/roadmapOwnership.ts";
import { useTreeDocuments } from "./viewStores.ts";
import type { StrictSpecKey } from "./locales.ts";
import styles from "./ArtifactViews.module.css";
import roadmapStyles from "./RoadmapViews.module.css";
import { STATUS_TONES } from "./DocumentTree.tsx";

/** The readable face of a snapshot store the context-free fallbacks satisfy. */
interface ReadableStore<T> {
  subscribe(onStoreChange: () => void): () => void;
  getSnapshot(): T;
}

/** The stable idle ownership state for context-free renders. */
const IDLE_OWNERSHIP_STATE = initialMilestoneOwnershipState();

/** The stable fallback ownership store for context-free renders. */
const FALLBACK_OWNERSHIP_STORE: ReadableStore<MilestoneOwnershipState> = {
  subscribe: () => () => undefined,
  getSnapshot: () => IDLE_OWNERSHIP_STATE,
};

/** Reads the archived-milestone ownership state from the view context. */
function useOwnership(context: ViewContext | undefined): MilestoneOwnershipState {
  const store: ReadableStore<MilestoneOwnershipState> = context === undefined ? FALLBACK_OWNERSHIP_STORE : context.viewer.ownership;
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
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
      <ul className={styles.entries}>
        {entries.map((entry, index) => (
          <li key={index} className={styles.entry}>{entry}</li>
        ))}
      </ul>
    </ViewSection>
  );
}

/** Renders one wrapped paragraph section: present only when text exists. */
function ParagraphSection(props: { readonly title: string; readonly text: string | undefined }): ReactNode {
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

/** Renders one declared status badge, when a status is declared. */
function StatusBadge(props: { readonly status: string | undefined }): ReactNode {
  const { status } = props;
  if (status === undefined) {
    return null;
  }
  return <Tag tone={STATUS_TONES[status] ?? "outline"}>{status}</Tag>;
}

/** Renders one scope column of the milestone view's side-by-side scope. */
function ScopeColumn(props: { readonly title: string; readonly entries: readonly string[] }): ReactNode {
  const { title, entries } = props;
  return (
    <div className={roadmapStyles.scopeColumn}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      <ul className={styles.entries}>
        {entries.map((entry, index) => (
          <li key={index} className={styles.entry}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}

/** Renders one milestone intake question as a card with every declared field. */
function IntakeQuestionCard(props: { readonly question: MilestoneIntakeQuestion; readonly t: Translate<StrictSpecKey> }): ReactNode {
  const { question, t } = props;
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardId}>{question.id}</span>
      </div>
      <p className={styles.statement}>{question.question}</p>
      <div className={styles.meta}>
        {question.context === undefined ? null : <MetaRow label={t("questions.context")} value={question.context} />}
        {question.impact === undefined ? null : <MetaRow label={t("roadmap.impact")} value={question.impact} />}
        {question.recommendation === undefined ? null : <MetaRow label={t("roadmap.recommendation")} value={question.recommendation} />}
      </div>
    </div>
  );
}

/** Renders one owned planned-change row, opening its file on selection. */
function OwnedPlannedChangeRow(
  props: {
    readonly entry: OwnedPlannedChange;
    readonly onOpen?: (path: string) => void;
  },
): ReactNode {
  const { entry, onOpen } = props;
  const row = (
    <>
      <StatusBadge status={entry.status} />
      <span className={roadmapStyles.ownedRowText}>{entry.id ?? entry.label}</span>
    </>
  );
  if (onOpen === undefined) {
    return <span className={roadmapStyles.ownedRowStatic}>{row}</span>;
  }
  return (
    <button type="button" className={roadmapStyles.ownedRow} onClick={() => onOpen(entry.path)} title={entry.id ?? entry.label}>
      {row}
    </button>
  );
}

/**
 * Renders the roadmap index view: milestones in their declared order
 * sequence, preceded by the milestone goal launch control when the view
 * context carries the bound Session's launcher.
 */
export function RoadmapIndexView(props: DedicatedViewProps): ReactNode {
  const { data, t, context } = props;
  const model = roadmapIndexView(data);
  const documents = useTreeDocuments(context);
  const milestones = context === undefined ? model.body.milestones : orderedIndexMilestones(model.body.milestones, documents);
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      <GoalLaunchControl launcher={context?.goal} t={t} />
      {milestones.length === 0 ? null : (
        <ViewSection title={t("roadmap.milestones")}>
          <div className={roadmapStyles.indexRows}>
            {milestones.map((entry: RoadmapIndexEntry) => (
              <span key={entry.id} className={roadmapStyles.indexRow}>
                <StatusBadge status={entry.status} />
                <span className={roadmapStyles.indexId}>{entry.id}</span>
                {entry.title === undefined ? null : <span className={roadmapStyles.indexTitle}>{entry.title}</span>}
              </span>
            ))}
          </div>
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the milestone view: planning groups, intake cards, and owned planned changes. */
export function MilestoneView(props: DedicatedViewProps): ReactNode {
  const { data, t, path, context } = props;
  const model = milestoneView(data);
  const { body } = model;
  const documents = useTreeDocuments(context);
  const ownership = useOwnership(context);
  const milestoneId = body.milestone?.id;
  const archived = path !== undefined && documents[path]?.archived === true;
  const navigator = context === undefined ? undefined : createRoadmapNavigator(context.viewer.actions, context.sessionId, documents);
  const ownershipReady = archived && ownership.status === "ready" && ownership.milestoneId === milestoneId;
  const owned = ownershipReady
    ? ownership.owned
    : milestoneId === undefined
      ? []
      : ownedPlannedChanges(documents, milestoneId);
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      {body.milestone === undefined ? null : (
        <div className={styles.meta}>
          {body.milestone.title === undefined ? null : <MetaRow label={t("ctx.title")} value={body.milestone.title} />}
        </div>
      )}
      <div className={styles.meta}>
        <StatusBadge status={body.status} />
      </div>
      <ParagraphSection title={t("roadmap.goal")} text={body.goal} />
      {body.in.length === 0 && body.out.length === 0 ? null : (
        <ViewSection title={t("sop.scope")}>
          <div className={roadmapStyles.scopeColumns}>
            <ScopeColumn title={t("proposal.in")} entries={body.in} />
            <ScopeColumn title={t("proposal.out")} entries={body.out} />
          </div>
        </ViewSection>
      )}
      {body.doneCriteria.length === 0 ? null : (
        <ViewSection title={t("roadmap.done-criteria")}>
          <ul className={roadmapStyles.checklist}>
            {body.doneCriteria.map((criterion, index) => (
              <li key={index} className={roadmapStyles.checklistItem}>
                <span className={roadmapStyles.checkMark} aria-hidden="true">☑</span>
                <span className={styles.entry}>{criterion}</span>
              </li>
            ))}
          </ul>
        </ViewSection>
      )}
      <ListSection title={t("roadmap.dependencies")} entries={body.dependencies} />
      <ListSection title={t("design.risks")} entries={body.risks} />
      <ListSection title={t("roadmap.notes")} entries={body.notes} />
      <ParagraphSection title={t("roadmap.details")} text={body.details} />
      {body.intakeQuestions.length === 0 ? null : (
        <ViewSection title={t("roadmap.intake-questions")}>
          {body.intakeQuestions.map((question, index) => (
            <IntakeQuestionCard key={`${question.id}:${index}`} question={question} t={t} />
          ))}
        </ViewSection>
      )}
      {milestoneId === undefined ? null : (
        <ViewSection title={t("roadmap.owned-planned-changes")}>
          {archived && ownership.status === "loading" ? <span className={styles.entry}>{t("view.loading")}</span> : null}
          {archived && ownership.status === "error" ? <span className={styles.entry} role="alert">{t("roadmap.ownership-error")}</span> : null}
          {ownershipReady && ownership.truncated ? <div className={styles.entry}>{t("tree.truncated")}</div> : null}
          <div className={roadmapStyles.ownedRows}>
            {owned.map((entry) => (
              <OwnedPlannedChangeRow
                key={entry.path}
                entry={entry}
                onOpen={navigator === undefined ? undefined : navigator.openPath}
              />
            ))}
          </div>
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the planned-change view: identity, summary, and navigable dependencies. */
export function PlannedChangeView(props: DedicatedViewProps): ReactNode {
  const { data, t, context } = props;
  const model = plannedChangeView(data);
  const { body } = model;
  const documents = useTreeDocuments(context);
  const navigator = context === undefined ? undefined : createRoadmapNavigator(context.viewer.actions, context.sessionId, documents);
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      <div className={styles.meta}>
        <StatusBadge status={body.status} />
      </div>
      <div className={styles.meta}>
        {body.id === undefined ? null : <MetaRow label={t("proposal.change-id")} value={body.id} />}
        {body.milestone === undefined ? null : <MetaRow label={t("proposal.roadmap-milestone")} value={body.milestone} />}
      </div>
      <ParagraphSection title={t("roadmap.summary")} text={body.summary} />
      <ParagraphSection title={t("roadmap.details")} text={body.details} />
      {body.dependsOn.length === 0 ? null : (
        <ViewSection title={t("roadmap.depends-on")}>
          <ul className={roadmapStyles.dependencyList}>
            {body.dependsOn.map((dependency, index) => {
              const target = resolvePlannedChangeTarget(documents, dependency);
              return (
                <li key={index} className={roadmapStyles.dependencyRow}>
                  {target !== undefined && navigator !== undefined ? (
                    <button
                      type="button"
                      className={roadmapStyles.dependencyTarget}
                      onClick={() => navigator.openPlannedChange(dependency)}
                      title={target.label}
                    >
                      <span className={roadmapStyles.dependencyId}>{dependency}</span>
                    </button>
                  ) : target !== undefined ? (
                    <span className={roadmapStyles.dependencyId}>{dependency}</span>
                  ) : (
                    <>
                      <span className={roadmapStyles.dependencyIdUnresolved}>{dependency}</span>
                      <Tag tone="warning">{t("roadmap.unresolved")}</Tag>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}
