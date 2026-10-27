/**
 * The milestone goal launcher: the one viewer control that hands work to a
 * Session, as the roadmap index view's launch control.
 *
 * Launching submits exactly one `/goal` command line to the bound Session
 * through a plugin-owned command port that mirrors the pinned dsh release's
 * `remote.commands.execute` wire contract — the receiving agent's
 * sessionId, the full command line, and the submitted attachments, which
 * the wire requires and this launcher always sends empty. Going through the
 * command plane instead of the goal service keeps the launch identical to a
 * typed `/goal`: the host creates and arms the goal, logs the command run
 * durably, and reports its own refusal text when an unfinished goal already
 * exists. The objective is one fixed English string, so the confirmation
 * shows exactly what the Session receives.
 *
 * Each Session owns one launcher with a snapshot store the control renders
 * from: idle, confirming, pending, launched, or refused. Confirming is
 * single-flight — a second confirm or request while a submission is pending
 * does nothing — and a refusal or success returns the control to a usable
 * state. The launcher never reads or writes workspace files. Modules here
 * stay dsh-free like the rest of the model, testable under bun test/run.ts
 * with a scripted port.
 */
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { RemoteOutcome } from "./port.ts";

/**
 * The fixed goal objective: repeatedly run strict-roadmap-recommend until
 * the milestone its first recommendation selects is complete, with every
 * stop condition stated so the goal completes or blocks instead of idling.
 */
export const MILESTONE_GOAL_OBJECTIVE =
  "Repeatedly run the strict-roadmap-recommend skill until one roadmap milestone is complete. "
  + "In the first round, run it without a milestone hint; the milestone that owns the planned change it recommends is the target milestone. "
  + "In every later round, pass the target milestone id as the milestone hint, so the recommendation runs with --milestone <target-milestone-id>, "
  + "and carry each recommended change through strict-spec-auto to archive. "
  + "Complete the goal once strict-spec-cli roadmap-status reports every planned change of the target milestone complete. "
  + "Block the goal, stating the reason, when the recommendation reports roadmap-error, refine-milestone, or no-candidate before the target milestone is complete, "
  + "or when a created change has open questions that need a human answer.";

/** The exact command line one confirmed launch submits. */
export const MILESTONE_GOAL_COMMAND_LINE = `/goal ${MILESTONE_GOAL_OBJECTIVE}`;

/** A settled command's normalized result, as the wire reports it. */
export type CommandResult = { readonly kind: "success"; readonly text?: string } | { readonly kind: "error"; readonly text: string };

/** What one command submission settled as, from the launcher's view. */
export type CommandOutcome =
  | { readonly kind: "executed"; readonly result: CommandResult }
  | { readonly kind: "unknown-command" };

/** The command plane the launcher submits through, keyed by sessionId. */
export interface CommandPort {
  /**
   * Execute one command line on the Session's agent. Resolves with the
   * handler's result, or `unknown-command` when the line names no command
   * the Session offers; rejects when the call itself fails.
   */
  execute(sessionId: string, line: string): Promise<CommandOutcome>;
}

/**
 * The structural slice of the generated client remote the command port
 * adapts: the wire's `commands.execute` with its required attachments
 * array, resolving the wire's result envelope whose value is the settled
 * execution or `undefined` for an unknown or malformed command line.
 */
export interface RemoteCommandsFace {
  readonly commands: {
    execute(
      agentId: string,
      line: string,
      submittedAttachments: readonly never[],
      signal?: AbortSignal,
    ): Promise<RemoteOutcome<{ readonly result: CommandResult } | undefined>>;
  };
}

/**
 * Adapts the generated client remote face to the command port: the
 * required attachments array always reaches the host as `[]`, an
 * `undefined` value becomes `unknown-command`, and a failed envelope
 * rejects with the wire's error.
 */
export function createCommandPort(remote: RemoteCommandsFace): CommandPort {
  return {
    execute: async (sessionId, line) => {
      const outcome = await remote.commands.execute(sessionId, line, []);
      if (!outcome.ok) {
        throw outcome.error;
      }
      return outcome.value === undefined ? { kind: "unknown-command" } : { kind: "executed", result: outcome.value.result };
    },
  };
}

/** Why the bound Session did not accept a launch. */
export type GoalLaunchRefusal =
  /** The Session's `/goal` handler refused, with the text it reported. */
  | { readonly kind: "refused"; readonly text: string }
  /** The Session offers no `/goal` command. */
  | { readonly kind: "unavailable" }
  /** The submission call itself failed. */
  | { readonly kind: "failed"; readonly message: string };

/** The launch control's state for one Session. */
export type GoalLaunchState =
  | { readonly phase: "idle" }
  | { readonly phase: "confirming" }
  | { readonly phase: "pending" }
  | { readonly phase: "launched" }
  | { readonly phase: "refused"; readonly refusal: GoalLaunchRefusal };

/** The actions the launch control calls. */
export interface GoalLaunchActions {
  /** Open the confirmation; ignored while confirming or pending. */
  request(): void;
  /** Close the confirmation without submitting; ignored unless confirming. */
  cancel(): void;
  /**
   * Submit the objective once; ignored unless confirming, so a repeated
   * confirm while pending submits nothing. Resolves once the submission
   * settles.
   */
  confirm(): Promise<void>;
}

/** One Session's launcher: what the roadmap index control renders. */
export interface GoalLauncher {
  /** The Session a confirmed launch submits to. */
  readonly sessionId: string;
  /** The exact objective the confirmation shows and the command carries. */
  readonly objective: string;
  /** The control's current state. */
  readonly state: SnapshotStore<GoalLaunchState>;
  /** The control's actions. */
  readonly actions: GoalLaunchActions;
}

/** The per-Session launcher cache both entry points share. */
export interface GoalLaunchers {
  /** Returns the launcher bound to one sessionId, creating it on first use. */
  get(sessionId: string): GoalLauncher;
}

const IDLE: GoalLaunchState = { phase: "idle" };

/** Reads a human-facing message from a rejected submission. */
function failureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const { message, code } = error as { message?: unknown; code?: unknown };
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
    if (typeof code === "string" && code.length > 0) {
      return code;
    }
  }
  return String(error);
}

/**
 * Creates one Session's launcher over the command port. The state machine
 * is the whole contract: request opens the confirmation, cancel closes it
 * with nothing sent, and confirm moves to pending, submits the fixed
 * command line exactly once, and settles as launched or refused.
 */
export function createGoalLauncher(port: CommandPort, sessionId: string): GoalLauncher {
  const state = createSnapshotStore<GoalLaunchState>(IDLE);
  const phase = (): GoalLaunchState["phase"] => state.getSnapshot().phase;
  return {
    sessionId,
    objective: MILESTONE_GOAL_OBJECTIVE,
    state,
    actions: {
      request(): void {
        if (phase() === "confirming" || phase() === "pending") {
          return;
        }
        state.set({ phase: "confirming" });
      },
      cancel(): void {
        if (phase() !== "confirming") {
          return;
        }
        state.set(IDLE);
      },
      async confirm(): Promise<void> {
        if (phase() !== "confirming") {
          return;
        }
        state.set({ phase: "pending" });
        let next: GoalLaunchState;
        try {
          const outcome = await port.execute(sessionId, MILESTONE_GOAL_COMMAND_LINE);
          if (outcome.kind === "unknown-command") {
            next = { phase: "refused", refusal: { kind: "unavailable" } };
          } else if (outcome.result.kind === "error") {
            next = { phase: "refused", refusal: { kind: "refused", text: outcome.result.text } };
          } else {
            next = { phase: "launched" };
          }
        } catch (error) {
          next = { phase: "refused", refusal: { kind: "failed", message: failureMessage(error) } };
        }
        state.set(next);
      },
    },
  };
}

/**
 * Creates the per-Session launcher cache. A launcher holds no watch or
 * subscription of its own, so the cache needs no teardown: a launcher
 * whose surface unmounts keeps its last state for the Session's next mount.
 */
export function createGoalLaunchers(port: CommandPort): GoalLaunchers {
  const launchers = new Map<string, GoalLauncher>();
  return {
    get(sessionId: string): GoalLauncher {
      const cached = launchers.get(sessionId);
      if (cached !== undefined) {
        return cached;
      }
      const launcher = createGoalLauncher(port, sessionId);
      launchers.set(sessionId, launcher);
      return launcher;
    },
  };
}
