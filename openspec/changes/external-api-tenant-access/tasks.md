## 1. Database — Schema Migration

- [x] 1.1 创建 `external_api_tenants` 表（含 UNIQUE KEY `uk_template_caller`）
- [x] 1.2 `conversations` 表新增 `publish_type VARCHAR(16) DEFAULT 'internal'` 列
- [x] 1.3 `conversations` 表新增 `external_system_prompt TEXT NULL` 列
- [x] 1.4 `conversations` 表新增 `source VARCHAR(64) NULL` 列
- [x] 1.5 `schema-mysql.sql` 同步更新三列的 CREATE TABLE 定义
- [x] 1.6 `SchemaMigrationRunner.migrateConversations()` 新增幂等 `ensureColumn` 迁移

## 2. Gateway — Entity & Mapper

- [x] 2.1 创建 `ExternalApiTenant.java` 实体（`@TableName("external_api_tenants")`）
- [x] 2.2 `Conversation.java` 实体新增 `publishType`、`externalSystemPrompt`、`source` 字段映射
- [x] 2.3 创建 `ExternalApiTenantMapper.java`（继承 `BaseMapper<ExternalApiTenant>`，增加 `selectByTemplateAndCaller` 方法）

## 3. Gateway — Service

- [x] 3.1 `ConversationService.clone()` 方法：深度复制对话（`userId`、`name`、`enabledSkills`、`enabledFiles`、`source`），不带消息历史，返回新 `Conversation`
- [x] 3.2 `UserService` 新增内联创建模式：`createExternalUser(String userId, String nickname)`，跳过注册门禁校验
- [x] 3.3 创建 `ExternalApiService`：
  - `agentChatExternal()` 编排主流程：认证 → 查找/创建租户 → 调用 agent-core → 写日志
  - `findOrCreateTenant()`：查 `external_api_tenants`，未命中则创建用户 + 克隆对话 + 写入映射（同一事务）
  - `callAgentCoreSSEStreaming()`：流式透传 agent-core SSE（`SseEmitter`）
  - `callAgentCoreBlocking()`：聚合 SSE 后返回单次 JSON（复用现有 `callAgentCoreSSE` 逻辑）
  - `buildHistory()`：system message 使用 `external_system_prompt`（NULL 回退 `api_description`）

## 4. Gateway — Controller

- [x] 4.1 `ConversationApiController.externalAgentChat()` 新端点 `POST /api/agent-chat/external`，委托 `ExternalApiService`
- [x] 4.2 `PUT /api/conversations/{id}/publish` 支持 `publishType` 和 `externalSystemPrompt` 参数
- [x] 4.3 `UserController.getUser()` 返回增加 `isAdmin` 字段（判断 `SYSTEM_ADMIN_IDS` 环境变量）

## 5. Agent-core — Default External Prompt

- [x] 5.1 `src/prompts/en.ts` 新增 `externalApiSystemPrompt`（简化版：不含 skillGeneratorPolicy、taskTrackingPolicy、confirmationUIPolicy）
- [x] 5.2 `src/prompts/zh.ts` 同步新增中文版 `externalApiSystemPrompt`
- [x] 5.3 `src/prompts/types.ts` 中 `SystemPrompts` 接口新增 `externalApiSystemPrompt` 字段
- [x] 5.4 `src/prompts/index.ts` `Prompts` proxy 支持 `externalApiSystemPrompt` 属性
- [x] 5.5 新增 `GET /prompts/external-api-default` 端点，返回提示词文本

## 6. Frontend — PublishApiModal

- [x] 6.1 新增发布类型 radio 选择：内部共享 / 外部系统接入
- [x] 6.2 外部接入模式显示 `externalSystemPrompt` 文本输入框
- [x] 6.3 选择外部接入时自动调用 Gateway 获取默认提示词并预填充
- [x] 6.4 "外部系统接入"选项仅管理员可见（读取 `isAdmin` 字段）
- [x] 6.5 发布请求传递 `publishType` 和 `externalSystemPrompt`

## 7. Frontend — Admin Detection

- [x] 7.1 `useUser.ts` 的 `login()` 返回后存储 `isAdmin` 状态
- [x] 7.2 后端 `UserController.getUser()` 或 `AuthController.login()` 返回 `isAdmin` 字段

## 8. Integration & Verification

- [x] 8.1 验证存量 `POST /api/agent-chat` 行为不变（回归测试）
- [x] 8.2 验证外部接入首次调用：自动创建用户 + 克隆对话 + 写入映射
- [x] 8.3 验证外部接入重复调用：直接复用已有克隆对话
- [x] 8.4 验证非流式模式：返回正确 JSON（reply + toolCalls + durationMs）
- [x] 8.5 验证流式模式：SSE 事件类型和格式正确
- [x] 8.6 验证 `source` 字段正确记录 `apiClient` 值
- [x] 8.7 验证长期记忆隔离：同一模板不同 `callerId` 的 Mem0 记忆不互相污染
- [x] 8.8 验证短期记忆隔离：同一模板不同 `callerId` 的消息历史不互相污染
- [x] 8.9 验证 PublishApiModal 外部接入模式默认提示词预填充
