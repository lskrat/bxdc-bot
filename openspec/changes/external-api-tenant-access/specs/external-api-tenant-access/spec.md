## ADDED Requirements

### Requirement: 对话发布类型区分

`conversations` 表 SHALL 包含 `publish_type` 字段，取值为 `internal`（内部共享）或 `external`（外部系统接入），默认值为 `internal`。

#### Scenario: 内部共享发布
- **WHEN** 用户在 PublishApiModal 中选择"内部共享"类型并发布对话
- **THEN** 系统将 `publish_type` 设置为 `internal`
- **AND** 系统将 `api_description` 作为 system message 用于 `/api/agent-chat` 调用

#### Scenario: 外部系统接入发布
- **WHEN** 管理员在 PublishApiModal 中选择"外部系统接入"类型并发布对话
- **THEN** 系统将 `publish_type` 设置为 `external`
- **AND** 系统将 `external_system_prompt` 作为 system message 用于 `/api/agent-chat/external` 调用

### Requirement: 外部系统接入仅管理员可见

PublishApiModal 中的"外部系统接入"发布类型入口 SHALL 仅对管理员可见。

#### Scenario: 管理员可见外部接入选项
- **WHEN** 管理员用户打开 PublishApiModal
- **THEN** 发布类型选择中显示"内部共享"和"外部系统接入"两个选项

#### Scenario: 非管理员不可见外部接入选项
- **WHEN** 非管理员用户打开 PublishApiModal
- **THEN** 发布类型选择中仅显示"内部共享"选项

### Requirement: 外部系统接入 API 端点

系统 SHALL 提供 `POST /api/agent-chat/external` 端点，接受外部系统的调用请求。

#### Scenario: 请求格式
- **WHEN** 外部系统发送请求到 `POST /api/agent-chat/external`
- **THEN** 请求体 SHALL 包含 `apiKey`（必填）、`instruction`（必填）、`callerId`（必填）、`apiClient`（选填）、`streaming`（选填，默认 false）

#### Scenario: 首次调用自动创建租户
- **WHEN** 某一 `(apiKey, callerId)` 组合首次调用
- **THEN** 系统 SHALL 自动创建平台用户（ID 格式为 `ext_` + SHA-256 前 8 位）
- **AND** 系统 SHALL 克隆模板对话（复制 `enabled_skills`、`enabled_files`、`source`），新对话的 `user_id` 为自动创建的用户 ID
- **AND** 系统 SHALL 在 `external_api_tenants` 表写入映射记录
- **AND** 以上操作 SHALL 在同一事务内完成

#### Scenario: 重复调用复用已有租户
- **WHEN** 某一 `(apiKey, callerId)` 组合再次调用
- **THEN** 系统 SHALL 从 `external_api_tenants` 表查找已有的 `user_id` 和 `cloned_conv_id`
- **AND** 系统 SHALL NOT 再次创建用户或克隆对话

#### Scenario: 非流式模式响应
- **WHEN** 请求中 `streaming` 为 `false` 或不传
- **THEN** 系统 SHALL 聚合 agent-core 的 SSE 流后返回单个 JSON 响应，包含 `conversationId`、`reply`、`toolCalls`（数组，每项含 `toolName`、`displayName`、`status`）、`durationMs`

#### Scenario: 流式模式响应
- **WHEN** 请求中 `streaming` 为 `true`
- **THEN** 系统 SHALL 返回 `text/event-stream`
- **AND** 事件类型 SHALL 包含 `agent_message`（文本片段）、`tool_start`（skill 开始执行）、`tool_result`（skill 执行完成）、`agent_finish`（最终汇总）、`[DONE]`（流结束）

#### Scenario: apiKey 无效
- **WHEN** 请求中的 `apiKey` 无法匹配到任何已发布的对话
- **THEN** 系统 SHALL 返回 401，body 为 `{"error": "Invalid API key"}`

#### Scenario: 对话未发布
- **WHEN** 请求中的 `apiKey` 匹配的对话 `is_published` 不为 true
- **THEN** 系统 SHALL 返回 404，body 为 `{"error": "Conversation is not published"}`

#### Scenario: instruction 为空
- **WHEN** 请求中的 `instruction` 为空或仅包含空白字符
- **THEN** 系统 SHALL 返回 400，body 为 `{"error": "instruction is required"}`

### Requirement: 外部接入使用独立系统提示词

外部接入模式的 system message SHALL 使用 `external_system_prompt`，而非 `api_description`。

#### Scenario: 外部接入 system message
- **WHEN** 系统构建调用 agent-core 的 history
- **THEN** system message 的内容 SHALL 为 `external_system_prompt` 的值（若为 NULL 则回退到 `api_description`）

### Requirement: 克隆对话写 source 字段

克隆对话的 `source` 字段 SHALL 记录请求参数 `apiClient` 的值（若传入），手动创建的对话 `source` 为 NULL。

#### Scenario: 带 apiClient 的克隆
- **WHEN** 请求包含 `apiClient: "ecommerce"`
- **THEN** 克隆对话的 `source` SHALL 为 `"ecommerce"`

#### Scenario: 不带 apiClient 的克隆
- **WHEN** 请求不包含 `apiClient`
- **THEN** 克隆对话的 `source` SHALL 为 NULL

### Requirement: external_api_tenants 表结构

系统 SHALL 维护 `external_api_tenants` 表，存储模板对话到克隆对话的租户映射。

#### Scenario: 表唯一约束
- **WHEN** 向 `external_api_tenants` 插入记录
- **THEN** 表 SHALL 在 `(template_conv_id, caller_id)` 上有 UNIQUE 约束
- **AND** 表 SHALL 在 `cloned_conv_id` 上有索引

### Requirement: 外部接入默认系统提示词

系统 SHALL 为外部接入模式提供一套简化的默认系统提示词，定义在 agent-core 提示词配置文件中。

#### Scenario: 默认提示词内容
- **WHEN** 系统构建外部接入的默认系统提示词
- **THEN** 内容 SHALL 包含 agentRolePrompt（简化版）、skillDiscoveryPolicy、extendedSkillRoutingPolicy、downloadUrlPolicy
- **AND** 内容 SHALL NOT 包含 skillGeneratorPolicy、taskTrackingPolicy、confirmationUIPolicy

#### Scenario: 获取默认提示词端点
- **WHEN** Gateway 需要获取外部接入默认提示词
- **THEN** agent-core SHALL 通过 `GET /prompts/external-api-default` 端点返回提示词文本
- **AND** 返回内容 SHALL 随 `AGENT_PROMPTS_LANGUAGE` 环境变量自动切换语言

#### Scenario: PublishApiModal 预填充默认提示词
- **WHEN** 管理员在 PublishApiModal 中选择"外部系统接入"类型
- **THEN** 前端 SHALL 从 Gateway 代理获取默认提示词
- **AND** 前端 SHALL 将默认提示词预填充到 `externalSystemPrompt` 输入框
- **AND** 管理员 SHALL 可以在保存前修改提示词内容

#### Scenario: 修改后的提示词持久化
- **WHEN** 管理员修改默认提示词后点击发布
- **THEN** 系统 SHALL 将修改后的内容保存到 `conversations.external_system_prompt`
- **AND** 后续调用 SHALL 使用该修改后的提示词而非默认值

### Requirement: 存量 API 分享端点行为不变

存量 `POST /api/agent-chat` 端点 SHALL 保持所有现有行为不变。

#### Scenario: 内部共享调用不受影响
- **WHEN** 用户通过 `POST /api/agent-chat` 调用内部共享的 API
- **THEN** 请求和响应格式与变更前完全一致
- **AND** system message 仍使用 `api_description`
