# strict-spec-driven

[English](README.md) | 中文

**文档：** [快速入门](QUICKSTART.zh.md) · [路线图快速入门](ROADMAP_QUICKSTART.zh.md) · [路线图指南](ROADMAP_GUIDE.zh.md) · [Ticket 指南](TICKET_GUIDE.zh.md) · [开发会话](DEV_SESSIONS.zh.md) · [调试会话](DEBUG_SESSIONS.zh-CN.md) · [Harness](HARNESS.zh.md) · [RTK](RTK.md)

`strict-spec-driven` 是一个 YAML 优先的规范驱动开发工作流。它提供规范驱动生命周期（提议 → 执行 → 验证 → Skill 驱动代码审查 → 归档）和 Agent Skills 集成，将工作流制品——规范、变更、路线图、任务、问题——转换为严格 YAML 模式，由确定性脚本强制执行。

`SKILL.md` 文件保留为 Markdown，因为这是 Agent Skills 打包格式的要求。变化的是这些 Skills 生成和消费的制品格式。

## 目录结构

| 目录 | 用途 |
|---|---|
| `.strict-spec-driven/` | 活跃的严格工作流状态 |
| `.strict-spec-driven/changes/` | 活跃的变更目录 |
| `.strict-spec-driven/changes/archive/` | 已归档的变更 |
| `.strict-spec-driven/roadmap/` | 严格 YAML 路线图制品 |
| `.strict-spec-driven/roadmap/planned-changes/` | 首选的独立路线图工作项文件 |
| `.strict-spec-driven/specs/` | 严格 YAML 主规范文件 |
| `templates/strict-spec-driven/schemas/` | 捆绑的严格 YAML 模式文件 |
| `examples/strict-spec-driven/` | 仓库参考用的最小有效 YAML 示例 |
| `templates/strict-spec-driven/scaffold/` | `init` 和 `propose` 使用的脚手架模板 |
| `skills/` | 严格 Skill 包（`strict-spec-*` 和 `strict-roadmap-*`） |
| `src/` | TypeScript CLI 源码 |
| `dist/` | 编译输出（由构建生成） |

本仓库只保留一个活跃工作流目录 `.strict-spec-driven/`。`.spec-driven/` 仅作为仍使用旧版 Markdown 工作流的**其他项目**的迁移*输入*相关，详见[迁移边界](#迁移边界)。本仓库已完成该迁移，不再保留根级 `.spec-driven/` 目录。

## 严格命令接口

### CLI：`strict-spec-driven`

在 `bun run build` 之后（或通过已安装的 `node dist/strict-spec-cli.js`）可用的子命令：

| 子命令 | 用途 |
|---|---|
| `init` | 在项目中创建 `.strict-spec-driven/` 脚手架 |
| `propose <name>` | 创建新的严格变更脚手架 |
| `apply <name>` | 完成变更中的下一个待处理任务 |
| `verify <name>` | 验证变更的制品和任务完成情况 |
| `archive <name>` | 合并增量规范并将变更移入归档 |
| `ship <name>` | 读取已归档变更摘要以进行 git 提交交接 |
| `migrate` | 将 `.spec-driven/` 引导状态转换为 `.strict-spec-driven/` |
| `list` | 报告活跃和已归档的变更 |
| `modify [<name>]` | 列出变更的可编辑制品路径 |
| `cancel <name>` | 删除活跃变更（已归档变更受保护） |
| `maintenance` | 运行已配置的仓库维护检查 |
| `ticket-create` | 以冲突抵抗的 id 捕获一个纯需求工单 |
| `ticket-list` / `ticket-show <id>` | 枚举工单或打印单个工单 |
| `ticket-validate [<id>]` | 针对捆绑 schema 校验一个或全部工单 |
| `ticket-resolve <id>` | 记录分诊决定并执行状态转换（晋升 / 关闭 / 拒绝） |
| `roadmap-status` | 验证并报告严格路线图状态 |
| `roadmap-overview` | 输出面向人的路线图总览表 |
| `roadmap-sync` | 协调并重新生成严格路线图索引 |
| `verify-spec-mappings` | 审计规范实现和测试映射覆盖率 |
| `validate-skills` | 验证严格 Skill 打包元数据和命令脚本符号链接 |
| `schema-list` | 列出捆绑的严格 schema 资源键 |
| `schema-show <name>` | 输出一个捆绑的严格 schema 资源 |
| `sample-list` | 列出捆绑的严格 YAML sample 资源键 |
| `sample-show <name>` | 输出一个捆绑的严格 YAML sample 资源 |
| `template-list` | 列出捆绑的模板和 schema 资源键 |
| `template-show <key>` | 输出一个捆绑的模板或 schema 资源 |
| `harness-infer` | 从仓库元数据推断安全 harness 声明草稿 |
| `harness-doctor` | 诊断 harness 声明、包装脚本、环境和安全问题 |
| `harness-plan` | 验证并推导确定性 harness 计划 |
| `harness-start` / `harness-stop` | 管理已声明的可执行 harness 组件 |
| `harness-status` / `harness-logs` | 检查受管 harness 运行时状态和日志 |
| `harness-scripts <generate\|verify>` | 生成或验证项目本地的 `scripts/harness-*` 包装脚本 |
| `harness-session <create\|validate\|archive>` | 管理结构化 harness 调查会话 |

### 安装

类 Unix 主机运行 `install.sh`，Windows 运行 `install.ps1`。安装器会构建原生 `strict-spec-cli` 可执行文件、安装 strict skills 包，并把可执行文件放到用户级 bin 目录。它还会自动引导自身依赖：缺失时自动安装 `bun`，`node_modules` 缺失时用 `bun install` 安装项目依赖，并通过 `bunx` 运行全局 `skills` CLI——因此安装过程不再需要 Node.js/`npm`。

在 Windows 上，`install.ps1` 默认会把所选 bin 目录加入当前用户的 `PATH`。在安装器会话之外用 `strict-spec-cli` 命令名前，请重新打开一个终端。使用 `-NoPathUpdate` 可跳过 PATH 变更，使用 `-KeepPathOnUninstall` 可在卸载时保留 PATH 条目。

### Skills：`strict-spec-*` 和 `strict-roadmap-*`

Skills 是通过 `install.sh` 安装的 Agent Skills 包。在 Claude Code 中使用斜杠命令名称调用它们：

**严格规范工作流 Skills**（`strict-spec-*`）：

| 斜杠命令 | 用途 |
|---|---|
| `/strict-spec-init` | 在项目中初始化严格工作流 |
| `/strict-spec-propose` | 提议新变更 |
| `/strict-spec-apply` | 实现变更中的任务 |
| `/strict-spec-verify` | 验证变更是否完成 |
| `/strict-spec-review` | 基于证据对变更进行代码质量审查 |
| `/strict-spec-archive` | 归档已完成的变更 |
| `/strict-spec-auto` | 端到端自动化变更生命周期 |
| `/strict-spec-ship` | 通过 git 提交发布已归档的变更 |
| `/strict-spec-migrate` | 将引导状态迁移到严格 YAML |
| `/strict-spec-brainstorm` | 在提议前对变更想法进行头脑风暴 |
| `/strict-spec-modify` | 修改现有变更的制品 |
| `/strict-spec-propose-from-roadmap` | 从路线图推荐项提议变更 |
| `/strict-spec-harness-init` | 创建或优化 `.strict-spec-driven/harness.yaml` 和生成脚本 |
| `/strict-spec-harness-session` | 运行结构化 harness 调查 |
| `/strict-spec-spec-edit` | 直接编辑主规范文件 |
| `/strict-spec-sync-specs` | 与代码漂移同步规范 |
| `/strict-spec-resync-code-mapping` | 修复规范实现和测试映射 |
| `/strict-spec-maintenance` | 运行仓库维护工作流 |
| `/strict-ticket` | 将原始需求捕获为纯意图工单 |
| `/strict-ticket-dispatch` | 判断是否已实现并驱动工单状态转换 |

**严格路线图 Skills**（`strict-roadmap-*`）：

| 斜杠命令 | 用途 |
|---|---|
| `/strict-roadmap-recommend` | 从路线图推荐下一个计划变更 |
| `/strict-roadmap-review` | 审查未完成的路线图里程碑并直接修复 |
| `/strict-roadmap-plan` | 创建或重构路线图 |
| `/strict-roadmap-sync` | 协调路线图里程碑和变更状态 |

路线图文档描述了首选的拆分文件协作模型：保持里程碑文件和 `INDEX.yaml` 低变动率，将日常路线图工作存储在 `.strict-spec-driven/roadmap/planned-changes/` 中，在合并或归档交接后重新运行 `roadmap-sync`，并将外部跟踪器引用视为可选上下文而非必需的真实来源。

## 工单接收与分诊

工单是工作流的入口：工单将一个**纯需求**——问题、期望的可观察结果、意图——捕获为不含任何解决方案的严格 YAML 制品，存放于 `.strict-spec-driven/tickets/`，其 id 来自内容派生、具备冲突抵抗性（而非共享计数器）。接收分两步：

1. **捕获** —— `/strict-ticket`（或 `ticket-create`）将需求记录为纯意图并通过 CLI 创建工单。
2. **分诊** —— `/strict-ticket-dispatch` 阅读工单并检查现有规范、规范到代码的映射、代码与文档，判断需求是否已实现，然后以三种结果之一驱动 `ticket-resolve`：
   - **implemented** —— 关闭工单并记录指向满足该需求的规范/代码/文档的证据链接；
   - **not_implemented** —— 将工单晋升为新的路线图里程碑骨架（goal 取自期望结果；scope 与 done criteria 留作明确的细化占位），随后交接 `/strict-roadmap-milestone` 定义真实范围；
   - **not_wanted** —— 以理由拒绝或推迟工单。

边界是刻意设计的：**是否已实现的判断属于 AI 工作，仅存在于分诊 Skill 提示中**，而 **CLI 只执行确定性的状态转换**并将决定记录为工单上可审计的分诊记录。晋升是幂等的（重复运行绝不会创建第二个里程碑），并写入双向链接——`ticket.promoted_to` 和里程碑的 `source_ticket` 反向引用；`roadmap-status` 会呈现该来源工单（并将刚晋升、仍带细化占位的里程碑标记为需要细化范围），`roadmap-sync` 则会保留它。完整路径为：

```text
工单（纯需求）
  -> 分诊决定（AI 判断，由 CLI 记录）
  -> 路线图里程碑（当 not_implemented 时）
  -> 计划变更 -> 严格变更
  -> 规范 / 技术标准 / 代码
```

### MCP Server：`strict-spec-driven-mcp`

构建的包还包含一个用于兼容 MCP 客户端的本地 MCP 服务器。它是仅 stdio 的集成，始终需要显式的项目根目录：

```json
{
  "mcpServers": {
    "strict-spec-driven": {
      "command": "node",
      "args": [
        "/path/to/strict-spec-driven/dist/scripts/strict-spec-driven-mcp.js",
        "--project",
        "/path/to/your/project"
      ]
    }
  }
}
```

MCP 服务器将 CLI 和 Agent Skills 保留为权威的工作流实现。它将严格工作流制品公开为资源，将工具委托给配置项目根目录下的严格 CLI，并提供指导现有严格 Skills 的提示。

代表性资源：
- `strict://workflow/state`
- `strict://changes/{change}/proposal`
- `strict://specs/{specId}`
- `strict://roadmap/planned-changes/{plannedChangeId}`
- `strict://harness/declaration`

代表性只读请求：要求 MCP 客户端检查严格工作流状态。预期的工具调用是 `check_workflow_state`，它委托给 `strict-spec-cli check-workflow-state`，不会修改项目文件。

代表性提示请求：使用 `{ "change": "my-change" }` 请求 `strict_review_change`，以获取将验证、直接代码审查和完整回归证据保留在工作流中的审查指导。

变更工具需要宿主可见的确认边界。`propose_change`、`generate_change_artifact`、`mark_next_task_complete`、`roadmap_sync` 和 `archive_change` 等工具会写入严格工作流状态。`harness_start` 和 `harness_stop` 是生命周期操作，`archive_change` 属于发布级别，因为它会合并规范并协调路线图状态。

## 模式和示例资源

捆绑的严格 YAML 模式文件位于 `templates/strict-spec-driven/schemas/`。最小有效示例作为仓库参考资源位于 `examples/strict-spec-driven/`。这些与 `.strict-spec-driven/` 工作流状态分离。

`templates/strict-spec-driven/schemas/schema-registry.yaml` 中的模式注册表索引了所有支持的严格制品族。

CLI 也会内置捆绑的 schema 和脚手架资源，因此已安装的 Skills 不需要每个目录都带一个 `templates` 符号链接。Agent 可以通过以下命令查看内置契约：

```sh
node {{SKILL_DIR}}/scripts/strict-spec-driven.js schema-list
node {{SKILL_DIR}}/scripts/strict-spec-driven.js schema-show change-proposal
node {{SKILL_DIR}}/scripts/strict-spec-driven.js sample-show change-proposal
node {{SKILL_DIR}}/scripts/strict-spec-driven.js template-show scaffold/changes/proposal.yaml
```

### 共享模式缓存

每个 `strict-spec-driven` CLI 命令（`--help`/`-h` 除外）和 MCP 服务器在启动时会将捆绑的 schema 文件和严格 YAML sample 文件导出到共享的磁盘缓存 `~/.strict-spec-schemas/`，使 Agent 无需每个项目都带 `templates` 或 `examples` 目录即可将制品的 `schema_file` 路径和 schema 的 `example_ref` 路径解析到一个固定的根目录。缓存包含 `templates/strict-spec-driven/schemas/` 下的 schema 文件、`examples/strict-spec-driven/` 下的 sample 文件，以及记录导出版本的 `manifest.yaml`；当捆绑 schema 或 sample 变化，或缓存文件缺失、被修改时会自动刷新，随时可以安全删除——下次运行会重建。设置 `STRICT_SPEC_SCHEMA_CACHE_DIR` 环境变量可重定向缓存根目录。若缓存不可写，命令会继续使用捆绑资源并打印包含解析后缓存路径的警告。

## Harness

位于 `.strict-spec-driven/harness.yaml` 的 harness 声明文件告诉 Agent 和人类如何规划、启动、停止、检查和调查混合的项目环境。它涵盖了本地开发和生产环境的可观测性、类型化组件、依赖顺序、就绪性、日志、状态、生成的 `scripts/harness-*` 包装脚本、生命周期安全、证据、重放以及敏感信息处理规则。

参见 [HARNESS.zh.md](HARNESS.zh.md) 了解完整参考。

## 迁移边界

`migrate` 子命令和 `/strict-spec-migrate` Skill 将支持的旧版 `.spec-driven/` Markdown 制品转换为 `.strict-spec-driven/` YAML 制品。源 `.spec-driven/` 目录不会被修改。不支持或模糊的旧版格式会在迁移报告中作为手动跟进事项报告。

迁移后，`.strict-spec-driven/` 是活跃的工作流状态。`.spec-driven/` 保留为引导或旧版历史，不作为有效的严格工作流目标处理。

## 自托管状态

本仓库自托管于严格工作流之上。`.strict-spec-driven/` 是唯一活跃的工作流状态，包含活跃的严格规范、路线图和变更历史。从旧版 `.spec-driven/` 工作流的迁移已完成，不再保留根级 `.spec-driven/` 目录。

## 开发

**前置条件：** [Bun](https://bun.sh) 是运行时和包管理器（安装器会在缺失时自动安装）。Node.js 仅用于 `node` 相关命令（`bun run validate-skills`、MCP 服务器），安装过程不需要。

**构建：**
```sh
bun run build
```
通过 TypeScript 将 `src/` 编译到 `dist/`，并将 `templates/` 和 `scripts/` 复制到 `dist/`。

**测试：**
```sh
bun test/run.ts
```
针对已编译的 `dist/` 输出运行测试套件。

**验证 Skills：**
```sh
bun run validate-skills
```
验证所有严格 Skill 包的元数据、命令引用和必需的命令脚本访问。

**约定：**
- 使用结构化 YAML 解析器——核心制品数据绝不使用临时字符串处理。
- 规范变更应在实现之前反映在 `.strict-spec-driven/specs/` 中。
- 任何源码变更后运行 `bun run build && bun test/run.ts`。
- 修改前先阅读现有代码；只实现当前任务所需的内容。
