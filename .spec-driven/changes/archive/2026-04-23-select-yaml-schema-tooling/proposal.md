# select-yaml-schema-tooling

## What

- 选定并固定严格 YAML 工作流所需的基础依赖：`js-yaml`、`ajv`、`ajv-formats`。
- 在项目依赖与构建测试流程中接入上述依赖，确保后续 YAML 解析与 schema 校验实现具备可执行基础。
- 明确该变更只负责“工具选型与接入”，不实现完整的 YAML 校验逻辑。

## Why

`02-strict-cli-foundation` 里后续的 `add-yaml-validation-layer`、`implement-strict-init` 与测试补齐，都依赖稳定的 YAML 解析与 schema 校验工具链。如果先不完成依赖选型并接入，后续实现会出现重复改动与不一致风险。

## Scope

In scope:
- 更新 `package.json` 与锁文件，引入并固定 `js-yaml`、`ajv`、`ajv-formats`。
- 让构建与测试流程在当前仓库中可使用这些依赖。
- 记录依赖选择边界与用途，作为后续实现的约束输入。

Out of scope:
- 不实现完整 YAML 校验层（该工作属于 `add-yaml-validation-layer`）。
- 不实现 strict init、roadmap、archive 等后续子命令迁移。
- 不修改现有 roadmap 结构或里程碑状态。

## Unchanged Behavior

Behaviors that must not change as a result of this change (leave blank if nothing is at risk):
- 现有 CLI 命令路由行为保持不变。
- 现有 `bun run build` 与 `bun test/run.ts` 的入口与调用方式保持不变。
