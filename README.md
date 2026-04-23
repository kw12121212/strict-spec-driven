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

## 仓库状态

当前仓库已初始化 `.spec-driven/`，但还没有实现代码、构建脚本或测试套件。

已有文件：

- `AGENTS.md`：代理入口，引用 `RTK.md`
- `RTK.md`：本仓库的 AI 工作说明
- `.spec-driven/config.yaml`：项目上下文和通用规则
- `.spec-driven/specs/`：规格目录 scaffold
- `.spec-driven/roadmap/`：路线图目录 scaffold
- `.spec-driven/changes/`：变更目录 scaffold

## 后续建议

建议先用 roadmap 或 proposal 明确 YAML schema 迁移的第一阶段，例如：

```text
/roadmap-plan
```

或直接创建第一个变更：

```text
/spec-driven-propose define yaml artifact schemas
```

第一阶段可以优先定义：

- main specs YAML schema
- change artifacts YAML schema
- roadmap milestone YAML schema
- YAML validation rules
- 从 `.spec-driven/**` workflow Markdown artifacts 到 `.strict-spec-driven/**` YAML artifacts 的迁移策略

## 开发约定

- 修改前先对照 `../auto-spec-driven` 的对应技能、脚本和测试。
- 脚本应使用结构化 YAML parser，不应通过 ad hoc 字符串处理核心数据。
- schema 变化应先反映到 spec-driven artifacts，再修改实现。
- 一旦引入 TypeScript 源码，应建立 build/test 命令，并在修改脚本后运行验证。
