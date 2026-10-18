/**
 * The dedicated delta file views: the delta spec, delta scene, and delta
 * tech renderers the document view dispatches to by declared artifact_type.
 * Each operation group renders with its declared operation label, and the
 * requirement bodies, scene flow steps, and rule bodies inside render
 * through the shared layouts their main counterparts will reuse, so a delta
 * reads the way the merged artifact will. Views compute their structure
 * through the React-free delta view models and append every unrecognized
 * top-level field through the generic additional-fields section.
 */
import { Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import type { Translate } from "@deepseek-ai/dsh-client-ui-slots";
import type { ReactNode } from "react";
import type { DedicatedView, HeaderFact } from "./changeParts.ts";
import { deltaSceneView, deltaSpecView, deltaTechView } from "./deltaParts.ts";
import type {
  CoverageRef,
  RequirementBody,
  SceneStep,
  TechRule,
} from "./deltaParts.ts";
import type { DedicatedViewProps } from "./ChangeArtifactViews.tsx";
import { AdditionalFieldsView } from "./genericBlocks.tsx";
import type { StrictSpecKey } from "./locales.ts";
import styles from "./ArtifactViews.module.css";

/** The tone a declared rule or requirement strength badges with. */
const STRENGTH_TONES: Readonly<Record<string, "success" | "info" | "neutral" | "warning" | "outline" | "quiet">> = {
  MUST: "warning",
  SHOULD: "info",
  MAY: "neutral",
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

/** Renders one requirement body through the shared requirement layout. */
function RequirementCard(props: { readonly requirement: RequirementBody; readonly t: Translate<StrictSpecKey> }): ReactNode {
  const { requirement, t } = props;
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardId}>{requirement.id}</span>
        {requirement.strength === undefined ? null : (
          <Tag tone={STRENGTH_TONES[requirement.strength] ?? "outline"}>{requirement.strength}</Tag>
        )}
      </div>
      {requirement.statement === undefined ? null : <p className={styles.statement}>{requirement.statement}</p>}
      {requirement.reason === undefined ? null : (
        <div className={styles.meta}>
          <MetaRow label={t("delta.reason")} value={requirement.reason} />
        </div>
      )}
      {requirement.scenarios.map((scenario) => (
        <div key={scenario.id} className={styles.scenario}>
          <span className={styles.scenarioId}>{scenario.id}</span>
          {scenario.steps.map((step, index) => (
            <div key={index} className={styles.step}>
              <span className={styles.stepKind}>{step.kind}</span>
              <span className={styles.stepText}>{step.text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Renders one step's covering references as spec:requirement pairs. */
function CoverageList(props: { readonly coveredBy: readonly CoverageRef[] }): ReactNode {
  const { coveredBy } = props;
  if (coveredBy.length === 0) {
    return null;
  }
  return (
    <div className={styles.coverageList}>
      {coveredBy.map((ref, index) => (
        <span key={index} className={styles.coverage}>{`${ref.specId}:${ref.requirementId}`}</span>
      ))}
    </div>
  );
}

/** Renders one scene flow step through the shared flow-step layout. */
function FlowStepView(props: { readonly step: SceneStep; readonly t: Translate<StrictSpecKey> }): ReactNode {
  const { step, t } = props;
  return (
    <li className={styles.flowStep}>
      <div className={styles.cardHeader}>
        <span className={styles.cardId}>{step.id}</span>
      </div>
      {step.action === undefined ? null : <p className={styles.statement}>{step.action}</p>}
      <CoverageList coveredBy={step.coveredBy} />
      {step.noCoverageReason === undefined ? null : (
        <div className={styles.meta}>
          <MetaRow label={t("delta.no-coverage")} value={step.noCoverageReason} />
        </div>
      )}
      {step.reason === undefined ? null : (
        <div className={styles.meta}>
          <MetaRow label={t("delta.reason")} value={step.reason} />
        </div>
      )}
    </li>
  );
}

/** Renders one rule body through the shared rule layout. */
function RuleCard(props: { readonly rule: TechRule; readonly t: Translate<StrictSpecKey> }): ReactNode {
  const { rule, t } = props;
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardId}>{rule.id}</span>
        {rule.strength === undefined ? null : (
          <Tag tone={STRENGTH_TONES[rule.strength] ?? "outline"}>{rule.strength}</Tag>
        )}
      </div>
      {rule.statement === undefined ? null : <p className={styles.statement}>{rule.statement}</p>}
      <div className={styles.meta}>
        {rule.rationale === undefined ? null : <MetaRow label={t("delta.rationale")} value={rule.rationale} />}
        {rule.enforcement === undefined ? null : (
          <MetaRow label={t("delta.enforcement")} value={`${rule.enforcement.method ?? ""}${rule.enforcement.detail === undefined ? "" : ` — ${rule.enforcement.detail}`}`} />
        )}
        {rule.reason === undefined ? null : <MetaRow label={t("delta.reason")} value={rule.reason} />}
      </div>
      {rule.examples === undefined || (rule.examples.good.length === 0 && rule.examples.bad.length === 0) ? null : (
        <div className={styles.meta}>
          {rule.examples.good.map((entry, index) => (
            <MetaRow key={`good-${index}`} label={t("delta.example-good")} value={entry} />
          ))}
          {rule.examples.bad.map((entry, index) => (
            <MetaRow key={`bad-${index}`} label={t("delta.example-bad")} value={entry} />
          ))}
        </div>
      )}
      {rule.exceptions.length === 0 ? null : (
        <div className={styles.meta}>
          {rule.exceptions.map((entry, index) => (
            <MetaRow key={index} label={t("delta.exceptions")} value={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Renders the delta spec view: target, new-spec block, and operation-labeled requirement groups. */
export function DeltaSpecView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model: DedicatedView<ReturnType<typeof deltaSpecView>["body"]> = deltaSpecView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      <div className={styles.meta}>
        {body.targetSpec === undefined ? null : <MetaRow label={t("delta.target-spec")} value={body.targetSpec} />}
        {body.newSpec === undefined ? null : <MetaRow label={t("delta.new-spec")} value={[body.newSpec.title, body.newSpec.path].filter((part) => part !== undefined && part !== "").join(" — ")} />}
      </div>
      {body.operations.map((group) => (
        <section key={group.operation} className={styles.operationGroup}>
          <h3 className={styles.operationTitle}>{group.operation}</h3>
          {group.items.map((requirement) => (
            <RequirementCard key={requirement.id} requirement={requirement} t={t} />
          ))}
        </section>
      ))}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the delta scene view: target and operation-labeled flow groups. */
export function DeltaSceneView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model = deltaSceneView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      <div className={styles.meta}>
        {body.targetScene === undefined ? null : <MetaRow label={t("delta.target-scene")} value={body.targetScene} />}
      </div>
      {body.operations.map((group) => (
        <section key={group.operation} className={styles.operationGroup}>
          <h3 className={styles.operationTitle}>{group.operation}</h3>
          {group.mainFlow.length === 0 ? null : (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>{t("delta.main-flow")}</h4>
              <ol className={styles.flowSteps}>
                {group.mainFlow.map((step) => (
                  <FlowStepView key={step.id} step={step} t={t} />
                ))}
              </ol>
            </section>
          )}
          {group.exceptionFlows.map((flow) => (
            <section key={flow.id} className={styles.section}>
              <h4 className={styles.sectionTitle}>{`${t("delta.exception-flow")}: ${flow.id}`}</h4>
              {flow.trigger === undefined ? null : (
                <div className={styles.meta}>
                  <MetaRow label={t("delta.trigger")} value={flow.trigger} />
                </div>
              )}
              <ol className={styles.flowSteps}>
                {flow.steps.map((step) => (
                  <FlowStepView key={step.id} step={step} t={t} />
                ))}
              </ol>
            </section>
          ))}
        </section>
      ))}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}

/** Renders the delta tech view: target, new-standard block, and operation-labeled rule groups. */
export function DeltaTechView(props: DedicatedViewProps): ReactNode {
  const { data, t } = props;
  const model = deltaTechView(data);
  const { body } = model;
  return (
    <div className={styles.view}>
      <ViewFacts header={model.header} />
      <div className={styles.meta}>
        {body.targetStandard === undefined ? null : <MetaRow label={t("delta.target-standard")} value={body.targetStandard} />}
        {body.newStandard === undefined ? null : (
          <MetaRow label={t("delta.new-standard")} value={[body.newStandard.title, body.newStandard.category === undefined ? undefined : `(${body.newStandard.category})`].filter((part) => part !== undefined && part !== "").join(" ")} />
        )}
      </div>
      {body.operations.map((group) => (
        <section key={group.operation} className={styles.operationGroup}>
          <h3 className={styles.operationTitle}>{group.operation}</h3>
          {group.items.map((rule) => (
            <RuleCard key={rule.id} rule={rule} t={t} />
          ))}
        </section>
      ))}
      <AdditionalFieldsView blocks={model.additional} t={t} />
    </div>
  );
}
