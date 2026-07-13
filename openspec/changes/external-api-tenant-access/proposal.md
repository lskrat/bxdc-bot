## Why

当前 API 分享功能仅面向团队内部用户，所有外部调用者共用模板对话的上下文与记忆。当外部系统（如电商平台、ERP、CRM）希望接入平台时，需要每个外部用户拥有独立的长短期记忆、对话上下文隔离，并能按来源系统进行用量统计。本需求在不影响存量 API 分享功能的前提下，提供面向外部系统的多租户接入能力。

## What Changes

- **新增** `POST /api/agent-chat/external` 端点：支持外部系统以 `apiKey` + `callerId` 调用，自动创建平台用户并克隆模板对话，实现用户级别的记忆与上下文隔离
- **新增** `external_api_tenants` 表：记录模板对话 → 克隆对话 + 平台用户 的映射关系，实现同一 `callerId` 的幂等复用
- **新增** `conversations` 表字段 `publish_type`、`external_system_prompt`、`source`：区分对话发布类型、存储外部接入专属系统提示词、记录来源系统标识
- **修改** `PublishApiModal.vue`：管理员可配置"外部系统接入"类型，填写系统提示词，该入口仅管理员可见
- **新增** 流式（SSE）与非流式（JSON）双模输出，由请求参数 `streaming` 控制，默认非流式
- **BREAKING** 无。存量 `POST /api/agent-chat` 端点完全不变，agent-core 零改动

## Capabilities

### New Capabilities

- `external-api-tenant-access`: 外部系统多租户接入能力，包含租户映射、自动用户创建、对话克隆、流式/非流式双模输出

### Modified Capabilities

- `api-extension-skill-llm-tool-call`: 新增外部接入端点 `POST /api/agent-chat/external`，与存量 `POST /api/agent-chat` 并行，不修改原有行为

## Impact

- **Gateway**: 新增 `ExternalApiService`、`ConversationApiController.externalAgentChat()`、`ConversationService.clone()`
- **DB**: 新建 `external_api_tenants` 表；`conversations` 表新增 `publish_type`、`external_system_prompt`、`source` 三列；`SchemaMigrationRunner` 需新增幂等迁移
- **前端**: `PublishApiModal.vue` 新增发布类型选择与系统提示词输入；管理员判断逻辑
- **Agent-core**: 零改动
