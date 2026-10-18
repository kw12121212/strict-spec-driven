/**
 * `strictSpec` namespace dictionaries: the zh set is the key-set source of
 * truth and the en set must declare exactly the same keys, so every
 * user-visible string the plugin renders exists in both catalogs.
 */
import type { LocaleDictOf } from "@deepseek-ai/dsh-client-ui-slots";

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  "panel.title": "Strict 文档",
  "panel.placeholder": "Strict 文档查看器将在后续变更中提供。",
  "tree.label": "Strict 文档树",
  "tree.family.config": "配置",
  "tree.family.architecture": "架构",
  "tree.family.roadmap": "路线图",
  "tree.family.changes": "变更",
  "tree.family.scenes": "场景",
  "tree.family.specs": "规格",
  "tree.family.tech": "技术标准",
  "tree.family.lessons": "经验",
  "tree.family.sops": "SOP",
  "tree.family.design-system": "设计系统",
  "tree.loading": "正在加载文档树…",
  "tree.empty": "此工作区没有 .strict-spec-driven/ 目录。",
  "tree.error": "工作区列表读取失败（{code}）。",
  "tree.root-truncated": "根目录列表被截断，部分文档族可能缺失。",
  "tree.truncated": "此目录的列表被截断，条目不完整。",
  "tree.group-count": "{count} 项",
  "view.idle": "从树中选择一个文档。",
  "view.loading": "正在加载文档…",
  "view.absent": "此文件已从磁盘移除。",
  "view.error": "读取失败（{code}）。",
  "view.parse-error": "解析失败：第 {line} 行第 {column} 列 — {message}",
  "view.raw-text": "原始文本",
  "view.empty-document": "此文档未声明任何字段。",
} as const;

/** The strictSpec namespace key union. */
export type StrictSpecKey = keyof typeof zh;

/** English dictionary, checked complete against the zh key set. */
export const en: LocaleDictOf<"strictSpec"> = {
  "panel.title": "Strict documents",
  "panel.placeholder": "The strict document viewer arrives in a later change.",
  "tree.label": "Strict document tree",
  "tree.family.config": "Config",
  "tree.family.architecture": "Architecture",
  "tree.family.roadmap": "Roadmap",
  "tree.family.changes": "Changes",
  "tree.family.scenes": "Scenes",
  "tree.family.specs": "Specs",
  "tree.family.tech": "Tech standards",
  "tree.family.lessons": "Lessons",
  "tree.family.sops": "SOPs",
  "tree.family.design-system": "Design system",
  "tree.loading": "Loading the document tree…",
  "tree.empty": "This workspace has no .strict-spec-driven/ directory.",
  "tree.error": "The workspace listing failed ({code}).",
  "tree.root-truncated": "The root listing was truncated; some document families may be missing.",
  "tree.truncated": "This directory's listing was truncated; its entries are incomplete.",
  "tree.group-count": "{count} entries",
  "view.idle": "Select a document from the tree.",
  "view.loading": "Loading the document…",
  "view.absent": "This file is no longer on disk.",
  "view.error": "The read failed ({code}).",
  "view.parse-error": "Parse error: line {line}, column {column} — {message}",
  "view.raw-text": "Raw text",
  "view.empty-document": "This document declares no fields.",
};
