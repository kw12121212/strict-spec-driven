# Harness

[English](HARNESS.md) | 中文

`harness.yaml` 是针对严格（strict）项目的统一环境、组件、生命周期和调查模型。
它用一个由脚本管理的工作面取代了独立的开发会话（development-session）和调试会话（debug-session）工作流。

## 声明定义 (Declaration)

该声明定义文件位于 `.strict-spec-driven/harness.yaml`。

它描述了开发和生产环境、类型化组件、依赖顺序、就绪性检查（readiness checks）、敏感环境变量名称（避免泄密）、显式操作模式、生成的脚本、证据标签（evidence labels）、重现/重放命令（replay commands）以及不可用条件。

请勿在 harness YAML、生成的脚本、证据文件名、日志或聊天记录中存储敏感值（secrets）、凭证、Token、连接字符串或生产环境凭证材料。

只有 `operations.start` 和 `operations.stop` 是可执行的生命周期钩子（lifecycle hooks）。`operations.status` 和 `operations.logs` 是可选的描述性元数据：当其存在且为 `readonly` 时，表示该声明仅用于记录可用性状况，而不是提供供 CLI 运行的命令。`harness-status` 始终报告运行时的状态，`harness-logs` 始终读取捕获的运行时日志文件，而 `harness-plan` 和 `harness-doctor` 不需要 status/logs 命令。

## 命令 (Commands)

```bash
strict-spec-cli harness-infer
strict-spec-cli harness-infer --write
strict-spec-cli harness-edit --component-environment development --component web --component-type frontend --port 3000
strict-spec-cli harness-doctor
strict-spec-cli harness-plan --environment development
strict-spec-cli harness-start --environment development --component web
strict-spec-cli harness-status
strict-spec-cli harness-logs web
strict-spec-cli harness-logs web --tail 50
strict-spec-cli harness-logs web --all
strict-spec-cli harness-stop
strict-spec-cli harness-scripts generate
strict-spec-cli harness-scripts verify
strict-spec-cli harness-session create checkout-investigation
strict-spec-cli harness-session validate checkout-investigation
strict-spec-cli harness-session archive checkout-investigation
```

声明文件和会话制品都是由 CLI 负责的 YAML：AI 工作流通过 `harness-infer --write`、`harness-edit` 和 `harness-session` 的命名参数创建与修改它们，而不是书写 YAML 文本；人类仍可在 AI 工作流之外手工维护声明文件。 <!-- human-manual-edit --> 用 `strict-spec-cli harness-edit --help --json` 和 `strict-spec-cli harness-session --help --json` 查看准确的参数契约，用 `schema-show harness`、`schema-show harness-session` 及对应的 `sample-show` 键查看制品形状。`harness-infer`（不带 `--write`）、`harness-plan`、`harness-doctor`、`harness-status` 和 `harness-logs` 属于只读检查。各制品声明的 `schema_file` 在共享 schema 缓存根目录 `~/.strict-spec-schemas/`（或 `STRICT_SPEC_SCHEMA_CACHE_DIR`）下解析，schema 的 `example_ref` 路径在缓存的 examples 树下解析。

`harness-scripts generate` 将写入项目本地的包装脚本（wrappers）：

- `scripts/harness-infer`
- `scripts/harness-doctor`
- `scripts/harness-plan`
- `scripts/harness-start`
- `scripts/harness-stop`
- `scripts/harness-status`
- `scripts/harness-logs`
- `scripts/harness-session`

`harness-infer` 读取安全的仓库元数据，例如 package 脚本、compose 服务、Procfile 进程、Makefile 中的 run/start/dev 目标以及示例环境变量文件（sample env files），然后生成一个符合 Schema 的有效草案。当多种信号类型共存时，package 脚本仍然优先；否则，对于 compose 和 Procfile 源，会按文件中的顺序选择第一个类似于应用的候选。推断出的生命周期命令保持为手动模式（manual），生产环境生命周期操作保持禁用，推断出的 status/logs 元数据通过 `readonly` 保持为描述性，如果未找到受支持的生命周期信号，草案将保持为手动模式并附带显式的“未检测到”说明。

`harness-doctor` 针对 Schema 或规划失败、缺失生成的包装脚本、缺失工作目录、缺失 package 脚本、示例 env 文件中未声明但为必填的环境变量名称、重复的端口以及安全策略问题报告确定性的诊断结果。它不会启动或停止服务。类似于 `.env.example` 的示例 env 文件仅记录所需的变量名称：`harness-start` 仍会读取当前进程的环境变量，不会替你加载 `.env` 文件，并要求你在启动组件之前先导出（export）或 source 所需的值。

`harness-logs` 用于读取选定托管组件的已捕获运行时日志。默认情况下，它仅返回最近的 200 行；使用 `--tail <n>` 可以请求不同的行数，或者使用 `--all` 打印完整的捕获日志。

## 安全性 (Safety)

生产环境的变更性操作（mutating operations）默认处于禁用状态。生产环境的 `start`、`stop` 或类似于清理的操作必须被显式声明，且设置 `requires_confirmation: true`，并在调用时进行二次确认。

有状态的组件（如数据库、缓存、队列、对象存储和托管外部资源）需要设置 `allow_stateful_lifecycle: true`，然后脚本才能启动或停止它们。

## 会话 (Sessions)

Harness 会话保存在 `.strict-spec-driven/harness-sessions/<session-id>/` 目录下。
每个会话会记录选定的环境/组件、生命周期证据（lifecycle evidence）、重现步骤、证据条目（evidence entries）、假设（hypotheses）、发现（findings）、人工检查点（human checkpoints）、手动操作、重放/重现命令（replay commands）以及验证状态。

证据条目和手动操作必须保持 `contains_secrets: false` 和 `secrets_recorded: false`。

## 技能 (Skills)

两个技能驱动 harness 工作流：

### `/strict-spec-harness-init`

创建或优化项目的 harness 声明。步骤如下：

1. 运行 `harness-infer`，从仓库元数据（package 脚本、compose 服务、Procfile 进程、Makefile 目标、示例 env 文件）生成 `harness.yaml` 草案。
2. 检查项目中的前端、后端、数据库、缓存、Worker、队列、对象存储、外部资源、浏览器、Electron 和 CDP 组件。
3. 当命令、生产环境安全性、有状态生命周期权限、就绪性检查或敏感环境变量名称无法自动发现时，提出针对性问题。
4. 写入 `.strict-spec-driven/harness.yaml`，仅存储环境变量名称——绝不存储敏感值。
5. 运行 `harness-doctor`，修复缺失的目录、缺失的脚本、包装脚本偏差、env 示例文件缺口、重复端口以及安全问题。
6. 对每个声明的环境通过 `harness-plan` 进行验证。
7. 在 `scripts/` 下生成并验证项目本地脚本。

推断出的生产环境命令和有状态生命周期操作保持禁用状态，直到人工明确确认。

### `/strict-spec-harness-session`

引导 harness 调查会话，包含生命周期证据、人工检查点、重放命令和验证。步骤如下：

1. 使用 `harness-session create <session-id>` 创建新会话，或验证现有会话。
2. 记录选定的 harness 环境和组件。
3. 通过 `scripts/harness-*` 包装脚本（plan、start、status、logs、stop）捕获生命周期证据。
4. 通过 `human_checkpoints` 和 `manual_actions` 记录敏感或手动操作，并保持 `secrets_recorded: false`。
5. 保存重放命令，并使用证据标识符更新验证状态。
6. 使用 `harness-session validate <session-id>` 进行验证，然后归档状态为 `resolved` 或 `blocked` 的会话。

此技能取代了早期的 debug-session 工作流。不要从中创建或管理 `debug-session` 产物。
