## ADDED Requirements

### Requirement: 工具调用记录随历史消息持久化

系统 SHALL 在 assistant 消息持久化时，把该消息的工具调用记录序列化写入 `conversation_messages.skill_calls` 列（JSON 数组）。序列化内容 MUST 包含每个工具调用的 `id`、`name`、`displayName`、`kind`、`status`、`arguments`、`result` 与 `children`。系统 MUST NOT 持久化实时轮询中间态（如 `pollingStatus`）。

#### Scenario: 含工具调用的回复保存
- **WHEN** 一条 assistant 消息在 SSE 流结束后被保存，且其内存中存在一个或多个工具调用
- **THEN** `conversation_messages.skill_calls` MUST 被写入对应的工具调用 JSON 数组（不再为 NULL）

#### Scenario: 无工具调用的回复保存
- **WHEN** 一条 assistant 消息没有任何工具调用
- **THEN** `skill_calls` MAY 为空数组或 NULL，且回显时渲染为无工具调用

### Requirement: 历史加载还原工具调用卡片

系统 SHALL 在加载历史对话时，从 `skill_calls` 反序列化还原工具调用卡片。还原 MUST 优先采用持久化的 `status` 与 `result`；当字段缺失时（如存量旧数据或异步任务回灌的旧形状）MUST 回退到兼容默认值而非报错。

#### Scenario: 切换对话后回显工具调用
- **WHEN** 用户切走对话再切回，加载到一条带 `skill_calls` 的历史 assistant 消息
- **THEN** 该消息 MUST 渲染出对应的工具调用卡片，包含工具名、参数、结果与状态

#### Scenario: 存量无记录消息兼容
- **WHEN** 加载一条 `skill_calls` 为 NULL 的存量历史消息
- **THEN** 系统 MUST 正常渲染该消息且不显示工具调用卡片，不抛错

### Requirement: LLM 交互记录持久化到懒加载子表

系统 SHALL 把 assistant 消息的 LLM 交互记录持久化到独立子表 `conversation_message_llm_logs`，按 `message_id` 关联。每条记录 MUST 包含 `direction`、`log_index`、`model_name`、`summary`、`request_json`、`response_json`。LLM 交互记录的写入 MUST 与对应消息的写入处于同一数据库事务，并使用该消息生成的 `message_id` 作为关联键。

#### Scenario: 含 LLM 日志的回复保存
- **WHEN** 保存一条带 LLM 交互记录的 assistant 消息
- **THEN** gateway MUST 在生成该消息 `message_id` 后，于同一事务内把每条 LLM 交互记录写入 `conversation_message_llm_logs`

#### Scenario: LLM 日志写入失败降级
- **WHEN** LLM 交互记录写入子表发生异常
- **THEN** 系统 MUST 不阻断该消息本身的保存，且仅记录日志

### Requirement: 历史列表轻量加载，LLM 记录按需懒加载

系统 SHALL 在加载历史消息列表时仅附带每条消息的 LLM 交互记录条数（`llm_log_count`），MUST NOT 内联 LLM 交互记录全量内容。系统 SHALL 提供按 `message_id` 拉取该消息全量 LLM 交互记录的端点，仅在用户主动查看时调用。

#### Scenario: 列表加载不含全量 LLM 日志
- **WHEN** 加载一个对话的历史消息列表
- **THEN** 返回的每条消息 MUST 携带 `llm_log_count`，且 MUST NOT 包含 `request_json` / `response_json` 全量内容

#### Scenario: 点击日志查看时懒加载
- **WHEN** 用户对某条消息点击「日志查看」
- **THEN** 系统 MUST 按该消息 `message_id` 拉取并展示其全量 LLM 交互记录

### Requirement: Schema 变更同步幂等迁移

系统 SHALL 在 `schema-mysql.sql` 中以 `CREATE TABLE IF NOT EXISTS` 定义 `conversation_message_llm_logs` 表，并在 `SchemaMigrationRunner` 中提供幂等的建表迁移，使已存在旧库在启动时自动补建该表。迁移 MUST 在依赖该表的查询执行前完成。

#### Scenario: 旧库启动自动补表
- **WHEN** 一个不含 `conversation_message_llm_logs` 表的旧库启动应用
- **THEN** `SchemaMigrationRunner` MUST 在查询执行前幂等建出该表

#### Scenario: 空库初始化
- **WHEN** 一个全新空库启动应用
- **THEN** `schema-mysql.sql` MUST 创建出含全部列的 `conversation_message_llm_logs` 表

### Requirement: agent-core 不被修改

本能力 SHALL NOT 修改 agent-core 代码。工具调用与 LLM 交互记录的写入 MUST 由前端发起、gateway 落库完成。现有 `conversation_logs` / `tool_call_logs` 运营日志系统 MUST 保持不变。

#### Scenario: 实现不触及 agent-core
- **WHEN** 实现本能力
- **THEN** MUST NOT 改动 agent-core 的任何文件
- **AND** MUST NOT 改动 `conversation_logs` / `tool_call_logs` 的写入与读取行为
