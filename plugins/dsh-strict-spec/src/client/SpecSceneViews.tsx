/**
 * The dedicated spec and scene artifact views: the main spec, specs index,
 * scene, and scenes-index renderers the document view dispatches to by
 * declared artifact_type. Each view computes its structure through the
 * React-free spec and scene view models, renders its facts header from the
 * scalar fields exactly as the generic view draws them, and appends every
 * unrecognized top-level field through the generic additional-fields
 * section, so the dedicated layout never hides content.
 *
 * The spec view renders every requirement through the same requirement
 * layout the delta spec view uses, each under the stable anchor a scene
 * step's coverage link opens. The scene view renders its steps through the
 * same flow-step layout the delta scene view uses, with each covering
 * reference resolved against the tree's documents record from the view
 * context and opened through the shared open action only, per the
 * rendered-view navigation rule — a reference that resolves to no held
 * document renders the shared unresolved marker instead of acting, and a
 * step declaring neither coverage nor a no-coverage reason carries the
 * visible uncovered flag. Without a context — as in context-free static
 * renders — the views present declared data alone. Components read data
 * only through props and stores, per the plugin conventions.
 */
import type { ReactNode } from "react";
import { Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import type { Translate } from "@deepseek-ai/dsh-client-ui-slots";
import type { DedicatedViewProps } from "./ChangeArtifactViews.tsx";
import type { HeaderFact, ViewContext } from "./changeParts.ts";
import { AdditionalFieldsView } from "./genericBlocks.tsx";
import { FlowStepView, RequirementCard } from "./DeltaArtifactViews.tsx";
import type { CoverageNavigation } from "./DeltaArtifactViews.tsx";
import type { CoverageRef } from "./deltaParts.ts";
import { requirementAnchor, specIndexView, specView, UNSPECIFIED_AREA } from "./specParts.ts";
import type { SpecAreaGroup } from "./specParts.ts";
import { createSceneNavigator, resolveSpecTarget, sceneView, scenesIndexView } from "./sceneParts.ts";
import type { SceneActor, ScenesAreaGroup } from "./sceneParts.ts";
import { useTreeDocuments } from "./viewStores.ts";
import type { StrictSpecKey } from "./locales.ts";
import styles from "./ArtifactViews.module.css";
import sceneStyles from "./SpecSceneViews.module.css";
import { STATUS_TONES } from "./DocumentTree.tsx";

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

/** Renders one declared status badge, when a status is declared. */
function StatusBadge(props: { readonly status: string | undefined }): ReactNode {
  const { status } = props;
  if (status === undefined) {
    return null;
  }
  return <Tag tone={STATUS_TONES[status] ?? "outline"}>{status}</Tag>;
}

/** Renders one spec-area group of the specs index view. */
function SpecAreaSection(props: { readonly group: SpecAreaGroup; readonly t: Translate<StrictSpecKey> }): ReactNode {
  const { group, t } = props;
  return (
    <ViewSection title={group.area === UNSPECIFIED_AREA ? t("spec-index.other-area") : group.area}>
      <div className={sceneStyles.groupRows}>
        {group.specs.map((spec) => (
          <span key={spec.id} className={sceneStyles.groupRow}>
            <span className={sceneStyles.rowId}>{spec.id}</span>
            {spec.title === undefined ? null : <span className={sceneStyles.rowTitle}>{spec.title}</span>}
          </span>
        ))}
      </div>
    </ViewSection>
  );
}

/** Renders one scene-area group of the scenes index view. */
function ScenesAreaSection(props: { readonly group: ScenesAreaGroup }): ReactNode {
  const { group } = props;
  return (
    <ViewSection title={group.area}>
      <div className={sceneStyles.groupRows}>
        {group.scenes.map((scene) => (
          <span key={scene.id} className={sceneStyles.groupRow}>
            <StatusBadge status={scene.status} />
            <span className={sceneStyles.rowId}>{scene.id}</span>
            {scene.title === undefined ? null : <span className={sceneStyles.rowTitle}>{scene.title}</span>}
          </span>
        ))}
      </div>
    </ViewSection>
  );
}

/** Renders one actor row of the scene view's cast. */
function ActorRow(props: { readonly actor: SceneActor; readonly t: Translate<StrictSpecKey> }): ReactNode {
  const { actor, t } = props;
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardId}>{actor.name}</span>
      </div>
      {actor.role === undefined ? null : (
        <div className={styles.meta}>
          <MetaRow label={t("scene.actor-role")} value={actor.role} />
        </div>
      )}
    </div>
  );
}

/**
 * Builds the coverage navigation the scene view passes its steps when a
 * view context exists: each reference resolves against the tree's
 * documents record — spec id and named requirement together — and opens
 * through the shared open action alone.
 */
function coverageNavigation(
  context: ViewContext | undefined,
  documents: ReturnType<typeof useTreeDocuments>,
): CoverageNavigation | undefined {
  if (context === undefined) {
    return undefined;
  }
  const navigator = createSceneNavigator(context.viewer.actions, context.sessionId, documents);
  return {
    resolve: (ref: CoverageRef) => resolveSpecTarget(documents, ref.specId, ref.requirementId) !== undefined,
    onOpen: (ref: CoverageRef) => {
      navigator.openRequirement(ref.specId, ref.requirementId);
    },
  };
}

/** Renders the main spec view: declared identity and anchored requirements. */
export function SpecView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model = specView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      {body.spec === undefined ? null : (
        <div className={styles.meta}>
          {body.spec.id === undefined ? null : <MetaRow label={t("ctx.id")} value={body.spec.id} />}
          {body.spec.title === undefined ? null : <MetaRow label={t("ctx.title")} value={body.spec.title} />}
        </div>
      )}
      {body.requirements.length === 0 ? null : (
        <ViewSection title={t("spec.requirements")}>
          {body.requirements.map((requirement) => (
            <RequirementCard
              key={requirement.id}
              requirement={requirement}
              t={t}
              anchorId={body.spec?.id === undefined ? undefined : requirementAnchor(body.spec.id, requirement.id)}
            />
          ))}
        </ViewSection>
      )}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the specs index view: entries grouped by their declared spec areas. */
export function SpecIndexView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model = specIndexView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      {body.groups.map((group) => (
        <SpecAreaSection key={group.area} group={group} t={t} />
      ))}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the scene view: cast, preconditions, and both flow kinds with coverage links. */
export function SceneView(props: DedicatedViewProps): ReactNode {
  const { data, t, context } = props;
  const model = sceneView(data);
  const { body } = model;
  const documents = useTreeDocuments(context);
  const navigation = coverageNavigation(context, documents);
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      {body.scene === undefined ? null : (
        <div className={styles.meta}>
          {body.scene.id === undefined ? null : <MetaRow label={t("ctx.id")} value={body.scene.id} />}
          {body.scene.title === undefined ? null : <MetaRow label={t("ctx.title")} value={body.scene.title} />}
        </div>
      )}
      <div className={styles.meta}>
        <StatusBadge status={body.status} />
      </div>
      {body.actors.length === 0 ? null : (
        <ViewSection title={t("scene.actors")}>
          {body.actors.map((actor) => (
            <ActorRow key={actor.name} actor={actor} t={t} />
          ))}
        </ViewSection>
      )}
      <ListSection title={t("scene.preconditions")} entries={body.preconditions} />
      {body.mainFlow.length === 0 ? null : (
        <ViewSection title={t("delta.main-flow")}>
          <ol className={styles.flowSteps}>
            {body.mainFlow.map((step) => (
              <FlowStepView key={step.id} step={step} t={t} navigation={navigation} />
            ))}
          </ol>
        </ViewSection>
      )}
      {body.exceptionFlows.map((flow) => (
        <ViewSection key={flow.id} title={`${t("delta.exception-flow")}: ${flow.id}`}>
          {flow.trigger === undefined ? null : (
            <div className={styles.meta}>
              <MetaRow label={t("delta.trigger")} value={flow.trigger} />
            </div>
          )}
          <ol className={styles.flowSteps}>
            {flow.steps.map((step) => (
              <FlowStepView key={step.id} step={step} t={t} navigation={navigation} />
            ))}
          </ol>
        </ViewSection>
      ))}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the scenes index view: entries grouped by their declared areas. */
export function ScenesIndexView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model = scenesIndexView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      {body.groups.map((group) => (
        <ScenesAreaSection key={group.area} group={group} />
      ))}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}
