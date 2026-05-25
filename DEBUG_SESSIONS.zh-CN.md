# 调试会话

简体中文

调试会话是用于本地 Web API、前端、Electron 桌面应用和 CDP 访问调试的严格 YAML 调查记录。它们保存复现步骤、证据、假设、发现、人工检查点、手动操作、重放命令和验证状态。

每个会话存放在：

```text
.strict-spec-driven/debug-sessions/<session-id>/
  session.yaml
  evidence/
```

创建初始产物：

```sh
strict-spec-driven debug-session-create checkout-cdp-target
```

按 ID 或路径验证产物：

```sh
strict-spec-driven debug-session-validate checkout-cdp-target
strict-spec-driven debug-session-validate .strict-spec-driven/debug-sessions/checkout-cdp-target/session.yaml
```

当需要代理执行调查时，使用 `/strict-spec-debug-session`。该技能保持人工参与的结构化：人类在已准备好的浏览器或 Electron 会话中直接输入凭据、一次性验证码、OAuth 授权、支付确认及其他敏感值。产物仅记录语义动作、脱敏的证据引用和操作后的可观测状态；秘密值不会存储在 YAML、证据文件名、日志或聊天中。

`scope.layers` 和每个目标的 `layer` 字段将发现定位到以下层级之一：

| 层级 | 用途 |
|---|---|
| `web_api` | 请求、载荷、响应、状态码、API 端错误 |
| `frontend` | 浏览器路由、DOM 状态、控制台输出、渲染、客户端状态 |
| `electron` | Electron 窗口、webview、壳层行为、预加载/运行时上下文 |
| `cdp_access` | CDP 端点健康状态、目标发现、目标选择、连接失败 |

进行 Electron 调试时，在信任捕获的浏览器证据之前先记录 `cdp_health`。如果所选目标不能明确标识为预期的窗口或 webview，则将问题归类为 `cdp_access`，直到目标选择问题解决。

## 开发会话生命周期

当调试会话需要本地服务时，使用现有的开发会话生命周期命令，而不是在调试工作流中自行编排启动或清理步骤：

```sh
strict-spec-driven dev-session-plan
strict-spec-driven dev-session-start
strict-spec-driven dev-session-status
strict-spec-driven dev-session-logs web
strict-spec-driven dev-session-stop
```

在 `session.yaml` 中记录关联关系：

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
      evidence:
        - dev-session-plan
    start:
      command: strict-spec-driven dev-session-start
      status: passed
      evidence:
        - dev-session-start
    status:
      command: strict-spec-driven dev-session-status
      status: passed
      evidence:
        - dev-session-status
    logs:
      - service: web
        command: strict-spec-driven dev-session-logs web
        evidence:
          - web-log
    stop:
      command: strict-spec-driven dev-session-stop
      status: not_run
      evidence: []
    cleanup_status: pending
  unavailable_conditions: []
```

`dev-session` 负责进程启动、就绪检查、状态查询、日志和清理。`debug-session` 记录使用了哪些生命周期命令以及哪些证据证明了环境状态。如果服务无法启动，将会话归类为被环境搭建阻塞，直到生命周期诊断证明并非如此。
