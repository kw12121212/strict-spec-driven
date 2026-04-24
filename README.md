# strict-spec-driven

`strict-spec-driven` 是 `../auto-spec-driven` 的 YAML-first 变体。

目标是在保留原有 spec-driven workflow 和 Agent Skills 使用方式的基础上，
把 specs、change artifacts、roadmap、questions、tasks 等相关文档格式从
Markdown 约定转为严格 YAML 规范，并让脚本负责创建、解析和校验这些 YAML
结构。

## 与 auto-spec-driven 的关系

本项目参考 `../auto-spec-driven`：

- 保留 spec-driven 的核心工作流语义
- 保留 Agent Skills 作为 AI 操作入口
- 复用原项目的 CLI 责任边界：脚本处理文件系统和校验，AI 处理内容和判断
- 将原本 Markdown-centric 的 workflow artifacts 迁移为严格 YAML schema
- 允许脚本为 YAML schema enforcement 做必要调整

Skills 本身仍可以保持 `SKILL.md`，因为这是 Agent Skills 的包装格式要求。
需要变更的是 skill 中对 artifacts 的描述、生成规则和校验规则，而不是 skills
这个机制本身。

## 命名与目录约定

- 工作流目录从 `.spec-driven/` 改为 `.strict-spec-driven/`。
- 当前仓库优先把 `.strict-spec-driven/` 视为 active workflow state。
- `.spec-driven/` 保留为 bootstrap / migration input，不再作为 strict workflow target。
- spec workflow 技能和 slash commands 从 `spec-driven-*` 改为 `strict-spec-*`。
- roadmap workflow 技能和 slash commands 从 `roadmap-*` 改为 `strict-roadmap-*`。
- CLI entrypoint 和 subcommand 命名需要单独定义，不能和 skill/slash command 命名混用。

## 设计目标

- **结构严格**：规格、变更、路线图、问题、任务等文件应有明确 YAML schema。
- **可验证**：脚本必须能稳定检查必填字段、枚举值、引用关系和格式错误。
- **少靠文本约定**：避免通过 Markdown 标题、列表缩进或自由文本约定表达核心结构。
- **兼容工作流语义**：除非 YAML schema 需要，尽量不改变 `auto-spec-driven` 的流程含义。
- **便于 AI 使用**：YAML 文件应让 AI 更容易读取、定位和修改具体字段。

## Markdown 边界

本项目要求 workflow artifacts 使用 YAML。也就是说，`.strict-spec-driven/`
下由 workflow 生成和消费的 specs、changes、roadmap、tasks、questions、
indexes 等都应是 YAML。

仓库自带的 schema 和示例文件不是某个项目的 workflow state，统一放在
`templates/strict-spec-driven/schemas/` 和
`templates/strict-spec-driven/examples/`，供初始化、校验、迁移和测试复用。

以下 Markdown 文件可以作为明确例外：

- `SKILL.md`：Agent Skills 包装格式要求
- `README.md`、`AGENTS.md`、`RTK.md`：普通仓库文档和代理说明
- 其他非 workflow artifact 的项目文档，除非后续 schema 明确要求迁移

## 预期 Artifact 方向

原项目中的典型 Markdown 文件会逐步转为 YAML，例如：

| auto-spec-driven | strict-spec-driven 方向 |
| --- | --- |
| `proposal.md` | `proposal.yaml` |
| `design.md` | `design.yaml` |
| `tasks.md` | `tasks.yaml` |
| `questions.md` | `questions.yaml` |
| `specs/**/*.md` | `specs/**/*.yaml` |
| `roadmap/**/*.md` | `roadmap/**/*.yaml` |

具体 schema 需要通过后续 spec-driven change 明确后再实现。

## 技术栈

- **运行时 / 包管理器**：[Bun](https://bun.sh) — 用于安装依赖、构建和执行测试
- **语言**：TypeScript（strict 模式，ESM，NodeNext 模块解析）
- **构建**：`bun run build` → `tsc`，将 `src/` 编译到 `dist/`
- **测试**：`bun test/run.ts` — bun 原生执行 TypeScript 测试文件，测试对象为编译后的 `dist/` 输出

## YAML 工具链基线

- YAML 解析与序列化基础库：`js-yaml`
- Schema 校验基础库：`ajv` + `ajv-formats`
- 本阶段仅完成依赖选型与接入，不在此阶段实现完整的 YAML 校验层与 strict workflow 子命令迁移；相关实现在后续里程碑变更中推进。

## 仓库状态

仓库已经具备 self-hosted strict workflow state：

- `.strict-spec-driven/` 是当前优先使用的 strict workflow state
- `.spec-driven/` 仍保留为 bootstrap / legacy migration input，用于迁移、对照和历史记录
- 严格工作流的实现、测试和技能打包仍然围绕仓库内的 TypeScript、templates、scripts、skills 和 test 目录维护

已有文件：

- `package.json`：`strict-spec-driven` 包，`build` + `test` 脚本
- `tsconfig.json`：严格 TypeScript 配置，`src/` → `dist/`
- `src/strict-spec-cli.ts`：CLI 入口，命令路由骨架
- `test/run.ts`：测试套件，使用 pass/fail 计数模式
- `AGENTS.md`：代理入口，引用 `RTK.md`
- `RTK.md`：本仓库的 AI 工作说明
- `templates/strict-spec-driven/schemas/`：仓库内置 strict YAML schema 资产
- `templates/strict-spec-driven/examples/`：仓库内置 minimal valid YAML 示例资产
- `.strict-spec-driven/`：当前仓库的 self-hosted strict workflow state
- `.spec-driven/config.yaml`：项目上下文和通用规则
- `.spec-driven/specs/`：规格目录（含 `contracts/yaml-artifacts.md` 和 `cli/foundation.md`）
- `.spec-driven/roadmap/`：路线图目录
- `.spec-driven/changes/`：变更目录

## 当前工作流建议

- 规划路线图时，优先使用 `strict-roadmap-*` 技能和对应命令族。
- 执行 strict change 时，优先使用 `strict-spec-*` 技能和对应命令族。
- 需要查看或验证当前 strict workflow state 时，以 `.strict-spec-driven/` 为准。
- 只有在迁移、回溯 bootstrap 历史、或检查 legacy 输入兼容性时，才参考 `.spec-driven/`。

## 开发约定

- 修改前先对照 `../auto-spec-driven` 的对应技能、脚本和测试。
- 脚本应使用结构化 YAML parser，不应通过 ad hoc 字符串处理核心数据。
- schema 变化应先反映到 spec-driven artifacts，再修改实现。
- 一旦引入 TypeScript 源码，应建立 build/test 命令，并在修改脚本后运行验证。
