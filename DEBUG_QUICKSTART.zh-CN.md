# 调试与开发会话快速入门

[English](DEBUG_QUICKSTART.md) | 中文

一份精简的入门指南，用于在 strict-spec-driven 项目中搭建本地服务并执行结构化调试调查。

---

## 1. 初始化项目

```sh
strict-spec-driven init
```

此命令会创建 `.strict-spec-driven/` 目录及开发会话脚手架。如果目录已存在，重复运行是安全的——它不会覆盖已有的声明文件。

---

## 2. 声明开发会话

编辑 `.strict-spec-driven/dev-session.yaml`，或者让技能自动准备：

```
/strict-spec-dev-session-init
```

该技能会读取你的仓库上下文，自动填充启动命令、端口、就绪检测和浏览器目标。

你至少需要一个服务，包含启动命令和就绪探针：

```yaml
session:
  services:
    web:
      command: npm run dev
      working_directory: "."
      readiness:
        type: http
        url: "http://127.0.0.1:3000/health"
        timeout_seconds: 60
        interval_seconds: 2
```

继续之前先验证声明：

```sh
strict-spec-driven dev-session-plan
```

---

## 3. 启动服务

```sh
strict-spec-driven dev-session-start
```

此命令按声明顺序启动服务、等待就绪，并将 PID 记录到
`.strict-spec-driven/.runtime/dev-session/` 下。

随时检查状态：

```sh
strict-spec-driven dev-session-status
strict-spec-driven dev-session-logs web
```

完成后停止：

```sh
strict-spec-driven dev-session-stop
```

为方便起见，可以直接使用生命周期 CLI 命令：

```
node dist/strict-spec-cli.js dev-session-start
node dist/strict-spec-cli.js dev-session-stop
```

---

## 4. 创建调试会话

当出现问题时，启动一次结构化调查：

```sh
strict-spec-driven debug-session-create my-bug
```

此命令会创建 `.strict-spec-driven/debug-sessions/my-bug/session.yaml` 和
`evidence/` 目录。

也可以使用引导式技能：

```
/strict-spec-debug-session
```

该技能会引导你走完整个调查生命周期。

---

## 5. 填写调查内容

打开生成的 `session.yaml`，完成以下部分：

### 描述问题

```yaml
issue:
  summary: 结账页面按钮点击无反应。
  observed_behavior: 没有发出任何网络请求。
  expected_behavior: 应发送 POST /checkout 请求。
```

### 分类目标层级

| 层级 | 适用场景 |
|---|---|
| `web_api` | API 请求、响应、状态码 |
| `frontend` | DOM 状态、控制台输出、渲染 |
| `electron` | Electron 窗口、webview、壳层行为 |
| `cdp_access` | CDP 端点、目标发现、连接失败 |

### 编写复现步骤

```yaml
reproduction:
  preconditions:
    - 应用已运行且用户已登录。
  steps:
    - id: click-button
      target: checkout-page
      action: 点击结账按钮。
      expected: 出现网络请求或验证错误提示。
  expected_failure: 没有网络请求，也没有可见的错误提示。
```

### 捕获证据

将文件保存到 `evidence/` 目录下并引用：

```yaml
evidence:
  entries:
    - id: before-click
      type: screenshot
      path: evidence/before-click.png
      layer: frontend
      target: checkout-page
      description: 点击结账前的页面状态。
      redacted: true
```

### 记录假设与发现

```yaml
hypotheses:
  - id: handler-missing
    statement: 点击事件处理器未绑定。
    layer: frontend
    status: open
    evidence:
      - before-click

findings:
  - id: handler-detached
    summary: React 重渲染移除了事件监听器。
    layer: frontend
    target: checkout-page
    status: confirmed
    evidence:
      - before-click
```

### 关联开发会话生命周期

如果调试会话需要本地服务：

```yaml
dev_session:
  declaration: .strict-spec-driven/dev-session.yaml
  session_id: local-web-app
  services:
    - web
  lifecycle:
    plan:
      command: strict-spec-driven dev-session-plan
      status: passed
      evidence: [dev-session-plan]
    start:
      command: strict-spec-driven dev-session-start
      status: passed
      evidence: [dev-session-start]
    stop:
      command: strict-spec-driven dev-session-stop
      status: not_run
      evidence: []
    cleanup_status: pending
  unavailable_conditions: []
```

调试会话仅记录生命周期证据——它不会复制服务配置或密钥值。

---

## 6. 人工检查点

当需要凭据、2FA、OAuth 授权或支付确认时：

```yaml
human_checkpoints:
  - id: sign-in
    reason: 结账功能需要身份认证。
    requested_action: 在已准备好的浏览器窗口中直接登录。
    sensitive: true
    status: pending
    resume_condition: 登录后结账表单可见。
    evidence_before: [before-click]

manual_actions:
  - id: human-login
    checkpoint: sign-in
    actor: human
    summary: 人工直接输入凭据；凭据值不会被记录。
    secrets_recorded: false
    status: completed
```

**绝对不要**要求人类在聊天中透露密码、令牌或密钥。只记录语义动作和完成后的可观测状态。

---

## 7. 验证并关闭

记录重放命令，以便其他操作者能从零开始复现：

```yaml
replay:
  commands:
    - id: test-checkout
      command: "npm test -- checkout"
      working_directory: "."
      layer: frontend
      expected_result: 复现或验证结账行为。

verification:
  status: passed
  steps:
    - id: repeat-click
      action: 修复后再次点击结账按钮。
      expected: 出现网络请求或验证错误提示。
      status: passed
  evidence: [after-fix-screenshot]
```

验证完成的产物：

```sh
strict-spec-driven debug-session-validate my-bug
```

---

## 8. 典型工作流概览

```
init ──► dev-session-plan ──► dev-session-start
                                    │
                              debug-session-create
                                    │
                         分类层级 / 复现问题
                                    │
                          捕获证据 / 提出假设
                                    │
                          人工检查点（如需要）
                                    │
                            验证 / 校验产物
                                    │
                              dev-session-stop
```

---

## 命令速查

| 命令 | 用途 |
|---|---|
| `strict-spec-driven init` | 创建 `.strict-spec-driven/` 脚手架 |
| `dev-session-plan` | 验证声明文件，干运行计划 |
| `dev-session-start` | 按声明启动服务并等待就绪 |
| `dev-session-status` | 报告托管服务的生命周期状态 |
| `dev-session-logs <id>` | 打印服务日志输出 |
| `dev-session-stop` | 停止托管服务，清理运行时状态 |
| `debug-session-create <id>` | 创建调试会话产物和证据目录 |
| `debug-session-validate <id>` | 按 schema 校验调试会话 YAML |
