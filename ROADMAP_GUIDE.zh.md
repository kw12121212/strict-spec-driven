# 路线图指南：strict-spec-driven

[English](ROADMAP_GUIDE.md) | 中文

**快速入门：** [English](ROADMAP_QUICKSTART.md) | [中文](ROADMAP_QUICKSTART.zh.md)

本指南涵盖面向贡献者的路线图工作流：里程碑结构、独立计划变更文件、路线图 Skill 命令，以及如何保持团队协作的合并友好性。

## 路线图位置

严格路线图位于 `.strict-spec-driven/roadmap/` 下：

```text
.strict-spec-driven/roadmap/
  INDEX.yaml                 # 键控里程碑索引
  milestones/
    0001-some-milestone.yaml
    0002-another-milestone.yaml
  planned-changes/
    0001-some-milestone-add-work.yaml
    0001-some-milestone-fix-docs.yaml
```

推荐的布局原则：

- `INDEX.yaml` 保持为低变更频率的里程碑索引
- 里程碑文件存放持久的里程碑元数据，迁移后保持 `planned_changes: {}`
- `planned-changes/` 下的独立计划变更文件是团队日常工作项的主要操作界面

如果你的项目在迁移前还遗留了 `.spec-driven/roadmap/` 目录，仅将其视为迁移历史。严格 CLI 读取和重写 `.strict-spec-driven/roadmap/` 作为规范路线图来源。

## 路线图索引

`INDEX.yaml` 是一个键控里程碑映射。每个条目标识一个里程碑文件及其声明的状态：

```yaml
schema: strict-spec-driven/roadmap-index/v2
schema_version: 2
artifact_type: roadmap_index
schema_file: ../../templates/strict-spec-driven/schemas/roadmap-index.yaml
milestones:
  0001-example-milestone:
    title: Example Milestone
    path: roadmap/milestones/0001-example-milestone.yaml
    status: proposed
```

索引由 `roadmap-sync` 重新生成。保持简洁，不要将其用作高变更频率的工作项注册表。

## 里程碑结构

里程碑文件定义持久的规划上下文：目标、范围、完成标准、依赖、风险、备注，以及里程碑声明的状态。

示例里程碑：

```yaml
schema: strict-spec-driven/roadmap-milestone/v2
schema_version: 2
artifact_type: roadmap_milestone
schema_file: ../../templates/strict-spec-driven/schemas/roadmap-milestone.yaml
milestone:
  0001-example-milestone:
    title: Example Milestone
goal: 定义一个里程碑目标。
scope:
  in:
    - 计划内的严格工作流行为。
  out:
    - 不相关的行为。
done_criteria:
  - 计划的行为已实现并验证通过。
planned_changes: {}
dependencies: []
risks: []
status: proposed
notes: []
details: >-
  里程碑整体的更详细规划上下文。
```

保持里程碑文件中的 `planned_changes: {}`。非空的内联条目被视为旧路线图数据，必须先完成物化转换，否则普通路线图命令将无法成功执行。

## 独立计划变更文件

使用 `.strict-spec-driven/roadmap/planned-changes/` 下的独立计划变更制品作为添加或编辑路线图工作项的默认方式。

示例计划变更文件：

```yaml
schema: strict-spec-driven/planned-change/v1
schema_version: 1
artifact_type: planned_change
schema_file: ../../templates/strict-spec-driven/schemas/planned-change.yaml
planned_change:
  id: add-session-model
  milestone: 0001-user-auth
status: planned
summary: 添加会话数据模型和存储。
details: >-
  将会话工作流存储为独立的路线图条目，这样贡献者可以更新此文件而无需重写里程碑文件。
depends_on: []
team:
  owner: alice
  reviewers:
    - bob
  blocked:
    status: false
  labels:
    - roadmap
  external_refs:
    - label: Tracking issue
      target: https://example.com/issues/123
```

必填字段：

| 字段 | 说明 |
|---|---|
| `planned_change.id` | kebab-case 计划变更标识 |
| `planned_change.milestone` | 所属里程碑 ID |
| `status` | `planned` 或 `complete` |
| `summary` | 简短的工作摘要 |
| `details` | 此工作项的聚焦规划上下文 |
| `depends_on` | 前置计划变更的 ID 列表 |

可选的 `team` 元数据仅用于协调参考。`owner`、`reviewers`、`blocked`、`labels` 和 `external_refs` 有助于团队协作，但它们不是锁，也不能替代 Git 或代码审查。

## 旧内联 `planned_changes`

非空的里程碑 `planned_changes` 映射会被视为旧路线图数据。

`roadmap-status` 和普通的 `roadmap-sync` 检测到内联条目时会直接报错，并提示你先完成物化转换。

如果你想把旧的内联里程碑条目转换为独立 planned-change 文件，请运行：

```sh
node scripts/strict-spec-driven.js roadmap-sync --materialize-planned-changes
```

这个转换会在 `.strict-spec-driven/roadmap/planned-changes/` 下写入 planned-change 文件，从里程碑文件中移除已转换的内联条目，然后再基于物化后的布局重新协调路线图状态。如果你是在已安装的 skill 包里运行，请使用 `skills/strict-roadmap-sync/SKILL.md` 中记录的准确命令形式。

## 冲突抵抗的团队工作流

路线图通过制品粒度设计来减少合并冲突：

1. 保持里程碑文件聚焦于里程碑级别的规划上下文。
2. 将日常路线图工作项放在独立计划变更文件中。
3. 让每个贡献者编辑自己拥有的计划变更文件，而不是追加到同一个里程碑映射里。
4. 保持 `INDEX.yaml` 作为共享里程碑列表，而不是每个工作项的协调界面。

推荐习惯：

- 每个计划变更一个文件。
- 将团队元数据视为协调参考提示，而非独占声明。
- 合并后重新运行 `/strict-roadmap-sync` 或 `node scripts/strict-spec-driven.js roadmap-sync`。
- 归档路线图支持的严格变更后，重新运行 `roadmap-sync`，使计划变更和里程碑状态与工作流状态保持一致。
- 外部跟踪器引用仅作为可选的辅助上下文。GitHub Issues、Jira、Linear 及类似工具不是严格路线图的必需数据来源。

## 路线图 Skill 命令

使用以下 Claude Code 斜杠命令操作路线图：

### `/strict-roadmap-recommend`

读取路线图状态，并从独立 planned-change 文件中推荐下一个最佳计划变更。该命令直接将推荐的变更搭建成标准严格变更，放在 `.strict-spec-driven/changes/` 下，不在此阶段额外等待确认。

脚手架验证通过后，默认的下一步是 `/strict-spec-auto`。如果推荐过程产生了开放问题，这些问题会记录在 `questions.yaml` 中，并在实现之前呈现给用户。

## 变更接收问题门

面向提案的工作流必须在实现前回答一组简短检查清单。Agent 应先使用当前请求、选中的路线图 planned-change 详情、工单来源、主规范、技术标准、已有变更制品、仓库搜索结果以及确定性 CLI 输出作为证据，再决定是否需要向人提问。

检查清单意图包括：

- 要改什么？
- 为什么值得做？
- 应包含什么？
- 应排除什么？
- 哪些既有行为必须保持不变？
- 这项工作可能位于哪里：代码、规范、模板、Skills、文档、配置，还是发现到的其他仓库制品？
- 如何证明它有效？
- 是否可能影响现有用户、已保存数据、API、安全、隐私、性能、发布或回滚？
- 是否被路线图项、工单、活跃变更、服务、凭据或外部依赖阻塞？
- 适用哪些已有技术规则，或这个变更是否需要新的技术规则？

如果发现过程已经回答某个清单项，Agent 使用该证据，不再重复提问。如果必需答案仍然未知，提案创建会在 `questions.yaml.open` 中记录它，说明未知内容、为什么重要、受影响的范围或测试决定，以及推荐答案或选项。

路线图支持的提案流程会把选中的独立 planned-change `summary`、`details`、`depends_on`、labels、`source_ticket` 和所属里程碑 `details` 视为同一清单的有效证据。完整的路线图细节应被带入生成的提案制品，而不是变成重复的人类问题。稀薄的路线图细节、缺少实现/测试/规范影响、依赖不确定性或技术标准不确定性，都应在实现前成为本地化的 `questions.yaml.open` 阻塞项。

面向人的问题文本、上下文、建议、选项和摘要必须使用 `.strict-spec-driven/config.yaml` 中的 `preferred_human_language`，除非当前用户消息明确要求另一种语言。问题 id、制品字段、schema 名称、命令名和文件路径等稳定技术值保持为稳定标识符，不做本地化。

当 `questions.yaml.open` 中仍有必需条目时，实现交接会停止。这些未解决问题必须被解析并移动到 resolved question 状态后，`/strict-spec-auto`、`/strict-spec-apply` 或其他实现工作流才能继续。

### `/strict-roadmap-review`

审查单个未完成里程碑的目标、范围、完成标准、依赖、风险和计划变更 `details`，直接修复里程碑与计划变更 YAML，然后重新运行 `roadmap-sync`。

```text
/strict-roadmap-review 0001-user-auth
```

### `/strict-roadmap-plan`

创建或重构路线图。适合需要添加、重排或重写里程碑的场景。

### `/strict-roadmap-sync`

将路线图状态与严格工作流状态协调。

它会：

- 重新生成 `INDEX.yaml`
- 协调里程碑状态
- 协调独立计划变更状态
- 拒绝旧的内联里程碑 `planned_changes`，除非你明确请求物化转换

合并后和归档路线图支持的工作后运行此命令：

```text
/strict-roadmap-sync
```

CLI 形式：

```sh
node scripts/strict-spec-driven.js roadmap-sync
```

## 如何添加计划变更

推荐步骤：

1. 打开 `.strict-spec-driven/roadmap/milestones/` 下的所属里程碑文件，确认其目标、范围和完成标准仍然准确描述了该工作领域。
2. 在 `.strict-spec-driven/roadmap/planned-changes/` 下新建一个独立文件。
3. 设置 `planned_change.id`、`planned_change.milestone`、`status`、`summary`、`details` 和 `depends_on`。
4. 如果有助于协调，添加可选的 `team` 元数据。
5. 运行 `/strict-roadmap-sync` 验证路线图并刷新派生状态。

示例：

```yaml
schema: strict-spec-driven/planned-change/v1
schema_version: 1
artifact_type: planned_change
schema_file: ../../templates/strict-spec-driven/schemas/planned-change.yaml
planned_change:
  id: my-new-change
  milestone: 0001-example-milestone
status: planned
summary: 添加一个新的路线图工作项。
details: >-
  解释此变更的聚焦规划上下文。
depends_on: []
```

## 如何完成计划变更

计划变更的完成状态从已归档的严格工作流状态中派生。

1. 使用 `/strict-roadmap-recommend` 搭建变更。
2. 使用 `/strict-spec-auto` 或手动严格生命周期命令实现变更。
3. 归档严格变更。
4. 运行 `/strict-roadmap-sync`。
5. 确认 `roadmap-status` 显示你期望的计划变更和里程碑状态。

不要在实现后手动编辑路线图完成状态。让严格工作流归档加上 `roadmap-sync` 更新路线图制品。

## 检查路线图状态

如果你想查看适合人类阅读的里程碑状态全景和分组计划变更明细：

```sh
node scripts/strict-spec-driven.js roadmap-overview
```

如果你需要机器可读的校验输出：

```sh
node scripts/strict-spec-driven.js roadmap-status
```

`roadmap-overview` 会先输出里程碑总览表，再按里程碑分组输出计划变更明细。

`roadmap-status` 会以 JSON 输出每个里程碑的声明状态和派生状态、每个计划变更的来源文件路径和工作流状态，以及任何不匹配或跨文件校验问题。

## 工单来源与接收流水线

里程碑可以源自一个**工单**——存放于 `.strict-spec-driven/tickets/` 的纯需求（问题、期望的可观察结果、意图）严格 YAML 捕获，其 id 来自内容派生、具备冲突抵抗性，而非共享计数器。端到端路径为：

```text
工单 -> 分诊决定 -> 路线图里程碑 -> 计划变更 -> 严格变更 -> 规范 / 技术标准 / 代码
```

两个接收步骤都是 Skill：`/strict-ticket` 捕获需求（不做方案设计），`/strict-ticket-dispatch` 判断需求是否已实现并驱动 `ticket-resolve`。**判断属于 AI 工作，仅存在于分诊 Skill 提示中**；**CLI 只执行确定性的状态转换**并将决定记录到工单上。在 `not_implemented` 决定下，CLI 会：

- 确定性地分配下一个里程碑编号，冲突时拒绝（绝不覆盖）；
- 物化一个里程碑骨架，goal 取自工单的期望结果，scope 与 done criteria 留作明确的 `REFINEMENT NEEDED` 占位；
- 在 `INDEX.yaml` 中登记，将工单置为 `promoted`，并写入双向链接：`ticket.promoted_to` 和里程碑的 `source_ticket` 反向引用。

晋升是**幂等的**——对已晋升的工单重复分诊会返回既有里程碑，而不会创建第二个。

`roadmap-status` 会为已晋升的里程碑呈现工单来源：输出来源工单 id（`sourceTicket`），并在里程碑仍带晋升占位时设置 `needsScopeRefinement`，提示审阅者运行 `/strict-roadmap-milestone` 定义真实的范围、完成标准与依赖，再将其视为可执行。`roadmap-sync` 会保留 `source_ticket` 反向引用，不丢弃、不重复、不重排。
