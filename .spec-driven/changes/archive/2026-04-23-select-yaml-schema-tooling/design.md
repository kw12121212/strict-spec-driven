# Design: select-yaml-schema-tooling

## Approach

1. 在 `package.json` 中引入并固定 `js-yaml`、`ajv`、`ajv-formats`，并同步锁文件。
2. 保持当前 CLI 路由与命令面不变，仅完成依赖接入与可执行性打通。
3. 通过构建和单元测试验证依赖接入不会破坏现有基础行为。
4. 为后续 `add-yaml-validation-layer` 预留清晰边界：该变更不实现业务校验逻辑，只提供工具基础。

## Key Decisions

- 使用 `js-yaml` 作为 YAML 解析与序列化基础库，理由是生态成熟、接口稳定、可直接服务脚本层读取与写回。
- 使用 `ajv` + `ajv-formats` 作为 schema 校验基础，理由是与 JSON Schema 生态兼容度高，适合产出可定位字段路径的诊断信息。
- 依赖选择阶段不引入额外 DSL 或自定义校验框架，避免在 foundation 阶段扩大复杂度。

## Alternatives Considered

- `yaml` + 自定义校验逻辑：可行但需要额外维护校验实现，不利于快速形成可复用基础层。
- `zod` 作为主校验层：对运行时 schema 协议表达灵活，但对既有 schema 资产与跨工具互通不如 JSON Schema 路径直接。
- 仅做依赖研究不落地接入：会推迟风险暴露，后续实现阶段仍需返工。
