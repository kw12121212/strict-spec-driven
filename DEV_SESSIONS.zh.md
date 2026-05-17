# 开发会话 (Development Sessions)

[English](DEV_SESSIONS.md) | 中文

本指南介绍了如何在严格工作流 (strict) 项目中声明本地开发会话，运行 CLI 检查和生命周期命令，生成辅助脚本，并捕获浏览器测试证据——所有这一切都通过单个结构化的 YAML 文件完成。

## 什么是开发会话？

开发会话声明告诉 Agent 和工具项目需要哪些本地服务、如何检测它们是否就绪、打开哪些浏览器目标来进行冒烟测试、如何干净地停止这些服务，以及需要哪些环境变量——而这一切都无需存储任何敏感密钥或密码。

该声明文件位于：

```
.strict-spec-driven/dev-session.yaml
```

当该文件存在时，严格生命周期技能 (`strict-spec-apply`、`strict-spec-auto`、`strict-spec-verify`、`strict-spec-review`) 会在启动服务或运行浏览器测试之前自动检查它。

---

## 声明会话

在项目中运行 `strict-spec-driven init` 会自动生成一个初始的会话声明，你也可以手动创建该文件。该声明必须符合 `strict-spec-driven/dev-session/v1` schema 规范。

### 最小前端应用示例

```yaml
schema: strict-spec-driven/dev-session/v1
schema_version: 1
artifact_type: dev_session
schema_file: ../../templates/strict-spec-driven/schemas/dev-session.yaml
session:
  id: local-web-app
  description: Frontend development session with one browser smoke target.
  services:
    web:
      description: Local frontend dev server.
      command: bun run dev
      working_directory: "."
      environment:
        required:
          - PORT
        optional:
          - API_BASE_URL
      urls:
        - "http://127.0.0.1:3000"
      ports:
        - 3000
      readiness:
        type: http
        url: "http://127.0.0.1:3000/health"
        timeout_seconds: 60
        interval_seconds: 2
        notes:
          - Update the health URL to match the project.
      browser_targets:
        - home
      cleanup:
        mode: signal
        signal: SIGTERM
        grace_period_seconds: 10
      unavailable_conditions:
        - Install project dependencies before starting the dev server.
  browser_targets:
    home:
      url: "http://127.0.0.1:3000"
      smoke_paths:
        - /
      evidence_labels:
        - homepage-loaded
      local_only: true
      service: web
      notes:
        - Confirm the page renders without console or network errors.
```

### Schema 字段参考

**顶层 `session` 字段：**

| 字段 | 是否必需 | 说明 |
|---|---|---|
| `id` | 是 | 会话的 Kebab-case 标识符 (例如 `local-web-app`) |
| `description` | 否 | 会话的人类可读说明 |
| `services` | 是 | 声明的本地服务键值映射表 (至少包含一项) |
| `browser_targets` | 是 | 浏览器冒烟测试目标的键值映射表 (可为空 `{}`) |

**单服务字段 (位于 `session.services.<id>` 下)：**

| 字段 | 是否必需 | 说明 |
|---|---|---|
| `description` | 否 | 服务的人类可读说明 |
| `command` | 是 | 启动服务的 Shell 命令 |
| `working_directory` | 是 | 命令的运行工作目录 (相对于仓库或绝对路径) |
| `environment.required` | 是 | 必须设置的环境变量名称列表 (不要包含值) |
| `environment.optional` | 是 | 可选的环境变量名称列表 (不要包含值) |
| `urls` | 是 | 服务暴露的 URL 列表 (可为空) |
| `ports` | 是 | 服务监听的端口列表 (可为空) |
| `readiness` | 是 | 如何检测服务已就绪 — 见下文 |
| `browser_targets` | 是 | 该服务声明的浏览器目标 ID 列表 |
| `cleanup` | 是 | 如何停止该服务 — 见下文 |
| `unavailable_conditions` | 是 | 缺少前置条件时的人类可读说明提示 (可为空) |

**就绪检测 (Readiness) 子字段：**

| 字段 | 是否必需 | 说明 |
|---|---|---|
| `type` | 是 | `http`、`tcp` 或 `manual` |
| `url` | 如果 `type: http` | 要轮询的 URL (必须返回 2xx) |
| `port` | 如果 `type: tcp` | 要探测的 TCP 端口 |
| `timeout_seconds` | 是 | 声明服务不可用之前的最大等待时间 |
| `interval_seconds` | 是 | 轮询的时间间隔 |
| `notes` | 否 | 人类可读的就绪说明提示 |

**清理 (Cleanup) 子字段：**

| 字段 | 是否必需 | 说明 |
|---|---|---|
| `mode` | 是 | `signal`、`command` 或 `none` |
| `signal` | 如果 `mode: signal` | 要发送的信号名称 (例如 `SIGTERM`) |
| `command` | 如果 `mode: command` | 用于清理的 Shell 命令 |
| `grace_period_seconds` | 是 | 发送信号后，在强制终止前等待的秒数 |

**单浏览器目标字段 (位于 `session.browser_targets.<id>` 下)：**

| 字段 | 是否必需 | 说明 |
|---|---|---|
| `url` | 是 | 在浏览器中打开的本地 URL |
| `smoke_paths` | 是 | 冒烟测试期间要访问的路径后缀 (至少一项) |
| `evidence_labels` | 是 | 需要捕获的证据的人类可读标签 (至少一项) |
| `local_only` | 是 | 如果目标仅在本地可访问，则设为 `true` |
| `service` | 否 | 打开此目标必须处于运行状态的服务 ID |
| `notes` | 否 | 提供给冒烟测试的附加人类可读指南 |

---

## CLI 命令

所有命令都需要 `.strict-spec-driven/dev-session.yaml` 存在并且有效。
请在项目根目录运行以下命令：

```sh
node /path/to/strict-spec-driven/dist/strict-spec-cli.js <subcommand>
```

如果是从 Skill (技能) 中调用，也可以通过 `{{SKILL_DIR}}/scripts/strict-spec-driven.js` 路径执行。

### `dev-session-plan`

验证声明文件，并输出确定性的干运行 (dry run) 会话计划。该命令不会启动任何进程，也不会写入任何文件。

```sh
strict-spec-driven dev-session-plan
```

**输出 (JSON, stdout)：** `{ valid: true|false, artifactPath, session: { id, services: [...], browserTargets: [...] }, diagnostics: [...] }`

当 `valid: true` 时，退出码为零。如果声明文件缺失或无效，将输出诊断信息 (diagnostics)，且退出码非零。

**优先使用此命令** — Agent 在启动任何服务之前应先运行 `dev-session-plan`，以确认声明的命令和浏览器目标是否符合项目的预期。

### `dev-session-start`

加载声明文件，按照声明的顺序启动每个服务，等待它们就绪，并将托管的运行时状态记录到 `.strict-spec-driven/.runtime/dev-session/` 下。

```sh
strict-spec-driven dev-session-start
```

**输出 (JSON, stdout)：** `{ ok: true|false, artifactPath, runtimeStatePath, sessionId, services: [{ id, status, pid, logPath, urls, ports }], diagnostics: [...] }`

该命令仅启动在文件中显式声明的服务。它不会猜测未声明的命令或端口。如果某个必需的环境变量未设置，该命令会在启动任何服务之前就在诊断信息中报告缺失的变量。

### `dev-session-status`

报告先前由 `dev-session-start` 启动的服务的生命周期状态。区分 `running` (运行中)、`failed` (已失败)、`stopped` (已停止) 和 `stale` (陈旧记录) 状态。

```sh
strict-spec-driven dev-session-status
```

**输出 (JSON, stdout)：** 输出结构与 `dev-session-start` 相同。当未找到任何托管的运行时状态时，返回 `ok: false`。

`stale` (陈旧) 状态表示运行时状态记录文件存在，但记录的进程已不再存活 (例如：系统重启或进程崩溃后)。参见下文的 [清理陈旧运行时状态](#清理陈旧运行时状态)。

### `dev-session-logs`

打印声明服务的日志文件内容。如果声明了多个服务，可以可选地接受一个服务 ID 参数。

```sh
strict-spec-driven dev-session-logs           # 打印第一个服务的日志
strict-spec-driven dev-session-logs web       # 打印服务 ID 为 "web" 的服务的日志
```

**输出：** 成功时，纯文本输出到 stdout。错误时，JSON 格式的诊断信息输出到 stdout，且退出码非零。

### `dev-session-stop`

仅仅停止最近一次 `dev-session-start` 启动记录的进程。该命令能够容忍陈旧 (stale) 记录并使清理操作保持幂等性 — 运行两次 `dev-session-stop` 是安全的。

```sh
strict-spec-driven dev-session-stop
```

**输出 (JSON, stdout)：** `{ ok: true|false, artifactPath, runtimeStatePath, sessionId, services: [{ id, status, ... }], diagnostics: [...] }`

只影响由本工具启动的进程。绝不会干扰其他无关进程。

### `dev-session-trial`

根据声明的浏览器目标和当前受管的运行时状态，导出浏览器测试指南。此命令**不**启动服务，也**不**打开浏览器——它仅报告要打开哪些目标以及要捕获哪些证据。

```sh
strict-spec-driven dev-session-trial
```

**输出 (JSON, stdout)：** `{ ok: true|false, artifactPath, runtimeStatePath, sessionId, browserTargets: [{ id, url, smokePaths, evidenceLabels, localOnly, service, notes, provenance, trialReady, managedServiceStatus? }], diagnostics: [...] }`

每个浏览器目标都包含一个 `provenance` (来源) 字段：

| Provenance | 含义 |
|---|---|
| `started_by_strict` | 背后的服务是由 `dev-session-start` 启动的 |
| `already_available` | 背后的服务不受托管，但对应的 URL 似乎可以访问 |
| `unavailable` | 背后的服务未运行，也未由本工具启动 |

当目标似乎已经就绪，可用于浏览器冒烟测试时，`trialReady: true`。

---

## 浏览器测试证据

浏览器测试证据是作为常规测试的补充——它**不**替代项目所必需的回归测试命令。

在 `dev-session-trial` 报告有就绪的目标后，Agent 应当：
1. 在浏览器中打开声明的 URL。
2. 导航至 `smoke_paths` 中的每一个路径。
3. 捕获 `evidence_labels` 中列出名称的证据观察结果 (例如屏幕截图、控制台日志、HTTP 状态码等)。
4. 提交捕获到的证据，附带任何来自浏览器目标的 `notes`。
5. 任务完成后，使用 `dev-session-stop` 停止创建的服务。

捕获的证据是补充性上下文。严格变更 (strict change) 在存档之前，依然必须通过项目中必需的回归测试命令 (配置在 `.strict-spec-driven/config.yaml` 的 `review_evidence.project_regression` 节点下)。

---

## 密钥处理

会话声明文件中只能记录**环境变量的名称** —— 绝对不要记录值。

```yaml
# 正确：仅列出变量名称
environment:
  required:
    - DATABASE_URL
    - API_SECRET_KEY
  optional:
    - LOG_LEVEL
```

```yaml
# 错误：不要将值嵌入文件中
environment:
  values:            # 这是一个无效字段 —— schema 校验会将其拒绝
    DATABASE_URL: postgres://...
```

如果某项服务缺少特定的配置步骤就无法运行，请在 `unavailable_conditions` 中记录该条件：

```yaml
unavailable_conditions:
  - Run `bun install` before starting the dev server.
  - Ensure DATABASE_URL is set in your local environment.
```

Agent 与生成的辅助脚本将只引用这些变量名称，并发布预检 (pre-flight checks)。只要必需的环境变量未设置，预检就会尽早宣告失败，而不是尝试启动服务导致在半途中失败出错。

---

## 清理陈旧运行时状态

运行时状态位于 `.strict-spec-driven/.runtime/dev-session/` 中 (此目录在 gitignore 中)。该目录仅由 `dev-session-start` 写入，并由 `dev-session-stop` 清理。

如果遇到系统重启或进程崩溃，状态文件可能仍包含存活着对应 PID 但实际上已死掉的记录。`dev-session-status` 会将这些报告为 `stale`。`dev-session-stop` 会安全地跳过陈旧记录并将其从状态文件中移除，因此后续执行 `dev-session-status` 将不再显示这些内容。

你也可以手动移除陈旧的运行时状态：

```sh
rm -rf .strict-spec-driven/.runtime/dev-session
```

这样做是安全的——下一次 `dev-session-start` 执行时，会自动重新创建目录并写入最新的状态。

---

## 生成辅助脚本

`/strict-spec-dev-session-scripts` 技能可以根据声明文件生成项目本地的 shell 脚本，因此用户不需要去背诵 strict CLI 的各个子命令。

**在 Claude Code 中调用该技能：**

```
/strict-spec-dev-session-scripts
```

该技能将运行 `dev-session-plan` 来验证声明文件，然后(在默认情况下)向 `scripts/` 目录下写入四个脚本：

| 脚本 | 封装的命令 |
|---|---|
| `scripts/dev-start` | `dev-session-start` (带有必需变量的预检) |
| `scripts/dev-stop` | `dev-session-stop` |
| `scripts/dev-status` | `dev-session-status` |
| `scripts/dev-logs` | `dev-session-logs` (透传额外参数) |

### 受托管的代码块

每个生成的脚本都包含一个 `BEGIN STRICT-MANAGED SECTION` / `END STRICT-MANAGED SECTION` 注释代码块。重新生成时，该技能**仅**会替换标记之间的内容。你在代码块上方或下方添加的任何其他内容都会被保留。

```bash
#!/usr/bin/env bash
set -euo pipefail

# Regenerate with: /strict-spec-dev-session-scripts

# ============================================================
# BEGIN STRICT-MANAGED SECTION
# DO NOT EDIT BETWEEN THE MANAGED-SECTION MARKERS
# ============================================================

node "$(dirname "$0")/../dist/scripts/strict-spec-driven.js" dev-session-stop

# ============================================================
# END STRICT-MANAGED SECTION
# ============================================================

# 你可以安全地在这里添加任何自定义的停止后逻辑 (post-stop logic)。
```

### 免覆盖规则

- 如果脚本不存在：创建新脚本。
- 如果脚本存在且包含受托管的代码块：仅更新该托管代码块的内容。
- 如果脚本存在但不包含受托管的代码块：技能会在覆盖该脚本前停止并请求你的确认。

### 密钥安全

生成的脚本**绝不会**内嵌环境变量的真实值。`dev-start` 脚本会生成一个预检循环来检查每一个 `environment.required` 变量。如果任意变量缺失，它将退出并输出易于人类理解的错误提示。

---

## 在 Strict 变更中使用 Dev Sessions

当存在 `.strict-spec-driven/dev-session.yaml` 时：

1. **在启动服务之前**：运行 `dev-session-plan` 来确认声明的命令和浏览器测试目标。
2. **启动服务**：运行 `dev-session-start`，而非盲猜或者直接手动执行命令。
3. **检查就绪状态**：检查 `dev-session-status` 的输出，而无需人工手动轮询。
4. **浏览器测试**：运行 `dev-session-trial` 获取声明的 URL 以及证据标签；打开这些 URL，走查冒烟测试路径 (smoke paths)，并捕获对应标签的证据。
5. **停止服务**：如果一项任务启动了相关联服务，即使后续步骤可能还会再停止它们，在结束任务前，请**务必**执行一次 `dev-session-stop`。
6. **遇到不可用的前置条件**：如果 `dev-session-plan` 输出诊断异常信息，或者某个必需的环境变量未设置，请停止操作并向人类提供可操作的配置指导提示，而不是尝试自己设法绕过缺失的前提条件。

本项目所需的回归测试命令 (在此代码库中是 `bun run build && bun test/run.ts`，或者是你在项目的 `.strict-spec-driven/config.yaml` 中配置的其他命令)，始终是能够让 strict 变更顺利存档的权威性证据门槛。浏览器测试证据仅仅作为补充，不能替代回归测试的执行。