# Ticket 指南：strict-spec-driven

[English](TICKET_GUIDE.md) | 中文

**相关：** [快速入门](QUICKSTART.zh.md) · [路线图指南](ROADMAP_GUIDE.zh.md)

本指南完整介绍 ticket 录入工作流：一条原始需求如何变成 strict YAML ticket、分流（triage）如何判断它是否已经实现、以及每种决策如何驱动 ticket CLI。Ticket 是工作流的最前端——在任何解决方案、技术选型或设计之前记录的纯需求。

端到端路径：

```text
ticket（纯需求）-> 分流决策 -> 路线图里程碑 -> 计划变更 -> strict 变更 -> spec / tech / code
```

## Ticket 的存放位置

Ticket 存放在 `.strict-spec-driven/tickets/`：

```text
.strict-spec-driven/tickets/
  INDEX.yaml              # 按键索引的 ticket 索引，由 CLI 重新生成
  <ticket-id>.yaml        # 每条 ticket 一个文件
```

Ticket id 是**抗冲突且基于内容派生**的：标题的 slug 加上标题、问题、期望结果三者拼接后的 SHA-256 哈希前 6 位。id 从不取自共享的顺序计数器，因此多人并发录入不会在全局编号上冲突，而同一需求永远解析到同一 id（从而让创建是幂等的）。

`INDEX.yaml` 在每次创建或处置 ticket 时由磁盘上的 ticket 文件**确定性重建**。把它当作低变更频率的索引——永远不要手改。

## 两个录入技能

Ticket 录入被刻意拆成两个技能。录入与分流从不一起运行。

| 技能 | 职责 | 何时使用 |
|---|---|---|
| `/strict-ticket` | 通过 CLI 把原始需求**录入**为纯意图 ticket | 你有一条需求，但还没决定它是否要变成工作 |
| `/strict-ticket-dispatch` | 对一条 open ticket 进行**分流**：判断是否已实现，再驱动 `ticket-resolve` | 你想关闭、晋升或驳回一条已存在的 ticket |

这条边界是刻意的：**"是否已实现"的判断是只属于分流技能 prompt 的 AI 工作**，而 **CLI 只执行确定性的状态流转**，并把决策作为可审计的 triage 记录写回 ticket。录入技能不做分流、不关闭、不晋升、不驳回，也不创建里程碑。

## Ticket 工件结构

Ticket 是一个 strict YAML 工件（`strict-spec-driven/ticket/v1`），只记录纯意图。

示例：

```yaml
schema: strict-spec-driven/ticket/v1
schema_version: 1
artifact_type: ticket
schema_file: ../../templates/strict-spec-driven/schemas/ticket.yaml
ticket:
  id: export-changes-as-csv-7f3a9c
  title: Export changes as CSV
requirement:
  problem: 运维人员无法拿到 strict changes 的表格快照用于工具外分享。
  desired_outcome: 用户能获取一份包含 strict changes 状态与里程碑的 CSV。
  intent: 只记录需求；导出格式、命令面与实现均留待下游决定。
status: open
created_at: "2026-06-13T00:00:00Z"
labels:
  - reporting
external_tracker:
  label: GitHub
  target: https://example.com/org/repo/issues/42
```

字段：

| 字段 | 说明 |
|---|---|
| `ticket.id` / `ticket.title` | 基于内容派生的 id 与人类可读标题 |
| `requirement.problem` | 用户遇到的缺口，用其语言描述——不含任何解法 |
| `requirement.desired_outcome` | 满足后应当成立或可做的事，描述为可外部观测的行为 |
| `requirement.intent` | 可选的验收说明：用户如何判断需求已满足 |
| `status` | 生命周期状态：`open`、`needs_input`、`promoted`、`implemented`、`rejected` |
| `created_at` | 创建时间戳 |
| `labels` | 可选的分类标签 |
| `external_tracker` | 可选的外部追踪器引用（GitHub/Jira 链接）。只是普通引用，不是实时集成 |
| `provenance.promoted_to` | 里程碑 id，在 ticket 晋升时写入 |
| `provenance.implemented_by` | 证据引用，在 ticket 作为"已实现"关闭时记录 |
| `triage_decision` | 分流记录：outcome、rationale、decided_at，可选 evidence |

`problem` 与 `desired_outcome` 必填。`intent` 及 `status` 以下字段均可选。

## Ticket 生命周期

Ticket 以 `open` 起步，最终落到三个终态之一，由分流决策决定：

```text
              ┌── implemented   ─> implemented   （带证据关闭）
              │
open ─────────┼── not_implemented ─> promoted    （创建路线图里程碑）
              │
              └── not_wanted    ─> rejected       （驳回或推迟）
```

当证据模棱两可、相互矛盾，或 spec 覆盖太薄而无法自信判断时，分流不会猜测：它把 ticket 留在 `open`（或移到 `needs_input`），交回给用户。

## 分流结果（Triage Outcomes）

分流驱动 `ticket-resolve`，三选一。CLI 只为你决定的 outcome 执行确定性流转。

| 结果（`--outcome`） | Ticket 状态 | CLI 做什么 |
|---|---|---|
| `implemented` | `implemented` | 把证据引用记录到 `provenance.implemented_by` |
| `not_wanted` | `rejected` | 把理由保留进可审计的 triage 记录；ticket 永不被丢弃 |
| `not_implemented` | `promoted` | 把 ticket 晋升为新的路线图里程碑骨架（见下） |

每次决策都会写入一条 `triage_decision` 记录（outcome、rationale、decided_at，可选 evidence），让推理过程可审计。

## 晋升机制

在 `not_implemented` 决策下，CLI 把 ticket 晋升为一个新的路线图里程碑。它会：

- **确定性地分配下一个 4 位里程碑编号**，同时扫描路线图索引键与磁盘上的里程碑文件；遇冲突时**拒绝、绝不覆写**；
- 在 `.strict-spec-driven/roadmap/milestones/` 下物化一个 `status: proposed` 的里程碑骨架；
- 用 ticket 的 `desired_outcome` 填充里程碑 `goal`；
- 把 `scope.in` / `scope.out` 与 `done_criteria` 留作显式的 `REFINEMENT NEEDED` 桩——真实范围在下游定义，此处绝不编造；
- 把里程碑注册进 `roadmap/INDEX.yaml`；
- 把 ticket 设为 `promoted` 并写入**双向链接**：`ticket.provenance.promoted_to` 与里程碑的 `source_ticket` 反向引用。

晋升是**幂等的**——对已晋升的 ticket 再次以 `not_implemented` 分流，会返回已存在的里程碑，而不会创建第二个。

晋升要求 `.strict-spec-driven/roadmap/INDEX.yaml` 存在。若不存在，CLI 会以 `roadmap index not found; cannot promote ticket` 失败。

晋升之后，运行 `roadmap-sync` 对齐路线图状态，再把范围定义交接给 `/strict-roadmap-milestone`（或 `/strict-roadmap-plan`）。分流技能绝不编造里程碑范围，也不在此拆解 change。

## CLI 命令参考

所有 ticket 状态变更都走 CLI。命令以 JSON 输出，失败时带路径感知的诊断并退出非零。

| 命令 | 签名 | 用途 |
|---|---|---|
| `check-workflow-state` | — | 任何 ticket 工作的前置；缺 `.strict-spec-driven/` 时失败 |
| `ticket-create` | `--title <text> --problem <text> --desired-outcome <text> [--intent <text>] [--label <text>]... [--external-label <text> --external-target <text>]` | 用抗冲突 id 与 `open` 状态脚手架化新 ticket；重跑幂等 |
| `ticket-list` | — | 按确定性顺序列出每条 ticket 的 id、标题、状态、路径 |
| `ticket-show <id>` | `<ticket-id>` | 打印单条 ticket 及其路径；未知 id 给出确定性 not-found 错误 |
| `ticket-validate [<id>]` | `[<ticket-id>]` | 校验单条（带 id）或全部 ticket 及索引是否满足内置 schema |
| `ticket-resolve <id>` | `--outcome <not_implemented\|implemented\|not_wanted> --rationale <text> [--evidence-label <text> --evidence-target <text>]...` | 记录分流决策并执行确定性流转 |
| `roadmap-sync` | — | 晋升后对齐路线图状态（在范围交接之前运行） |

`--external-label` 与 `--external-target` 必须成对提供，每个 `--evidence-label` 也必须配一个 `--evidence-target`。两者均可重复。

仓库内调用形式：

```sh
node scripts/strict-spec-driven.js ticket-create --title "..." --problem "..." --desired-outcome "..."
```

通过已安装的技能包运行时，请使用 `skills/strict-ticket/SKILL.md` 与 `skills/strict-ticket-dispatch/SKILL.md` 中记录的准确命令形式。

## 端到端录入工作流

### 录入（`/strict-ticket`）

1. 运行 `check-workflow-state`。若缺 `.strict-spec-driven/`，停下来先运行 `/strict-spec-init`——技能自身绝不运行 `init`。
2. 与用户协作提炼纯意图：**problem**（缺口，用其语言，不含解法）与 **desired observable outcome**（满足后成立的可观测行为）。若用户描述的是方案、技术或设计，把它反射回成问题与结果。
3. 视情况收 `labels` 与 `external_tracker` 引用。
4. 用普通语言向用户复述问题、期望结果与意图，确认不含 solutioning。
5. 仅用 `ticket-create` 创建 ticket。绝不手写 ticket YAML，也不手改 tickets 索引。
6. 报告 ticket id 与路径。下一步是分流。

### 分流（`/strict-ticket-dispatch`）

1. 选中 ticket——若用户未指定，运行 `ticket-list`，挑一条 open 的并 `ticket-show` 它。
2. 收集证据：阅读 `.strict-spec-driven/specs/INDEX.yaml`、相关 main spec、spec 到代码的映射、映射到的实现与测试文件，以及仓库文档（README、QUICKSTART、各指南）。记下你判断所依据的具体 spec、代码与文档引用。
3. 形成判断：`implemented`、`not_implemented` 或 `not_wanted`。若证据模棱两可或太薄，则 defer，把 ticket 留在 open。
4. 仅通过 `ticket-resolve` 应用决策——绝不手改 ticket YAML。
5. 晋升后运行 `roadmap-sync`，再把范围定义交接给 `/strict-roadmap-milestone`。
6. 报告决策、所依证据、最终 ticket 状态，以及（若晋升）创建的里程碑 id。

## 快速示例

```sh
# 录入
node scripts/strict-spec-driven.js ticket-create \
  --title "Export changes as CSV" \
  --problem "运维人员无法拿到 strict changes 的表格快照用于工具外分享。" \
  --desired-outcome "用户能获取一份包含 strict changes 状态与里程碑的 CSV。" \
  --intent "只记录需求；格式与命令面留待下游决定。" \
  --label reporting \
  --external-label GitHub --external-target https://example.com/org/repo/issues/42

# 查看
node scripts/strict-spec-driven.js ticket-list
node scripts/strict-spec-driven.js ticket-show export-changes-as-csv-7f3a9c
node scripts/strict-spec-driven.js ticket-validate
node scripts/strict-spec-driven.js ticket-validate export-changes-as-csv-7f3a9c

# 分流——三选一：

# 已实现：带证据关闭
node scripts/strict-spec-driven.js ticket-resolve export-changes-as-csv-7f3a9c \
  --outcome implemented \
  --rationale "CSV 导出已存在于 operations 命令面。" \
  --evidence-label spec --evidence-target .strict-spec-driven/specs/operations/domain-behavior.yaml \
  --evidence-label code --evidence-target src/cli/cmd-operations.ts

# 确为新需求：晋升为路线图里程碑，随后 roadmap-sync + /strict-roadmap-milestone
node scripts/strict-spec-driven.js ticket-resolve export-changes-as-csv-7f3a9c \
  --outcome not_implemented \
  --rationale "当前工作流中完全不存在任何 CSV 导出能力。"

# 驳回或推迟
node scripts/strict-spec-driven.js ticket-resolve export-changes-as-csv-7f3a9c \
  --outcome not_wanted \
  --rationale "与即将到来的报表重写重叠；本期不在范围内。"
```

## 规则与边界

- 只录入纯意图——问题、期望结果、验收说明。绝不录入方案、技术选型或设计。
- 只通过 ticket CLI 命令创建与修改 ticket。绝不手写 ticket YAML，也不手改 tickets 索引。
- 把"是否已实现"的判断留在分流技能 prompt 中；把每一次状态流转留给 CLI。
- 证据模棱两可时交回用户，把 ticket 留在 open 或 `needs_input`——绝不猜测式流转。
- 晋升之后运行 `roadmap-sync`，并把范围定义交接给 `/strict-roadmap-milestone`。绝不编造里程碑范围，也不在此拆解 change。
