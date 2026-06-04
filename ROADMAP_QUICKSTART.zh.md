# 路线图快速入门

[English](ROADMAP_QUICKSTART.md) | 中文

一份动手指南，使用拆分文件、抗冲突的团队工作流从零开始搭建一个可用的路线图。

## 路线图能为你做什么

strict 路线图让你将工作规划为里程碑加计划变更，然后将每个计划变更交接给标准的严格变更生命周期。推荐的协作模式是保持里程碑文件稳定，将日常工作项放到独立的计划变更文件中。

## 第 1 步：初始化

如果还没有在项目中初始化严格工作流状态：

```text
/strict-spec-init
```

这会创建 `.strict-spec-driven/roadmap/` 目录和一个空的 `INDEX.yaml`。

## 第 2 步：规划里程碑

创建或完善你的里程碑元数据：

```text
/strict-roadmap-plan
```

每个里程碑文件位于 `.strict-spec-driven/roadmap/milestones/` 下，格式如下：

```yaml
schema: strict-spec-driven/roadmap-milestone/v2
schema_version: 2
artifact_type: roadmap_milestone
schema_file: ../../templates/strict-spec-driven/schemas/roadmap-milestone.yaml
milestone:
  0001-user-auth:
    title: 用户认证
goal: 添加认证功能，让用户能够安全登录。
scope:
  in:
    - 登录和登出流程。
    - 会话管理。
  out:
    - OAuth 提供方集成。
done_criteria:
  - 用户可以登录和登出。
  - 会话在 24 小时后过期。
planned_changes: {}
dependencies: []
risks: []
status: proposed
notes: []
```

里程碑文件用于持久的路线图上下文。不要把它当作每个贡献者追加新工作项的默认位置。

## 第 3 步：添加计划变更文件

在 `.strict-spec-driven/roadmap/planned-changes/` 下创建独立的计划变更文件：

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
  把这项工作放在独立文件里，避免一人更新时重写整个里程碑文件。
depends_on: []
team:
  owner: alice
  reviewers:
    - bob
  blocked:
    status: false
```

关键点：

- 里程碑 ID 使用 4 位数字前缀
- 计划变更 ID 使用 kebab-case
- 每个计划变更大致对应一个严格变更
- `team` 元数据是可选的，仅供参考

在正常路线图工作中，里程碑的 `planned_changes` 保持为空。非空的内联条目会被视为遗留数据，必须先完成实体化，`roadmap-status` 和普通的 `roadmap-sync` 才能成功运行。

## 第 4 步：检查并同步路线图状态

随时可以检查路线图状态：

```sh
node scripts/strict-spec-driven.js roadmap-overview
```

使用 `roadmap-overview` 查看人类可读的里程碑表格和按里程碑分组的计划变更明细，或使用 `roadmap-status` 获取 JSON 校验载荷：

```sh
node scripts/strict-spec-driven.js roadmap-status
```

编辑里程碑或计划变更文件后，同步路线图：

```text
/strict-roadmap-sync
```

如果你合并了分支或归档了路线图相关的工作，请再次运行 `roadmap-sync`，以便从工作流状态重新计算派生状态。

## 第 5 步：选择下一个计划变更

让工作流根据依赖关系和当前路线图状态推荐最佳下一步变更：

```text
/strict-roadmap-recommend
```

如果你已经知道要处理哪个路线图工作项：

```text
/strict-roadmap-propose add-session-model
```

两条命令都会在 `.strict-spec-driven/changes/` 下搭建一个标准的严格变更。

## 第 6 步：作为标准严格变更实施

搭建完成后，计划变更就变成了一个标准的严格变更：

```text
/strict-spec-auto
```

或使用手动流程：

```text
/strict-spec-apply add-session-model
/strict-spec-verify add-session-model
/strict-spec-archive add-session-model
```

## 第 7 步：再次同步路线图

归档后，刷新路线图：

```text
/strict-roadmap-sync
```

这会更新派生的计划变更和里程碑状态。实施完成后不要手动编辑路线图的完成状态。

## 典型工作循环

```text
/strict-roadmap-recommend          ← 接下来该做什么？
  ↓
/strict-spec-auto                  ← 端到端执行
  ↓
/strict-roadmap-sync               ← 归档或合并后重新同步路线图
  ↓
重复直到里程碑完成
```

## 兼容性说明

如果你当前的里程碑文件里仍然使用内联 `planned_changes`，普通的 `roadmap-status` 和 `roadmap-sync` 会报错并提示你先完成实体化。请使用以下命令转换：

```sh
node scripts/strict-spec-driven.js roadmap-sync --materialize-planned-changes
```

如果你是在已安装的 skill 包里运行，请使用 `skills/strict-roadmap-sync/SKILL.md` 中记录的准确命令形式。

## 命令参考

| 命令 | 用途 |
|---|---|
| `/strict-roadmap-plan` | 创建或重构路线图 |
| `/strict-roadmap-milestone` | 完善单个里程碑的细节 |
| `/strict-roadmap-recommend` | 获取下一个变更的推荐 |
| `/strict-roadmap-propose` | 直接搭建指定的计划变更 |
| `/strict-roadmap-sync` | 将路线图状态与工作流同步 |

完整的 YAML 模式和字段定义参考，请参阅 [ROADMAP_GUIDE.zh.md](ROADMAP_GUIDE.zh.md)。
