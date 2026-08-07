# strict-spec-driven

[English](README.md) | 中文

**文档：** [快速入门](QUICKSTART.zh.md) · [架构文档](ARCHITECTURE.md) · [架构文档快速入门](ARCHITECTURE_QUICKSTART.zh.md) · [UI 设计系统快速入门](DESIGN_QUICKSTART.zh.md) · [路线图快速入门](ROADMAP_QUICKSTART.zh.md) · [路线图指南](ROADMAP_GUIDE.zh.md) · [开发会话](DEV_SESSIONS.zh.md) · [调试会话](DEBUG_SESSIONS.zh-CN.md) · [Harness](HARNESS.zh.md) · [RTK](RTK.md)

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
| `roadmap-status` | 验证并报告严格路线图状态 |
| `roadmap-overview` | 输出面向人的路线图总览表 |
| `roadmap-sync [--fix-names]` | 协调并重新生成严格路线图索引；`--fix-names` 将命名不规范的 planned-change 文件重命名为规范文件名 |
| `roadmap-generate milestone` | 通过结构化命名参数创建或更新严格路线图里程碑 |
| `roadmap-generate planned-change` | 在 CLI 计算的规范文件名处创建或更新独立 planned-change 工件 |
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

类 Unix 主机运行 `install.sh`，Windows 运行 `install.ps1`。安装器会安装 strict skills 包和 `strict-spec-cli` 命令，并自动引导自身依赖：缺失时自动安装 `bun`，`node_modules` 缺失时用 `bun install` 安装项目依赖，并通过 `bunx` 运行全局 `skills` CLI。

在类 Unix 主机上，当 npm/Node 可用且 npm 全局前缀可写时，`install.sh` 通过 `npm install -g .` 安装 `strict-spec-cli`——命令进入 npm 全局 bin 目录（已在 `PATH` 上），装完即可直接使用，无需改 PATH，也不产生大型原生可执行文件。当 npm 不可用，或 `npm install -g .` 因权限失败（系统管理的全局前缀需要 sudo）时，回落到构建原生 `strict-spec-cli` 可执行文件并放入用户级 bin 目录（默认 `~/.local/bin`，或 `$STRICT_SPEC_BIN_DIR` / `$XDG_BIN_HOME`）。npm 安装成功时还会删除先前回落安装遗留的原生可执行文件，确保 `PATH` 上只解析到一个 `strict-spec-cli`。

在 Windows 上，当 npm/Node 可用时，`install.ps1` 通过 `npm install -g .` 安装 `strict-spec-cli`——命令进入 npm 全局 bin 目录（已在 `PATH` 上），因此装完即可在任意终端直接使用，无需改 PATH。当 npm 不可用时，回落到构建原生 `strict-spec-cli` 可执行文件并放入用户级 bin 目录；此情况下默认把该目录加入当前用户的 `PATH`，在安装器会话之外用 `strict-spec-cli` 命令名前请重新打开一个终端。使用 `-NoPathUpdate` 可跳过 PATH 变更，使用 `-KeepPathOnUninstall` 可在卸载时保留 PATH 条目。

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
| `/strict-spec-design` | 编写或刷新设计系统制品并渲染 `DESIGN.md` |
| `/strict-spec-design-sync` | 将设计系统制品与 UI 代码漂移对账同步 |
| `/strict-spec-resync-code-mapping` | 修复规范实现和测试映射 |
| `/strict-spec-maintenance` | 运行仓库维护工作流 |

**严格路线图 Skills**（`strict-roadmap-*`）：

| 斜杠命令 | 用途 |
|---|---|
| `/strict-roadmap-recommend` | 从路线图推荐下一个计划变更 |
| `/strict-roadmap-review` | 审查未完成的路线图里程碑并直接修复 |
| `/strict-roadmap-plan` | 创建或重构路线图 |
| `/strict-roadmap-sync` | 协调路线图里程碑和变更状态 |

路线图文档描述了首选的拆分文件协作模型：保持里程碑文件和 `INDEX.yaml` 低变动率，将日常路线图工作存储在 `.strict-spec-driven/roadmap/planned-changes/` 中，在合并或归档交接后重新运行 `roadmap-sync`，并将外部跟踪器引用视为可选上下文而非必需的真实来源。

独立 planned-change 文件使用由 CLI 负责的规范文件名：`<milestone-id>-<planned-change-id>.yaml`（当 planned-change id 已以 milestone id 开头时不重复前缀）。文件名顺序具有语义意义——`roadmap-recommend` 按文件名顺序选择第一个符合条件的 planned change——因此活动 planned-change 文件的非规范文件名是 `roadmap-status` 与 `roadmap-sync` 的阻塞性验证诊断（已归档的 planned-change 文件豁免）。请通过 `roadmap-generate planned-change` 创建和更新 planned-change 工件（文件名由 CLI 自行计算），并用 `roadmap-sync --fix-names` 修复历史遗留的错误命名；切勿手工挑选 planned-change 文件名。

## 需求拷问

每一条从人类请求开始的路径——`/strict-spec-brainstorm`、`/strict-spec-propose`、
`/strict-spec-bugfix`、`/strict-spec-auto`——都会先拷问**需求**，再由变更接收问题门去拷问
**方案**。它排在前面，是因为一个范围划得很干净、却建立在误读需求之上的变更，依然是错的变更。

需求类答案**永远不从仓库证据中获取**。代码能说明系统做了什么，说明不了一个人想要什么。
只有请求者自己的话（包括他在当前请求里已经说过的内容），或者回放的路线图 planned-change
与里程碑详情，才能回答这些问题。

第一次运行 `generate <change-name> questions ...` 时会把五条固定问题作为 open 条目写入
`questions.yaml`，因此刚开始编写的变更会被阻断：

| 问题 id | 问什么 | 怎样才算答完整 |
|---|---|---|
| `requirement-problem` | 今天具体出了什么问题，谁在承受？ | 谁受影响、他现在改用什么办法、多久发生一次——且不点名任何功能 |
| `requirement-outcome` | 什么样的可观测差异证明它被解决了？ | 一个人将会看到什么、或不必再做什么，且能从系统外部核对 |
| `requirement-trigger` | 为什么是现在，什么逼出了它？ | 具体的事件、期限、事故或代价；如果确实没有，就如实说明 |
| `requirement-non-goals` | 什么明确不能改？ | 必须原样保留的邻近行为，以及谁依赖它 |
| `requirement-interpretation` | 打算取哪一种读法？ | 把想要的那一种说清楚到足以排除其他读法 |

每条预置条目都自带说明——为什么问、怎样才算答完整、一个具体范例、以及这个答案会改变什么，
因此回答它不需要事先了解这套工作流。

答案带归属记录。`--answered-by human` 和 `--answered-by roadmap` 满足门禁；
`--answered-by assumption` 表示答案由 agent 在没有人类确认的情况下给出，会阻断 `ready`
直到有人明确决定：

```bash
strict-spec-cli generate <change-name> questions --resolve requirement-problem \
  --answer "..." --answered-by human
```

只要任一固定问题缺失、仍处于 open、由 assumption 回答，或者已解决却完全没有归属标注，
`ready` 就会输出 `requirement_intake` 诊断并非零退出。没有任何 questions 生成器标志
可以删除 requirement 类条目。

强制力分三层，值得说清楚哪层管什么：

| 层 | 机制 | 保证什么 |
|---|---|---|
| CLI | 第一次编写 questions、`ready` 诊断 | 问题存在、已被回答、带有归属 |
| Skills | 四个 skill 提示词中的提问技术，由 `validate-skills` 强制 | 一次问一条、每条带具体猜测、提问前先解释、推回时说明理由 |
| 都不管 | — | agent 是否真的认真拷问过。这是判断，无法检查；记录 `answered_by: assumption` 让糊弄留下痕迹，而不是阻止它 |

## 变更接收问题门

面向提案的 Skills 会在上述需求拷问之后、实现之前运行一个简短的变更接收问题门。它们会先用可用证据回答检查清单：当前请求、路线图 planned-change 详情、严格规范、技术标准、已有变更制品、仓库搜索结果以及确定性 CLI 输出。如果这些证据已经回答了清单项，工作流不会再向人重复提问。

检查清单覆盖：要改什么、为什么值得做、包含什么、不包含什么、哪些既有行为必须保持不变、工作可能位于哪里、如何证明它有效、相关风险或依赖是什么，以及适用哪些技术规则。

如果发现后仍缺少必需答案，Skill 会在 `questions.yaml.open` 中记录条目，包含具体上下文、影响和推荐答案或选项。当 `questions.yaml.open` 还有必需条目时，实现交接会刻意停止；必须先把答案解析到 `questions.yaml.resolved`，`/strict-spec-auto` 或 `/strict-spec-apply` 才能继续。

面向人的问题文本、上下文、建议、选项和摘要会使用 `.strict-spec-driven/config.yaml` 中的 `preferred_human_language`，除非当前用户消息明确要求另一种语言。问题 id、制品字段、schema 名称、命令名和文件路径等稳定技术值保持为不随语言变化的标识符。


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

## CLI 独占的 YAML 编写

仓库拥有的所有严格制品，其 YAML 结构与文件系统写入均由 CLI 代码负责。受支持的 AI 工作流通过各制品的所属严格 CLI 命令和命名语义参数表达每一次创建、更新、命名条目删除和整个制品的删除；绝不提供原始 YAML 载荷、heredoc、临时载荷文件、任意输出路径或直接文件编辑。只读的 YAML 查看始终允许；人类保留完全的手工自主权——该策略约束的是 AI 变更工作流，不是人。

协议的权威表述由 CLI 自身输出：

```sh
strict-spec-cli yaml-authoring-protocol
strict-spec-cli yaml-authoring-protocol <artifact-kind>
```

其七个有序步骤：

1. **读取所属命令的机器可读帮助** —— `<owning-command> --help --json`。帮助即契约；凭记忆的标志不是。
2. **解析目标制品的 schema** —— `schema-list`，然后 `schema-show <schema-key>`。
3. **查看注册的最小示例** —— `sample-list`，然后 `sample-show <example-key>`。示例是只读参考，绝不复制到目标位置当作起始文件。
4. **将确认的事实转换为文档化的命名参数** —— 每个值都必须能追溯到请求、schema 或仓库证据。
5. **用这些参数执行所属命令。**
6. **检查结构化结果与变更路径** —— 报告不完整的结果是一次成功但仍有后续工作的写入，不是需要重试的失败。
7. **运行该制品的验证命令** —— 捕获单次写入自身结果无法报告的跨文件影响。

协议以一条边界收尾：当所需的命令、参数或制品类型不可用时，**停止并报告缺失的能力**——无法完成的操作、目标制品类型与对象、缺失的命令或参数、已查阅过的发现命令。没有任何回退路径；命令不可用是停止的理由，不是即兴变通的理由。

用 `yaml-surface-list` 和 `yaml-surface-show <kind>` 可按制品族发现完整的变更接口：每个族支持的操作、所属命令、被拒绝的操作和跨文件影响。制品写入是惰性且原子的：第一次成功的 `generate` 调用同时创建变更容器和制品，绝不写占位文件，被拒绝的写入不会触碰任何既有状态。

## 模式和示例资源

捆绑的严格 YAML 模式文件位于 `templates/strict-spec-driven/schemas/`。最小有效示例作为仓库参考资源位于 `examples/strict-spec-driven/`。这些与 `.strict-spec-driven/` 工作流状态分离。

`templates/strict-spec-driven/schemas/schema-registry.yaml` 中的模式注册表索引了所有支持的严格制品族。

CLI 也会内置捆绑的 schema 和脚手架资源，因此已安装的 Skills 不需要每个目录都带一个 `templates` 符号链接。Agent 可以通过以下命令查看内置契约：

```sh
strict-spec-cli schema-list
strict-spec-cli schema-show change-proposal
strict-spec-cli sample-show change-proposal
strict-spec-cli template-show scaffold/config.yaml
```

### 共享模式缓存

每个 `strict-spec-driven` CLI 命令（`--help`/`-h` 除外）和 MCP 服务器在启动时会将捆绑的 schema 文件和严格 YAML sample 文件导出到共享的磁盘缓存 `~/.strict-spec-schemas/`，使 Agent 无需每个项目都带 `templates` 或 `examples` 目录即可将制品的 `schema_file` 路径和 schema 的 `example_ref` 路径解析到一个固定的根目录。缓存包含 `templates/strict-spec-driven/schemas/` 下的 schema 文件、`examples/strict-spec-driven/` 下的 sample 文件，以及记录导出版本的 `manifest.yaml`；当捆绑 schema 或 sample 变化，或缓存文件缺失、被修改时会自动刷新，随时可以安全删除——下次运行会重建。设置 `STRICT_SPEC_SCHEMA_CACHE_DIR` 环境变量可重定向缓存根目录。若缓存不可写，命令会继续使用捆绑资源并打印包含解析后缓存路径的警告。制品声明的 `schema_file` 路径在该缓存根目录下解析，schema 的 `example_ref` 路径在缓存的 examples 树下解析；已安装的 Skills 绝不假设存在源码仓库的 `templates` 或 `examples` 目录。

## 标准作业程序（SOP）

经 schema 验证的标准作业程序位于 `.strict-spec-driven/sops/` 下，是由 CLI 负责的 YAML。通过命名参数编写和维护：新建程序用 `sop-create`（`--title`、`--category`、`--purpose`、`--trigger`、步骤、角色、升级、异常），字段与命名条目的更新和删除用 `sop-edit`，用 `sop-validate` 按 SOP schema 验证单个或全部程序。只读查看用 `sop-list`、`sop-show`、`sop-category-list`、`sop-category-show`；用 `schema-show sop` 和 `schema-show sop-category` 查看制品契约。

```sh
strict-spec-cli sop-create --title "发布回滚" --category release \
  --purpose "..." --trigger "..." --scope-in "..." --success "..." \
  --prerequisite "..." --exception-condition "..." --exception-handling "..." \
  --step-id assess --step-actor operator --step-action "..." --step-expected "..."
strict-spec-cli sop-edit <sop-id> --step-id verify --step-actor operator \
  --step-action "..." --step-expected "..."
strict-spec-cli sop-validate
```

每个类别都强制要求自己的必需章节——编写前用 `sop-category-show <id>` 查看。

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
