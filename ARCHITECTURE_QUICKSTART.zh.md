# 架构文档快速入门 (Architecture Quickstart)

[English](ARCHITECTURE_QUICKSTART.md) | 中文

本指南提供在 `strict-spec-cli` 项目中撰写架构元数据（`.strict-spec-driven/architecture.yaml`）、校验代码映射漂移、渲染 `ARCHITECTURE.md` 及执行防漂移检查的快速入门说明。

---

## 1. 工作流状态检查

确保项目已初始化严格规范驱动工作流：

```sh
strict-spec-cli check-workflow-state
```

如果缺少 `.strict-spec-driven/` 目录，请先运行 `/strict-spec-init` 初始化项目。

---

## 2. 查看架构 Schema 与示例

在撰写架构文件前，可先查阅定义的结构规范与示例：

```sh
# 查看架构 YAML 的 Schema 定义
strict-spec-cli schema-show architecture

# 查看标准的架构 YAML 示例
strict-spec-cli sample-show architecture
```

---

## 3. 撰写 `.strict-spec-driven/architecture.yaml`

创建或编辑 `.strict-spec-driven/architecture.yaml`，填入组件（components）、数据流（data_flows）和架构决策（decisions）：

```yaml
version: 1
components:
  cli:
    responsibility: 解析命令行参数并路由到对应的子处理器。
    boundaries: 明确不直接包含领域渲染与文件写入逻辑。
    dependencies:
      - design-renderer
    implementation:
      - src/cli/cmd-design.ts
      - src/cli/entrypoint.ts

data_flows:
  render_design_doc:
    trigger: 用户运行 `strict-spec-cli architecture-generate`
    steps:
      - 读取 architecture.yaml、规范索引及技术标准
      - 将组件、数据流、决策、规范与技术标准聚合渲染为 Markdown
      - 写入目标文件到磁盘
    components:
      - cli
      - design-renderer

decisions:
  single_source_of_truth:
    decision: ARCHITECTURE.md 完全由 YAML 自动生成，严禁手动编辑。
    rationale: 手动编辑容易导致文档与代码脱节，通过单一真理源自动渲染可保持强一致性。
    rejected_alternatives:
      - 手动维护 Markdown 文档及独立的架构图。
    status: accepted
```

---

## 4. 检查状态与代码映射漂移

验证架构文件的语法规范，并检测引用的代码实现路径是否真实存在：

```sh
strict-spec-cli architecture-status
```

`architecture-status` 将输出：
- Schema 校验诊断信息；
- 组件、数据流和架构决策的统计数量；
- 代码路径漂移报告（`mappingDrift`，即引用的源码路径不存在或已失效）。

---

## 5. 渲染生成 `ARCHITECTURE.md`

在项目根目录生成 `ARCHITECTURE.md`（或生成到指定的自定义路径）：

```sh
# 默认生成到根目录 ARCHITECTURE.md
strict-spec-cli architecture-generate

# 生成到自定义路径
strict-spec-cli architecture-generate --output docs/ARCHITECTURE.md
```

---

## 6. 在 CI / 自动化中校验防漂移

使用 `--check` 选项可以在不修改任何文件的情况下，比对磁盘上的 `ARCHITECTURE.md` 是否与 YAML 源文件一致：

```sh
strict-spec-cli architecture-generate --check
```

- 若 `ARCHITECTURE.md` 为最新状态，退出码为 `0`；
- 若 `ARCHITECTURE.md` 已过期或缺失，退出码为 `1`，并指出具体过期的源文件。

---

## 核心 CLI 命令汇总

| 命令 | 说明 |
| :--- | :--- |
| `strict-spec-cli architecture-status` | 校验 `architecture.yaml` 合法性并报告代码路径漂移 |
| `strict-spec-cli architecture-generate` | 根据架构文件、规范索引和技术标准渲染 `ARCHITECTURE.md` |
| `strict-spec-cli architecture-generate --check` | 检查 `ARCHITECTURE.md` 是否为最新状态（不写入文件） |
| `strict-spec-cli schema-show architecture` | 查看架构 YAML 的 Schema 定义 |
| `strict-spec-cli sample-show architecture` | 查看架构 YAML 示例 |
