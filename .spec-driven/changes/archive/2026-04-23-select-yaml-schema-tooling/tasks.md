# Tasks: select-yaml-schema-tooling

## Implementation

- [x] 在 `package.json` 中增加并固定 `js-yaml`、`ajv`、`ajv-formats`，并同步锁文件。
- [x] 更新 CLI 基础层相关代码或入口，使上述依赖在仓库中可被编译与引用。
- [x] 补充依赖选择与用途说明，明确该变更仅覆盖工具选型与接入边界。

## Testing

- [x] Run `bun run build` — build validation for dependency wiring
- [x] Run `bun test/run.ts` — unit tests for dependency wiring

## Verification

- [x] Verify implementation matches proposal scope
