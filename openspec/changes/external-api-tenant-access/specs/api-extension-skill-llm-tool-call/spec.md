## ADDED Requirements

### Requirement: 外部系统接入端点 `/api/agent-chat/external`

系统 SHALL 在 `ConversationApiController` 中新增 `POST /api/agent-chat/external` 端点，与存量 `POST /api/agent-chat` 并行提供，不修改原有端点行为。

#### Scenario: 新端点独立路由
- **WHEN** 外部系统调用 `POST /api/agent-chat/external`
- **THEN** 系统 SHALL 路由到 `ExternalApiService.agentChatExternal()` 处理
- **AND** 存量 `POST /api/agent-chat` 的路由行为 SHALL NOT 变更

#### Scenario: 新端点使用独立认证
- **WHEN** 外部系统调用 `POST /api/agent-chat/external`
- **THEN** 系统 SHALL 通过请求体中的 `apiKey` 字段认证
- **AND** 系统 SHALL NOT 要求 `X-User-Id` 请求头
