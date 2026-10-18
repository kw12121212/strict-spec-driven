/**
 * `strictSpec` namespace dictionaries: the zh set is the key-set source of
 * truth and the en set must declare exactly the same keys, so every
 * user-visible string the placeholder renders exists in both catalogs.
 */
import type { LocaleDictOf } from "@deepseek-ai/dsh-client-ui-slots";

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  "panel.title": "Strict 文档",
  "panel.placeholder": "Strict 文档查看器将在后续变更中提供。",
} as const;

/** The strictSpec namespace key union. */
export type StrictSpecKey = keyof typeof zh;

/** English dictionary, checked complete against the zh key set. */
export const en: LocaleDictOf<"strictSpec"> = {
  "panel.title": "Strict documents",
  "panel.placeholder": "The strict document viewer arrives in a later change.",
};
