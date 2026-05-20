# 路线图快速入门

[English](ROADMAP_QUICKSTART.md) | 中文

一份动手指南，五分钟内从零开始搭建一个可用的路线图。

## 路线图能为你做什么

strict 路线图让你将工作规划为包含**计划变更（planned changes）**的**里程碑（milestones）**，然后将每个计划变更交接给标准的严格变更生命周期。CLI 保持声明状态和派生状态同步，让你随时了解进展。

## 第 1 步：初始化

如果还没有初始化，先在你的项目中初始化严格工作流：

```
/strict-spec-init
```

这会创建 `.strict-spec-driven/roadmap/` 目录和一个空的 `INDEX.yaml`。

## 第 2 步：规划路线图

创建路线图结构——包含目标、范围和计划变更的里程碑：

```
/strict-roadmap-plan
```

该 Skill 会引导你定义里程碑。你也可以直接编辑 YAML 文件。

每个里程碑文件位于 `.strict-spec-driven/roadmap/milestones/` 下，格式如下：

```yaml
schema: strict-spec-driven/roadmap-milestone/v2
schema_version: 2
artifact_type: roadmap_milestone
schema_file: ../schemas/roadmap-milestone.yaml
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

关键点：
- 里程碑 ID 使用 4 位数字前缀（`0001-`、`0002-`、...）
- 计划变更使用 kebab-case ID
- 每个计划变更大致对应一个严格变更
- 里程碑文件里的 `planned_changes` 默认保持为空；日常工作项放到独立 planned-change 文件里

在 `.strict-spec-driven/roadmap/planned-changes/` 下为每个计划变更新建单独文件，例如：

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
  把这项工作放在独立文件里，避免多人反复修改同一个里程碑文件。
depends_on: []
```

## 第 3 步：查看路线图状态

随时可以检查路线图状态：

```sh
node scripts/strict-spec-driven.js roadmap-overview
```

如果你想看适合人类阅读的里程碑表格和按里程碑分组的 planned change 明细，就用 `roadmap-overview`；如果你需要 JSON 校验载荷，就用 `roadmap-status`：

```sh
node scripts/strict-spec-driven.js roadmap-status
```

编辑里程碑文件后，同步索引：

```
/strict-roadmap-sync
```

## 第 4 步：选择下一步工作

让工作流根据依赖关系和里程碑进度推荐下一个最佳计划变更：

```
/strict-roadmap-recommend
```

该 Skill 会分析你的路线图，选择最佳候选，并直接将其搭建成标准严格变更，放在 `.strict-spec-driven/changes/` 下；recommend 阶段不会额外停下来等待确认。

如果你已经知道要处理哪个计划变更：

```
/strict-roadmap-propose add-session-model
```

## 第 5 步：作为标准严格变更执行

搭建完成后，计划变更就变成了一个标准的严格变更。运行标准生命周期：

```
/strict-spec-apply add-session-model
/strict-spec-verify add-session-model
/strict-spec-archive add-session-model
```

或使用自动化流程：

```
/strict-spec-auto
```

## 第 6 步：同步路线图

归档变更后，同步路线图以更新计划变更状态：

```
/strict-roadmap-sync
```

这会将对应的计划变更标记为 `complete`，并更新里程碑的派生状态。

## 典型工作循环

```
/strict-roadmap-recommend          ← 接下来该做什么？
  ↓
/strict-spec-auto                  ← 端到端执行
  ↓
/strict-roadmap-sync               ← 更新路线图状态
  ↓
重复直到里程碑完成
```

## 兼容性说明

如果你当前的里程碑文件里仍然使用内联 `planned_changes`，`roadmap-status` 和普通的 `roadmap-sync` 会直接报错，并提示你先做转换。

如果你想主动把内联条目转换为独立 planned-change 文件，请运行：

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

完整的 YAML 模式和字段定义参考，请参阅 [ROADMAP_GUIDE.md](ROADMAP_GUIDE.md)。
