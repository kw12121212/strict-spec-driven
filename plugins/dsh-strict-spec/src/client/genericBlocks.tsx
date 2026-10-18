/**
 * The shared generic rendering: the block, field, list, paragraph, and
 * collapsible presentation the generic structured view draws, extracted so
 * every dedicated renderer appends its unrecognized top-level fields through
 * exactly the same rendering — one implementation, so the dedicated
 * additional-fields section and the generic view can never disagree about
 * how a YAML shape renders.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { DisclosureRow, FileTypeIcon } from "@deepseek-ai/dsh-client-ui-primitives";
import type { Translate } from "@deepseek-ai/dsh-client-ui-slots";
import type { DocumentBlock, DocumentPart } from "./documentParts.ts";
import type { StrictSpecKey } from "./locales.ts";
import styles from "./DocumentView.module.css";

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

/** Renders generic blocks: titled sections, lists, and wrapped paragraphs. */
export function GenericBlocksView(props: { readonly blocks: readonly DocumentBlock[] }): ReactNode {
  const { blocks } = props;
  return (
    <>
      {blocks.map((block) => {
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
    </>
  );
}

/**
 * Renders the additional-fields section of a dedicated view: every
 * unrecognized top-level field, drawn through the generic blocks so a newer
 * schema version never makes content disappear from the reader. An empty
 * partition renders nothing rather than an empty section.
 */
export function AdditionalFieldsView(props: {
  readonly blocks: readonly DocumentBlock[];
  readonly t: Translate<StrictSpecKey>;
}): ReactNode {
  const { blocks, t } = props;
  if (blocks.length === 0) {
    return null;
  }
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("view.additional-fields")}</h3>
      <GenericBlocksView blocks={blocks} />
    </section>
  );
}
