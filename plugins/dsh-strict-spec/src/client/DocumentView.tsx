/**
 * The generic structured renderer: the one document view every artifact
 * type renders through until a dedicated renderer exists.
 *
 * The shape mapping lives in the React-free document-parts module: top-level
 * scalars form the header, mappings render as titled sections, sequences as
 * lists, multiline text as wrapped paragraphs, and deep nesting as
 * collapsible disclosure blocks. A document whose YAML cannot be parsed
 * renders its located message beside the raw text, and loading, absent,
 * read-error, and idle conditions each render explicitly instead of a blank
 * pane. The component reads data only through its props, per the plugin
 * client conventions.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { DisclosureRow, FileTypeIcon } from "@deepseek-ai/dsh-client-ui-primitives";
import type { Translate } from "@deepseek-ai/dsh-client-ui-slots";
import type { OpenDocumentState } from "../model/nodes.ts";
import { documentParts } from "./documentParts.ts";
import type { DocumentPart } from "./documentParts.ts";
import type { StrictSpecKey } from "./locales.ts";
import styles from "./DocumentView.module.css";

/** Props the document view consumes, per the plugin conventions. */
export interface DocumentViewProps {
  /** The open-document store state the view renders. */
  readonly state: OpenDocumentState;
  /** The strictSpec translate function; every visible string renders through it. */
  readonly t: Translate<StrictSpecKey>;
}

/** Renders one scalar value: wrapped paragraphs for multiline text, inline text otherwise. */
function ScalarView(props: { readonly part: Extract<DocumentPart, { kind: "scalar" }> }): ReactNode {
  const { part } = props;
  if (part.multiline) {
    return <p className={styles.paragraph}>{part.text}</p>;
  }
  return <span className={styles.scalar}>{part.text}</span>;
}

/** Renders one field inside a section: the key with its value part. */
function FieldView(props: { readonly fieldKey: string; readonly value: DocumentPart; readonly depth: number }): ReactNode {
  const { fieldKey, value, depth } = props;
  if (value.kind === "scalar") {
    return (
      <div className={styles.field}>
        <span className={styles.fieldKey}>{fieldKey}</span>
        <ScalarView part={value} />
      </div>
    );
  }
  return (
    <CollapsibleBlock title={fieldKey} depth={depth}>
      <PartBody part={value} depth={depth + 1} />
    </CollapsibleBlock>
  );
}

/** Renders the body of one mapping or sequence part. */
function PartBody(props: { readonly part: DocumentPart; readonly depth: number }): ReactNode {
  const { part, depth } = props;
  if (part.kind === "scalar") {
    return <ScalarView part={part} />;
  }
  if (part.kind === "sequence") {
    return (
      <ul className={styles.list}>
        {part.items.map((item, index) => (
          <li key={index} className={styles.listItem}>
            <PartBody part={item} depth={depth} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className={styles.fields}>
      {part.fields.map((field) => (
        <FieldView key={field.key} fieldKey={field.key} value={field.value} depth={depth} />
      ))}
    </div>
  );
}

/** Renders one deep nested structure as a collapsible disclosure block. */
function CollapsibleBlock(props: { readonly title: string; readonly depth: number; readonly children: ReactNode }): ReactNode {
  const { title, depth, children } = props;
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.block} style={{ "--dssw-depth": depth } as CSSProperties}>
      <DisclosureRow
        icon={<FileTypeIcon kind="other" size={16} />}
        title={title}
        open={open}
        expandable
        onToggle={() => setOpen(!open)}
        className={styles.disclosure}
      >
        {open ? children : null}
      </DisclosureRow>
    </div>
  );
}

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
      {parts.blocks.map((block) => {
        if (block.kind === "section") {
          return (
            <section key={block.title} className={styles.section}>
              <h3 className={styles.sectionTitle}>{block.title}</h3>
              <div className={styles.fields}>
                {block.fields.map((field) => (
                  <FieldView key={field.key} fieldKey={field.key} value={field.value} depth={1} />
                ))}
              </div>
            </section>
          );
        }
        if (block.kind === "list") {
          return (
            <section key={block.title} className={styles.section}>
              <h3 className={styles.sectionTitle}>{block.title}</h3>
              <PartBody part={{ kind: "sequence", items: block.items }} depth={1} />
            </section>
          );
        }
        return (
          <section key={block.title} className={styles.section}>
            <h3 className={styles.sectionTitle}>{block.title}</h3>
            <p className={styles.paragraph}>{block.text}</p>
          </section>
        );
      })}
    </div>
  );
}
