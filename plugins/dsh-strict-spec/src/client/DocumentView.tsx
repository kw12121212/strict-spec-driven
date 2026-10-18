/**
 * The shared document view: renders the one open strict document, routing
 * by its declared artifact_type to a dedicated renderer when one is
 * registered and to the generic structured view for every other or absent
 * type. Loading, absent, read-error, parse-error, and idle conditions
 * render explicitly regardless of routing, and a document whose YAML
 * cannot be parsed renders its located message beside the raw text.
 *
 * Dedicated renderers render their own facts header from the scalar fields
 * exactly as the generic view draws them and append every unrecognized
 * top-level field through the generic additional-fields section, so routing
 * never hides content. The component reads data only through its props,
 * per the plugin client conventions.
 */
import type { ReactNode } from "react";
import type { Translate } from "@deepseek-ai/dsh-client-ui-slots";
import type { OpenDocumentState } from "../model/nodes.ts";
import { declaredArtifactType } from "../model/classifier.ts";
import { documentParts } from "./documentParts.ts";
import { GenericBlocksView } from "./genericBlocks.tsx";
import { DesignView, ProposalView, QuestionsView, TasksView } from "./ChangeArtifactViews.tsx";
import type { DedicatedViewProps } from "./ChangeArtifactViews.tsx";
import { DeltaSceneView, DeltaSpecView, DeltaTechView } from "./DeltaArtifactViews.tsx";
import type { StrictSpecKey } from "./locales.ts";
import styles from "./DocumentView.module.css";

/** Props the document view consumes, per the plugin conventions. */
export interface DocumentViewProps {
  /** The open-document store state the view renders. */
  readonly state: OpenDocumentState;
  /** The strictSpec translate function; every visible string renders through it. */
  readonly t: Translate<StrictSpecKey>;
}

/**
 * The dedicated renderers, keyed by declared artifact_type: the change
 * planning families and the change-scoped delta families. Every other or
 * absent type keeps the generic structured view.
 */
const DEDICATED_VIEWS: Readonly<Record<string, (props: DedicatedViewProps) => ReactNode>> = {
  change_proposal: ProposalView,
  change_design: DesignView,
  task_list: TasksView,
  question_list: QuestionsView,
  delta_spec: DeltaSpecView,
  delta_scene: DeltaSceneView,
  delta_tech: DeltaTechView,
};

/** Renders the generic structured view of one open strict document. */
export function DocumentView(props: DocumentViewProps): ReactNode {
  const { state, t } = props;
  if (state.status === "idle") {
    return <div className={styles.state} role="status">{t("view.idle")}</div>;
  }
  if (state.status === "loading") {
    return <div className={styles.state} role="status">{t("view.loading")}</div>;
  }
  if (state.status === "absent") {
    return <div className={styles.state} role="status">{t("view.absent")}</div>;
  }
  if (state.status === "error") {
    if (state.error?.kind === "parse") {
      return (
        <div className={styles.parseError} role="alert">
          <div className={styles.parseMessage}>
            {t("view.parse-error", { line: state.error.line, column: state.error.column, message: state.error.message })}
          </div>
          <div className={styles.rawHeading}>{t("view.raw-text")}</div>
          <pre className={styles.raw}>{state.error.raw}</pre>
        </div>
      );
    }
    return <div className={styles.state} role="alert">{t("view.error", { code: state.error?.code ?? "unknown" })}</div>;
  }
  // Routing follows the declared artifact_type of the parsed data, so an
  // unknown or absent type keeps the generic view and archived change
  // documents render through the same dedicated views active ones do.
  const artifactType = declaredArtifactType(state.data);
  const DedicatedView = artifactType === undefined ? undefined : DEDICATED_VIEWS[artifactType];
  if (DedicatedView !== undefined) {
    return <DedicatedView data={state.data} t={t} />;
  }
  const parts = documentParts(state.data);
  if (parts.header.length === 0 && parts.blocks.length === 0) {
    return <div className={styles.state} role="status">{t("view.empty-document")}</div>;
  }
  return (
    <div className={styles.document}>
      {parts.header.length === 0 ? null : (
        <header className={styles.header}>
          {parts.header.map((field) => (
            <div key={field.key} className={styles.headerField}>
              <span className={styles.fieldKey}>{field.key}</span>
              <span className={styles.scalar}>{field.text}</span>
            </div>
          ))}
        </header>
      )}
      <GenericBlocksView blocks={parts.blocks} />
    </div>
  );
}
