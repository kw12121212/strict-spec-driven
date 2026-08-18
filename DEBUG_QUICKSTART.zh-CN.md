# 调试与开发会话快速入门

[English](DEBUG_QUICKSTART.md) | 中文

这是一份精简的入门指南，介绍如何在 strict-spec-cli 项目中搭建本地服务并运行
结构化的调试调查。开发会话与调试会话已统一到 harness 工作流：环境与组件用一份
声明描述，每次调查对应一个会话制品。

会话与声明的 YAML 由 CLI 负责：AI 工作流通过 `harness-edit` 和
`harness-session` 的命名参数编写每一个字段，绝不书写 YAML 文本。下文的 YAML
片段展示的是 CLI 产出的结果，仅作只读参考。运行
`strict-spec-cli yaml-authoring-protocol` 查看通用编写协议，用
`<command> --help --json` 查看各所属命令的参数契约，用
`schema-show harness` / `schema-show harness-session` 及对应的 `sample-show`
键查看各制品的契约。声明的 `schema_file` 路径在共享 schema 缓存根目录
`~/.strict-spec-schemas/`（或 `STRICT_SPEC_SCHEMA_CACHE_DIR`）下解析。

---

## 1. 初始化项目

```sh
strict-spec-cli init
```

这会创建 `.strict-spec-driven/`。重复运行是安全的——不会覆盖已有声明。

---

## 2. 声明你的 Harness

从仓库上下文起草声明，然后完善它：

```sh
strict-spec-cli harness-infer --write
strict-spec-cli harness-doctor
```

每个字段都通过命名参数设置：

```sh
strict-spec-cli harness-infer --write
strict-spec-cli harness-edit --component-environment development --component web \
  --component-type frontend --working-directory . --port 3000
```

人类仍可在 AI 工作流之外手工维护 `.strict-spec-driven/harness.yaml`。 <!-- human-manual-edit -->

你至少需要一个带启动操作和就绪检查的组件。CLI 产出的声明如下所示：

```yaml
components:
  web:
    type: frontend
    working_directory: "."
    readiness:
      type: http
      url: "http://127.0.0.1:3000/health"
      timeout_seconds: 60
      interval_seconds: 2
```

继续之前先验证声明：

```sh
strict-spec-cli harness-doctor
strict-spec-cli harness-plan --environment development
```

---

## 3. 启动组件

```sh
strict-spec-cli harness-start --environment development
```

这会按依赖顺序启动声明的组件，等待就绪，并记录运行时状态。随时检查状态和日志：

```sh
strict-spec-cli harness-status
strict-spec-cli harness-logs web
```

完成后停止：

```sh
strict-spec-cli harness-stop
```

---

## 4. 创建 Harness 会话

出现问题时，启动结构化调查：

```sh
strict-spec-cli harness-session create my-bug
```

这会创建 `.strict-spec-driven/harness-sessions/my-bug/`，包含会话制品和证据目录。
`harness-session validate` 与 `harness-session archive` 收尾整个生命周期：

```sh
strict-spec-cli harness-session validate my-bug
```

---

## 5. 记录调查过程

会话的每个字段都通过 `harness-session edit` 的命名参数写入。

### 描述问题

```sh
strict-spec-cli harness-session edit my-bug \
  --issue-summary "结账页面点击按钮无反应。" \
  --observed-behavior "没有发出网络请求。" \
  --expected-behavior "应发出 POST /checkout 请求。"
```

### 记录重现步骤

```sh
strict-spec-cli harness-session edit my-bug \
  --precondition "应用正在运行且用户已登录。" \
  --step click-button --step-target web \
  --step-action "点击结账按钮。" \
  --step-expected "出现网络请求或校验错误。"
```

### 捕获证据

将文件保存到会话的证据目录，然后注册它们：

```sh
strict-spec-cli harness-session edit my-bug \
  --evidence before-click --evidence-kind screenshot \
  --evidence-path evidence/before-click.png \
  --evidence-description "点击结账前的页面状态。"
```

### 记录假设与发现

```sh
strict-spec-cli harness-session edit my-bug \
  --hypothesis handler-missing \
  --hypothesis-statement "点击处理器未被挂载。" \
  --hypothesis-status open --hypothesis-evidence before-click

strict-spec-cli harness-session edit my-bug \
  --finding handler-detached \
  --finding-summary "React 重新渲染移除了事件监听器。" \
  --finding-target web --finding-status confirmed \
  --finding-evidence before-click
```

会话通过 `scripts/harness-*` 包装脚本记录生命周期证据——不会重复服务配置，
也不会存储敏感值。

---

## 6. 人工检查点

当需要凭证、2FA、OAuth 授权或支付确认时：

```sh
strict-spec-cli harness-session edit my-bug \
  --checkpoint sign-in \
  --checkpoint-reason "结账需要身份认证。" \
  --checkpoint-action "在准备好的浏览器窗口中直接登录。" \
  --checkpoint-sensitive true --checkpoint-status pending \
  --checkpoint-resume "登录后可见结账表单。"

strict-spec-cli harness-session edit my-bug \
  --manual-action human-login --manual-actor human \
  --manual-summary "人工直接输入凭证；不记录任何值。" \
  --manual-status completed
```

**绝不**要求人在聊天中透露密码、令牌或机密。只记录语义化的操作和完成后的
可观测状态。证据条目和手动操作保持 `contains_secrets: false` 和
`secrets_recorded: false`。

---

## 7. 验证并关闭

记录重放命令，让另一位操作者可以从零重现，然后设置验证状态：

```sh
strict-spec-cli harness-session edit my-bug \
  --replay-command "npm test -- checkout" \
  --verification-step repeat-click \
  --step-action "修复后再次点击结账按钮。" \
  --step-expected "出现网络请求或校验错误。" \
  --verification-status passed --verification-evidence after-fix-screenshot
```

验证完成的制品，然后归档状态为 `resolved` 或 `blocked` 的会话：

```sh
strict-spec-cli harness-session validate my-bug
strict-spec-cli harness-session archive my-bug
```

---

## 8. 典型工作流总结

```
init ──► harness-plan ──► harness-start
                               │
                     harness-session create
                               │
                       重现 / 捕获证据
                               │
                        假设与发现
                               │
                    人工检查点（如需要）
                               │
              harness-session validate / archive
                               │
                         harness-stop
```

---

## 命令参考

| 命令 | 用途 |
|---|---|
| `strict-spec-cli init` | 创建 `.strict-spec-driven/` 脚手架 |
| `harness-infer [--write]` | 从仓库元数据起草声明 |
| `harness-edit` | 通过命名参数更新声明 |
| `harness-doctor` | 诊断声明、包装脚本、环境和安全问题 |
| `harness-plan` | 验证声明并进行空转规划 |
| `harness-start` | 带就绪检查启动声明的组件 |
| `harness-status` | 报告受管组件的生命周期状态 |
| `harness-logs <id>` | 打印捕获的组件日志输出 |
| `harness-stop` | 停止受管组件并清理运行时状态 |
| `harness-session create <id>` | 创建会话制品和证据目录 |
| `harness-session edit <id>` | 通过命名参数记录会话字段 |
| `harness-session validate <id>` | 按 schema 验证会话 YAML |
| `harness-session archive <id>` | 归档已解决或被阻塞的会话 |

完整参考见 [HARNESS.zh.md](HARNESS.zh.md)。
