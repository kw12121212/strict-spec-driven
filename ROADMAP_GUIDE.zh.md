# 路线图指南：strict-spec-driven

[English](ROADMAP_GUIDE.md) | 中文

**快速入门：** [English](ROADMAP_QUICKSTART.md) | [中文](ROADMAP_QUICKSTART.zh.md)

本指南涵盖面向贡献者的路线图工作流：里程碑结构、计划变更条目、路线图 Skill 命令，以及如何添加或完成计划变更。

## 路线图位置

严格路线图位于 `.strict-spec-driven/roadmap/` 下：

```
.strict-spec-driven/roadmap/
  INDEX.yaml              # 有序里程碑列表
  milestones/
    0001-first-milestone.yaml
    0002-second-milestone.yaml
    ...
```

这些文件都是严格 YAML 制品，由 `roadmap-status` 和 `roadmap-sync` CLI 子命令验证。

如果同时存在保留的引导目录 `.spec-driven/roadmap/`，仅将其视为迁移历史。严格 CLI 读取和重写 `.strict-spec-driven/roadmap/` 作为规范路线图来源。

## 路线图索引

`INDEX.yaml` 按规范顺序列出里程碑。每个条目包含四个必填字段：

```yaml
schema: strict-spec-driven/roadmap-index/v2
schema_version: 2
artifact_type: roadmap_index
schema_file: ../schemas/roadmap-index.yaml
milestones:
  0001-first-milestone:
    title: 0001 First Milestone
    path: roadmap/milestones/0001-first-milestone.yaml
    status: proposed   # proposed | active | blocked | complete
  0002-second-milestone:
    title: 0002 Second Milestone
    path: roadmap/milestones/0002-second-milestone.yaml
    status: proposed
```

索引由 `roadmap-sync` 自动重新生成。不要直接编辑索引；更新里程碑文件后运行 `roadmap-sync` 来重新生成。

## 里程碑结构

每个里程碑文件是一个严格 YAML 制品。必填的顶层字段：

```yaml
schema: strict-spec-driven/roadmap-milestone/v2
schema_version: 2
artifact_type: roadmap_milestone
schema_file: ../schemas/roadmap-milestone.yaml
milestone:
  0001-first-milestone:
    title: 0001 First Milestone
goal: >-
  一句话描述里程碑的目的。
scope:
  in:
    - 里程碑范围内的事项。
  out:
    - 明确不在范围内的事项。
done_criteria:
  - 标志里程碑完成的可验证结果。
planned_changes:
  example-change:
    status: planned    # planned | complete
    summary: >-
      一句话描述此变更的内容。
    depends_on: []     # 依赖的计划变更 ID 列表
status: proposed       # proposed | active | blocked | complete
dependencies: []
risks: []
notes: []
```

可选字段（`dependencies`、`risks`、`notes`）在不需要时可以省略或设为空数组。

## 计划变更条目格式

`planned_changes` 下的每个条目是嵌入里程碑中的严格 YAML 文档。必填字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | 枚举 | `planned` 或 `complete` |
| `summary` | 字符串 | 一句话描述变更内容 |
| `depends_on` | 数组 | 此条目依赖的计划变更 ID（可为空） |
| `details` | 字符串 | 可选，变更的技术和设计上下文 |

## 路线图 Skill 命令

使用以下 Claude Code 斜杠命令操作路线图：

### `/strict-roadmap-recommend`

读取路线图状态并推荐下一个最佳计划变更。考虑依赖顺序、里程碑进度和规划优先级。随后直接将推荐的变更搭建成标准严格变更，放在 `.strict-spec-driven/changes/` 下，不在 recommend 阶段额外停下来等待用户确认。

脚手架验证通过后，默认的下一步应是 `/strict-spec-auto`，让这个推荐变更继续跑完后续严格生命周期；只有在用户明确想手动控制时，才回到手动命令序列。如果 recommendation 过程中产生了开放问题，`strict-roadmap-recommend` 只负责把它们写进 `questions.yaml`，真正向用户确认答案应由 `/strict-spec-auto` 或 `/strict-spec-apply` 在实现前完成。

适合在开始新的工作会话时使用，获取下一步该做什么的指导。

### `/strict-roadmap-propose`

将指定的计划变更条目转换为严格变更脚手架。适合已经知道要处理哪个计划变更、想跳过推荐步骤的场景。

```
/strict-roadmap-propose my-change-name
```

### `/strict-roadmap-milestone`

完善单个里程碑的目标、范围、完成标准、依赖、风险和备注。适合需要更新里程碑规划内容但不重构整个路线图的场景。

```
/strict-roadmap-milestone 0001-core-strict-workflow
```

### `/strict-roadmap-plan`

创建或重构路线图。适合添加新里程碑、重新排列里程碑顺序或进行重大规划修订的场景。

### `/strict-roadmap-sync`

将路线图状态与工作流状态协调。当对应的严格变更已归档时，将计划变更标记为 `complete`。从当前里程碑文件重新生成 `INDEX.yaml`。

归档变更后运行此命令以保持路线图为最新状态：
```
/strict-roadmap-sync
```

也可以通过 CLI 运行：
```sh
node dist/strict-spec-cli.js roadmap-sync
```

## 如何添加计划变更

1. 打开 `.strict-spec-driven/roadmap/milestones/` 下的相关里程碑 YAML 文件。
2. 在 `planned_changes` 映射中添加新条目，包含所有必填字段。
3. 设置 `status: planned` 和 `depends_on: []`（或列出前置变更 ID）。
4. 运行 `/strict-roadmap-sync` 验证并重新生成路线图索引。

示例条目：
```yaml
  my-new-change:
    status: planned
    summary: >-
      一句话描述此变更要达成的目标。
    depends_on: []
```

## 如何完成计划变更条目

计划变更状态在归档严格变更时自动更新。工作流为：

1. 使用 `/strict-spec-propose`、`/strict-spec-apply`、`/strict-spec-verify`、`/strict-spec-archive`（或 `/strict-spec-auto`）提议并实现变更。
2. 归档后运行 `/strict-roadmap-sync` 将对应的计划变更条目标记为 `complete`。
3. 运行 `node dist/strict-spec-cli.js roadmap-status` 确认里程碑状态正确。

不要手动将计划变更条目设为 `status: complete`——让 `roadmap-sync` 从归档状态中派生。

## 检查路线图状态

```sh
node dist/strict-spec-cli.js roadmap-status
```

报告每个里程碑的声明状态和派生状态、每个计划变更的状态，以及路线图声明与工作流状态之间的任何不匹配。输出为 JSON。
