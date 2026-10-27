/**
 * The milestone goal launch control the roadmap index view renders: one
 * button that opens an inline confirmation presenting the exact objective
 * and the target Session, then submits through the bound Session's
 * launcher, showing the pending, launched, and refused states inline.
 *
 * The control renders nothing without a launcher, so a context-free render
 * or a surface bound to no Session shows no launch affordance. The view is
 * split per the plugin conventions: `GoalLaunchControlView` is hook-free —
 * it takes the launch state and returns elements whose handlers a suite can
 * fire without a DOM — and `GoalLaunchControl` only reads the launcher's
 * store, with an identity-stable fallback so its hook structure never
 * varies on the launcher's presence. The objective is the command payload
 * itself and renders verbatim, identical in every locale; every other
 * visible string renders through the strictSpec catalogs.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { Translate } from "@deepseek-ai/dsh-client-ui-slots";
import type { GoalLaunchActions, GoalLaunchRefusal, GoalLaunchState, GoalLauncher } from "../model/goalLaunch.ts";
import type { StrictSpecKey } from "./locales.ts";
import styles from "./RoadmapViews.module.css";

/** Props the hook-free launch control view consumes. */
export interface GoalLaunchControlViewProps {
  /** The launch state to render. */
  readonly state: GoalLaunchState;
  /** The exact objective a confirmed launch submits. */
  readonly objective: string;
  /** The Session a confirmed launch submits to. */
  readonly sessionId: string;
  /** The launcher actions the buttons call. */
  readonly actions: GoalLaunchActions;
  /** The strictSpec translate function. */
  readonly t: Translate<StrictSpecKey>;
}

/** The inline message one refusal renders. */
function refusalMessage(refusal: GoalLaunchRefusal, t: Translate<StrictSpecKey>): string {
  switch (refusal.kind) {
    case "refused":
      return t("roadmap.goal-refused", { reason: refusal.text });
    case "unavailable":
      return t("roadmap.goal-unavailable");
    case "failed":
      return t("roadmap.goal-failed", { reason: refusal.message });
  }
}

/** Renders the launch control for one state, without hooks. */
export function GoalLaunchControlView(props: GoalLaunchControlViewProps): ReactNode {
  const { state, objective, sessionId, actions, t } = props;
  if (state.phase === "confirming" || state.phase === "pending") {
    const pending = state.phase === "pending";
    return (
      <div className={styles.goalLaunch} role="group" aria-label={t("roadmap.goal-launch")}>
        <div className={styles.goalConfirmTitle}>{t("roadmap.goal-confirm-title")}</div>
        <div className={styles.goalConfirmSession}>{t("roadmap.goal-confirm-session", { sessionId })}</div>
        <pre className={styles.goalObjective}>{objective}</pre>
        <div className={styles.goalActions}>
          <Button variant="primary" size="sm" disabled={pending} onClick={() => void actions.confirm()}>
            {pending ? t("roadmap.goal-pending") : t("roadmap.goal-confirm")}
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => actions.cancel()}>
            {t("roadmap.goal-cancel")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.goalLaunch}>
      <div className={styles.goalActions}>
        <Button variant="outline" size="sm" onClick={() => actions.request()}>
          {t("roadmap.goal-launch")}
        </Button>
        <span className={styles.goalHint}>{t("roadmap.goal-launch-hint")}</span>
      </div>
      {state.phase === "launched" ? (
        <div className={styles.goalNotice} role="status">{t("roadmap.goal-launched")}</div>
      ) : state.phase === "refused" ? (
        <div className={styles.goalRefusal} role="alert">{refusalMessage(state.refusal, t)}</div>
      ) : null}
    </div>
  );
}

/** The identity-stable idle snapshot the fallback store serves. */
const IDLE_STATE: GoalLaunchState = { phase: "idle" };

/** The store read when no launcher is wired, keeping one hook shape. */
const FALLBACK_STATE_STORE = {
  subscribe: (): (() => void) => () => undefined,
  getSnapshot: (): GoalLaunchState => IDLE_STATE,
};

/** Props the launch control consumes. */
export interface GoalLaunchControlProps {
  /** The bound Session's launcher; absent renders no control. */
  readonly launcher: GoalLauncher | undefined;
  /** The strictSpec translate function. */
  readonly t: Translate<StrictSpecKey>;
}

/** Renders the launch control from the bound Session's launcher store. */
export function GoalLaunchControl(props: GoalLaunchControlProps): ReactNode {
  const { launcher, t } = props;
  const store = launcher === undefined ? FALLBACK_STATE_STORE : launcher.state;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  if (launcher === undefined) {
    return null;
  }
  return <GoalLaunchControlView state={state} objective={launcher.objective} sessionId={launcher.sessionId} actions={launcher.actions} t={t} />;
}
