# 快速入门：strict-spec-driven

[English](QUICKSTART.md) | 中文

本指南将引导你从头安装严格工作流 Skills 并运行第一个完整的变更生命周期。

## 前置条件

- [Bun](https://bun.sh) — 运行时、包管理器和测试运行器
- Node.js（含 `npx`）— Agent Skills 安装程序所需

验证两者均可用：

```sh
bun --version
node --version
```

## 安装严格 Skills

克隆本仓库，然后注册严格 Skill 包，使 Claude Code 可以调用它们：

**全局安装**（在所有项目中可用）：
```sh
bash install.sh
```

该命令使用 `npx skills add <repo-dir>` 就地注册 Skill 包。源仓库必须保留在已注册的路径——安装不会复制文件。

**卸载：**
```sh
bash install.sh --uninstall
```

### 验证安装

安装后，严格 Skills 应在 Claude Code 中可用。你也可以直接验证 Skill 打包：

```sh
bun run build
bun run validate-skills
```

`validate-skills` 报告任何打包问题（缺失元数据、过时的命令引用、损坏的符号链接）。

## 配置 MCP 服务器

构建本仓库后，MCP 兼容客户端可以使用本地 stdio 服务器。配置客户端时需指定明确的项目根目录：

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

启动服务器之前必须先有构建输出：

```sh
bun run build
```

MCP 客户端的示例用户请求：
- "检查此项目是否有严格工作流状态。" 预期工具：`check_workflow_state`。
- "读取变更 `my-change` 的提案。" 预期资源：`strict://changes/my-change/proposal`。
- "引导我审查 `my-change`。" 预期提示：`strict_review_change`，参数为 `{ "change": "my-change" }`。
- "归档 `my-change`。" 预期工具：`archive_change`，由于属于发布类操作且会变更工作流状态，需在宿主确认后执行。

MCP 服务器不替代 CLI 或 Skills。只读工具报告诊断信息而不修改文件。变更性工具如 `propose_change`、`mark_next_task_complete`、`roadmap_sync`、`harness_start` 和 `archive_change` 应由 MCP 宿主在执行前展示为写入、生命周期或发布类操作。

## 初始化新项目

导航到要使用严格工作流的项目目录，然后初始化 `.strict-spec-driven/` 脚手架：

**通过 Claude Code 斜杠命令：**
```
/strict-spec-init
```

**或直接通过 CLI：**
```sh
node /path/to/strict-spec-driven/dist/strict-spec-cli.js init
```

这将创建：
- `.strict-spec-driven/config.yaml` — 项目上下文和规则
- `.strict-spec-driven/specs/INDEX.yaml` — 规范索引
- `.strict-spec-driven/roadmap/INDEX.yaml` — 路线图索引
- `.strict-spec-driven/changes/` — 活跃和已归档变更目录

如果已存在 `.spec-driven/` 引导目录，`init` 会发出警告并继续。使用 `/strict-spec-migrate` 将引导制品转换为严格 YAML。

## 第一个变更生命周期

### 1. 提议变更

为变更选择一个 kebab-case 名称，然后创建其规划制品脚手架：

**通过 Claude Code：**
```
/strict-spec-propose my-first-change
```

**通过 CLI：**
```sh
node dist/strict-spec-cli.js propose my-first-change
```

这将在 `.strict-spec-driven/changes/my-first-change/` 创建：
- `proposal.yaml` — 是什么以及为什么
- `design.yaml` — 方案和关键决策
- `tasks.yaml` — 实现和测试任务
- `questions.yaml` — 由 `/strict-spec-auto` 或 `/strict-spec-apply`
  在实现前显式提出并解决的开放性问题
- `specs/` — 可观测行为变化的增量规范文件

在进入执行步骤之前，编辑这些文件以描述变更内容。

### 2. 实现任务

逐一处理 `tasks.yaml` 中的每个待处理任务。默认下一步是
`/strict-spec-auto` 跑完整生命周期；如果你想手动控制，再使用
`/strict-spec-apply` 逐个任务推进：

```
/strict-spec-auto
```

或者：

```
/strict-spec-apply my-first-change
```

每次任务调用读取下一个待处理任务，实现它，将其标记为完成，并验证未变更的行为保持完整。

也可以通过 CLI 检查任务状态：
```sh
node dist/strict-spec-cli.js apply my-first-change
```

### 3. 验证变更

所有任务完成后，运行验证：

```
/strict-spec-verify my-first-change
```

验证检查：
- 所有任务均为 `status: complete`
- `questions.yaml` 中无开放性问题
- 所有规划制品通过严格 YAML 模式验证
- `specs/` 中的增量规范通过增量规范模式验证
- 没有两个活跃变更以冲突的修改方式针对同一需求 ID

### 4. 归档变更

验证通过后，归档变更以将其增量规范合并到主严格规范中：

```
/strict-spec-archive my-first-change
```

归档操作：
- 将增量规范合并到 `.strict-spec-driven/specs/` 主规范文件
- 将变更目录移至 `.strict-spec-driven/changes/archive/YYYY-MM-DD-my-first-change/`
- 重新生成严格规范索引

### 5. 发布变更（可选）

为已归档的变更创建一个专注的 git 提交：

```
/strict-spec-ship my-first-change
```

Ship Skill 读取已归档的变更摘要，构建提交信息，并将 `git push` 交给你明确确认。

## 自动化端到端生命周期

对于范围已经明确的变更，`/strict-spec-auto` 自动运行完整生命周期——提议、执行、验证、审查、归档：

```
/strict-spec-auto
```

仅当开放性问题需要用户输入或遇到不可恢复的错误时，该 Skill 才会暂停。

## Harness (可选)

如果你的项目有本地服务、生产环境可观测性或结构化调查，可以在一个 harness 中声明它们：

1. 运行 `/strict-spec-harness-init` 从项目上下文中脚手架化（scaffold）或完善 `.strict-spec-driven/harness.yaml`，或者手动编辑该文件。
2. 运行空转规划（dry plan）并生成脚本：
   ```sh
   node dist/strict-spec-cli.js harness-plan --environment development
   node dist/strict-spec-cli.js harness-scripts generate
   ```
3. 使用 `scripts/harness-start`、`scripts/harness-status`、`scripts/harness-logs` 和 `scripts/harness-stop` 来操作声明的组件。

当某个 Bug 需要结构化证据时，创建一个 harness 会话：

```sh
node dist/strict-spec-cli.js harness-session create checkout-investigation
```

使用 `/strict-spec-harness-session` 来引导调查。该工作流会记录选定的环境/组件、生命周期证据、重现步骤、证据文件、假设、发现、人工检查点、手动操作、重放/重现命令以及验证状态，且不会存储敏感值。

参见 [HARNESS.zh.md](HARNESS.zh.md) 了解完整参考。

## 从引导状态迁移

如果你的项目使用旧版 `.spec-driven/` Markdown 工作流，将其迁移到严格 YAML：

```
/strict-spec-migrate
```

迁移将支持的旧版规范、变更和路线图制品转换为 `.strict-spec-driven/` YAML 格式。不支持或模糊的格式会作为手动跟进事项报告。源 `.spec-driven/` 目录不会被修改。
