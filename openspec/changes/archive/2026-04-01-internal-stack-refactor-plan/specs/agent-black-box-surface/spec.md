## ADDED Requirements

### Requirement: Agent-core 暴露稳定的消费者 HTTP 契约

`agent-core` SHALL 向 **skill-gateway** 提供文档化、版本化的 HTTP 接口（本变更不要求浏览器直连 agent）；网关 SHALL 仅依赖该契约调用 agent，而不依赖 `agent-core` 内部模块结构。

#### Scenario: 健康检查

- **WHEN** 客户端对 `agent-core` 发起 `GET /health`
- **THEN** 响应体包含服务标识与健康状态，HTTP 状态为成功

#### Scenario: 对话任务 SSE

- **WHEN** 客户端对 `POST /agent/run` 提交 JSON，包含 `instruction`、`context`（含 `userId`、`sessionId` 及可选 LLM 覆盖字段）、可选 `history`
- **THEN** 响应为 `text/event-stream`，流中事件可被网关原样转发至浏览器，且事件序列与现有前端解析逻辑兼容或提供迁移说明

#### Scenario: 记忆写入

- **WHEN** 客户端对 `POST /memory/add` 提交 `userId`、`text` 及可选 `role`
- **THEN** `agent-core` 将记忆委托给配置的 mem0 服务并完成 HTTP 成功响应或明确错误

#### Scenario: 头像与问候特性

- **WHEN** 客户端对 `POST /features/avatar/generate` 或 `POST /features/avatar/greeting` 提交约定字段（含网关合并后的 LLM 参数）
- **THEN** 响应 JSON 形态与网关代理契约一致，且不要求调用方了解 LangChain 内部类型细节（网关可做适配）

### Requirement: Skill 代理路径行为可预测

`agent-core` 的 `POST|PUT|DELETE /features/skills*` SHALL 作为对 skill-gateway 的转发层，使用环境变量 `JAVA_GATEWAY_URL` 与 `JAVA_GATEWAY_TOKEN`，错误时返回与下游一致的 HTTP 状态与 body 结构（或文档化的映射规则）。

#### Scenario: 下游不可用

- **WHEN** skill-gateway 返回 5xx 或网络错误
- **THEN** `agent-core` 返回可观测的错误信息；经网关转发时由网关统一脱敏后返回浏览器
