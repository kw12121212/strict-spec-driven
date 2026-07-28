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

## 3. 编写 `.strict-spec-driven/design-system.yaml`

创建或编辑 `.strict-spec-driven/design-system.yaml` 来记录 Design Tokens、组件映射和设计指南：

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

## 4. 检查状态与代码/快照映射漂移

校验 Schema 正确性并检查组件映射的代码与视觉快照路径：

```sh
strict-spec-cli design-status
```

`design-status` 输出包括：
- Schema 校验状态与诊断信息。
- Token 分组、已声明 Token 及组件的总数统计。
- 过期或缺失的代码实现路径与视觉回归快照路径 (`mappingDrift`)。

---

## 5. 渲染生成 `DESIGN.md`

在项目根目录（或指定输出路径）生成 `DESIGN.md` 文档：

```sh
# 渲染到根目录 DESIGN.md
strict-spec-cli design-generate

# 渲染到指定路径
strict-spec-cli design-generate --output docs/DESIGN.md
```

---

## 6. 在 CI / 自动化中执行防漂移检查

使用 `--check` 模式校验 `DESIGN.md` 是否与 YAML 源保持最新一致（不写入文件）：

```sh
strict-spec-cli design-generate --check
```

- 如果 `DESIGN.md` 为最新状态，退出码为 `0`。
- 如果 `DESIGN.md` 过期或缺失，退出码为 `1` 并列出过期的源文件。

---

## 命令汇总表

| 命令 | 说明 |
| :--- | :--- |
| `strict-spec-cli design-status` | 校验 `design-system.yaml` 并检查代码/快照映射漂移 |
| `strict-spec-cli design-generate` | 从 `design-system.yaml` 渲染生成 `DESIGN.md` |
| `strict-spec-cli design-generate --check` | 检查 `DESIGN.md` 是否为最新状态（不写入文件） |
| `strict-spec-cli schema-show design-system` | 显示设计系统的 JSON Schema |
| `strict-spec-cli sample-show design-system` | 显示设计系统的 YAML 示例文件 |
