# strict-spec-driven

[English](README.md) | 中文

`strict-spec-driven` 是一个 YAML 优先的规范驱动开发工作流。它提供规范驱动生命周期（提议 → 执行 → 验证 → 审查 → 归档）和 Agent Skills 集成，将所有工作流制品——规范、变更、路线图、任务、问题——转换为严格 YAML 模式，由确定性脚本强制执行。

`SKILL.md` 文件保留为 Markdown，因为这是 Agent Skills 打包格式的要求。变化的是这些 Skills 生成和消费的制品格式。

## 目录结构

| 目录 | 用途 |
|---|---|
| `.strict-spec-driven/` | 活跃的严格工作流状态 |
| `.strict-spec-driven/changes/` | 活跃的变更目录 |
| `.strict-spec-driven/changes/archive/` | 已归档的变更 |
| `.strict-spec-driven/roadmap/` | 严格 YAML 路线图制品 |
| `.strict-spec-driven/specs/` | 严格 YAML 主规范文件 |
| `.spec-driven/` | 仅用于引导和迁移输入 |
| `templates/strict-spec-driven/schemas/` | 捆绑的严格 YAML 模式文件 |
| `templates/strict-spec-driven/examples/` | 捆绑的最小有效 YAML 示例 |
| `templates/strict-spec-driven/scaffold/` | `init` 和 `propose` 使用的脚手架模板 |
| `skills/` | 严格 Skill 包（`strict-spec-*` 和 `strict-roadmap-*`） |
| `src/` | TypeScript CLI 源码 |
| `dist/` | 编译输出（由构建生成） |

`.spec-driven/` 保留为引导和迁移输入，不是严格迁移后的活跃工作流目录。不要将 `.spec-driven/` 和 `.strict-spec-driven/` 视为等价的活跃目标；一旦 `.strict-spec-driven/roadmap/` 存在，也不要再把 `.spec-driven/roadmap/` 视为规范路线图来源。

## 严格命令接口

### CLI：`strict-spec-driven`

在 `bun run build` 之后（或通过已安装的 `node dist/strict-spec-cli.js`）可用的子命令：

| 子命令 | 用途 |
|---|---|
| `init` | 在项目中创建 `.strict-spec-driven/` 脚手架 |
| `propose <name>` | 创建新的严格变更脚手架 |
| `apply <name>` | 完成变更中的下一个待处理任务 |
| `verify <name>` | 验证变更的制品和任务完成情况 |
| `review <name>` | 对变更进行建议性代码质量审查 |
| `archive <name>` | 合并增量规范并将变更移入归档 |
| `ship <name>` | 读取已归档变更摘要以进行 git 提交交接 |
| `migrate` | 将 `.spec-driven/` 引导状态转换为 `.strict-spec-driven/` |
| `list` | 报告活跃和已归档的变更 |
| `modify [<name>]` | 列出变更的可编辑制品路径 |
| `cancel <name>` | 删除活跃变更（已归档变更受保护） |
| `maintenance` | 运行已配置的仓库维护检查 |
| `roadmap-status` | 验证并报告严格路线图状态 |
| `roadmap-sync` | 协调并重新生成严格路线图索引 |
| `validate-skills` | 验证严格 Skill 打包元数据和符号链接 |
| `verify-spec-mappings` | 审计规范实现和测试映射覆盖率 |

### Skills：`strict-spec-*` 和 `strict-roadmap-*`

Skills 是通过 `install.sh` 安装的 Agent Skills 包。在 Claude Code 中使用斜杠命令名称调用它们：

**严格规范工作流 Skills**（`strict-spec-*`）：

| 斜杠命令 | 用途 |
|---|---|
| `/strict-spec-init` | 在项目中初始化严格工作流 |
| `/strict-spec-propose` | 提议新变更 |
| `/strict-spec-apply` | 实现变更中的任务 |
| `/strict-spec-verify` | 验证变更是否完成 |
| `/strict-spec-review` | 对变更进行代码质量审查 |
| `/strict-spec-archive` | 归档已完成的变更 |
| `/strict-spec-auto` | 端到端自动化变更生命周期 |
| `/strict-spec-ship` | 通过 git 提交发布已归档的变更 |
| `/strict-spec-migrate` | 将引导状态迁移到严格 YAML |
| `/strict-spec-brainstorm` | 在提议前对变更想法进行头脑风暴 |
| `/strict-spec-modify` | 修改现有变更的制品 |
| `/strict-spec-cancel` | 取消活跃变更 |
| `/strict-spec-simple-task` | 不走完整生命周期的轻量级临时任务 |
| `/strict-spec-spec-edit` | 直接编辑主规范文件 |
| `/strict-spec-sync-specs` | 与代码漂移同步规范 |
| `/strict-spec-resync-code-mapping` | 修复规范实现和测试映射 |
| `/strict-spec-maintenance` | 运行仓库维护工作流 |

**严格路线图 Skills**（`strict-roadmap-*`）：

| 斜杠命令 | 用途 |
|---|---|
| `/strict-roadmap-recommend` | 从路线图推荐下一个计划变更 |
| `/strict-roadmap-propose` | 将路线图计划变更转换为变更脚手架 |
| `/strict-roadmap-milestone` | 完善路线图里程碑 |
| `/strict-roadmap-plan` | 创建或重构路线图 |
| `/strict-roadmap-sync` | 协调路线图里程碑和变更状态 |

## 模式和示例资源

捆绑的严格 YAML 模式文件位于 `templates/strict-spec-driven/schemas/`。捆绑的最小有效示例位于 `templates/strict-spec-driven/examples/`。这些与 `.strict-spec-driven/` 工作流状态分离——它们是验证器、生成器和测试使用的共享参考资源。

`templates/strict-spec-driven/schemas/schema-registry.yaml` 中的模式注册表索引了所有支持的严格制品族。

## 迁移边界

`migrate` 子命令和 `/strict-spec-migrate` Skill 将支持的旧版 `.spec-driven/` Markdown 制品转换为 `.strict-spec-driven/` YAML 制品。源 `.spec-driven/` 目录不会被修改。不支持或模糊的旧版格式会在迁移报告中作为手动跟进事项报告。

迁移后，`.strict-spec-driven/` 是活跃的工作流状态。`.spec-driven/` 保留为引导或旧版历史，不作为有效的严格工作流目标处理。

## 自托管状态

本仓库自托管于严格工作流之上。`.strict-spec-driven/` 包含活跃的严格规范、路线图和变更历史。`.spec-driven/` 保留为引导迁移输入。

## 开发

**前置条件：** [Bun](https://bun.sh)（运行时和包管理器），Node.js（用于 `npx`）

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
验证所有严格 Skill 包的元数据、命令引用和符号链接布局。

**约定：**
- 使用结构化 YAML 解析器——核心制品数据绝不使用临时字符串处理。
- 规范变更应在实现之前反映在 `.strict-spec-driven/specs/` 中。
- 任何源码变更后运行 `bun run build && bun test/run.ts`。
- 修改前先阅读现有代码；只实现当前任务所需的内容。
