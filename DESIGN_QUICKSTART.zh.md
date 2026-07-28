# UI 设计系统快速入门

[English](DESIGN_QUICKSTART.md) | 中文

这份快速入门指南帮助你快速编写 UI 设计系统产物 (`.strict-spec-driven/design-system.yaml`)、验证代码实现与快照映射、渲染生成 `DESIGN.md`，并在 `strict-spec-cli` 项目中执行防漂移检查。

---

## 1. 前置条件与工作流检查

确认项目已初始化 strict 规范驱动工作流：

```sh
strict-spec-cli check-workflow-state
```

如果缺少 `.strict-spec-driven/` 目录，请先运行 `/strict-spec-init` 初始化。

> [!NOTE]
> 设计系统产物是可选的。没有用户界面的项目（例如后端服务、库、CLI 工具）不需要创建设计系统产物。

---

## 2. 查看设计系统 Schema 与示例

在编辑前了解要求的 YAML 结构：

```sh
# 查看设计系统产物的 JSON Schema
strict-spec-cli schema-show design-system

# 查看合法的设计系统 YAML 示例
strict-spec-cli sample-show design-system
```

---

## 3. 创建设计系统制品

`init` 刻意不会创建设计系统制品，因为大多数项目没有用户界面。确认项目确实有 UI 之后，显式创建它：

```sh
strict-spec-cli design-init
```

该命令写出一份 Schema 合法的骨架（Token 与组件集合为空），因此 `design-status` 立即可用，你编辑的是一个合法制品而不是从零拼装。如果制品已存在，命令报告 `skipped` 并保持文件字节不变 —— 绝不覆盖 —— 所以可以安全重复执行。

---

## 4. 编写 `.strict-spec-driven/design-system.yaml`

在骨架基础上填入 Design Tokens、组件映射和设计指南：

```yaml
schema: strict-spec-driven/design-system/v1
schema_version: 1
artifact_type: design_system
schema_file: templates/strict-spec-driven/schemas/design-system.yaml
design_system:
  id: app-design-system
  title: Application UI Design System
tokens:
  colors:
    primary: "#1A73E8"
    surface: "#FFFFFF"
    text: "#202124"
  typography:
    body:
      fontFamily: Inter, system-ui, sans-serif
      fontSize: 16px
      fontWeight: 400
      lineHeight: 1.5
    heading:
      fontFamily: Inter, system-ui, sans-serif
      fontSize: 28px
      fontWeight: 600
      lineHeight: 1.25
  layout:
    sm: 8px
    md: 16px
    lg: 24px
  elevation:
    card: 0 1px 3px rgba(0, 0, 0, 0.12)
  shapes:
    rounded: 8px
components:
  primary-button:
    title: Primary Button
    description: Primary action button across the user interface.
    tokens:
      backgroundColor: colors.primary
      textColor: colors.surface
      padding: layout.md
      rounded: shapes.rounded
    mapping:
      implementation:
        - src/components/button.tsx
      snapshots:
        - test/snapshots/button.png
guidance:
  overview: >-
    Clean, modern visual identity favoring accessible contrast and consistent spatial rhythm.
  do:
    - Use declared color tokens for all visual elements.
  dont:
    - Do not introduce ad-hoc hex colors in component styles.
```

### 职责边界说明

- **设计系统产物 (`design-system.yaml`)**：视觉标识（Tokens、组件映射、视觉原则指南）。
- **主规范 (`.strict-spec-driven/specs/`)**：可观察的 UI 行为（状态、加载/错误处理、交互流程）。
- **`ui` 类别技术标准 (`.strict-spec-driven/tech/`)**：UI 工程规范（样式约定、国际化、无障碍基线）。

---

## 5. 检查状态与代码/快照映射漂移

校验 Schema 正确性并检查组件映射的代码与视觉快照路径：

```sh
strict-spec-cli design-status
```

`design-status` 输出包括：
- Schema 校验状态与诊断信息。
- Token 分组、已声明 Token 及组件的总数统计。
- 过期或缺失的代码实现路径与视觉回归快照路径 (`mappingDrift`)。

---

## 6. 渲染生成 `DESIGN.md`

在项目根目录（或指定输出路径）生成 `DESIGN.md` 文档：

```sh
# 渲染到根目录 DESIGN.md
strict-spec-cli design-generate

# 渲染到指定路径
strict-spec-cli design-generate --output docs/DESIGN.md
```

---

## 7. 执行防漂移检查

使用 `--check` 模式校验 `DESIGN.md` 是否与 YAML 源保持最新一致（不写入文件）：

```sh
strict-spec-cli design-generate --check
```

- 如果 `DESIGN.md` 为最新状态，退出码为 `0`。
- 如果 `DESIGN.md` 过期或缺失，退出码为 `1` 并列出过期的源文件。

如果希望它被周期性检查而不是手动执行，在 `.strict-spec-driven/config.yaml` 中声明为维护检查：

```yaml
maintenance:
  checks:
    - type: generated-doc-check
```

之后 `strict-spec-cli maintenance` 会把过期的 `DESIGN.md`（以及 `ARCHITECTURE.md`）报告为 finding，指出过期的源制品和重新渲染的命令，并 seed 一个维护变更作为记录。它绝不会自行重新渲染文档，对你尚未渲染过的文档也保持沉默。

---

## 8. 让制品与代码保持一致

`--check` 和 `generated-doc-check` 比较的是 `DESIGN.md` 与 `design-system.yaml`。两者都无法发现**制品本身**已经落后于界面代码 —— 比如某个组件被删除，或者色板被重新调整。`design-status` 只能发现已不存在的映射路径。

这种情况请使用 `/strict-spec-design-sync`：它扫描样式表、主题文件与 UI 源码，报告代码与已记录识别体系之间的每一处分歧，在你逐条确认后同步制品，并重新渲染文档。

---

## 命令汇总表

| 命令 | 说明 |
| :--- | :--- |
| `strict-spec-cli design-init` | 从内置骨架创建 `design-system.yaml`，已存在则跳过 |
| `strict-spec-cli design-status` | 校验 `design-system.yaml` 并检查代码/快照映射漂移 |
| `strict-spec-cli design-generate` | 从 `design-system.yaml` 渲染生成 `DESIGN.md` |
| `strict-spec-cli design-generate --check` | 检查 `DESIGN.md` 是否为最新状态（不写入文件） |
| `strict-spec-cli schema-show design-system` | 显示设计系统的 JSON Schema |
| `strict-spec-cli sample-show design-system` | 显示设计系统的 YAML 示例文件 |
| `strict-spec-cli maintenance` | 配置了 `generated-doc-check` 时，报告过期的 `DESIGN.md` |

## 相关技能

| 技能 | 用途 |
| :--- | :--- |
| `/strict-spec-design` | 编写或刷新设计系统制品，并渲染 `DESIGN.md` |
| `/strict-spec-design-sync` | 将制品与已变更的 UI 代码对账同步 |
