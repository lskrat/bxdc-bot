## Why

历史对话中看不到大模型交互记录和工具调用记录：实时 SSE 流里前端内存已完整持有每条 assistant 消息的 `toolInvocations`（工具调用）和 `llmLogs`（LLM 交互），但流结束持久化时 `saveMessageCallback` 把 `skill_calls` 写死为 `undefined`、`llmLogs` 根本不存；历史加载（`convertHistoryMessages`）又把 `llmLogs` 写死 `[]`、`skill_calls` 读到 NULL。结果是切走对话再回来，工具调用卡片和 LLM 日志全部消失，只剩纯文本 `content`。这与上一轮问好语 bug 同源——实时内存里搭出来的东西没真正落库。

## What Changes

- **工具调用记录持久化**：流结束时把 assistant 消息内存中的 `toolInvocations` 序列化写入**已有的** `conversation_messages.skill_calls` 列（当前写死 `undefined`）；历史加载时反序列化还原工具调用卡片。无需新增列。
- **LLM 交互记录持久化（懒加载）**：新增 `conversation_message_llm_logs` 子表，按 `message_id` 存每条 LLM 交互日志的全量内容（request/response/model/tokens 等）；`conversation_messages` 仅在加载历史时附带一个轻量计数（`llm_log_count`），不内联全量日志。用户点击「日志查看」时才按 `message_id` 懒加载子表全量，历史列表加载体量不受影响。
- **不改 agent-core**：记录写入由前端 `saveMessageCallback`（内存现成数据）+ gateway 落库完成，agent-core 的 LLM 调度链路与系统 B（`conversation_logs`/`tool_call_logs` 运营日志）均不改动（遵循 AGENTS.md 5.5）。
- **schema 变更**：新增 `conversation_message_llm_logs` 表，CREATE TABLE 写入 `schema-mysql.sql` 的同时，在 `SchemaMigrationRunner` 写幂等建表/补列迁移（遵循 AGENTS.md 5.3 新规约）。

## Capabilities

### New Capabilities
- `conversation-history-tool-llm-logs`: 对话历史消息的工具调用记录与 LLM 交互记录的持久化与回显——工具调用记录内联存入 `skill_calls`，LLM 交互记录存入懒加载子表并由「日志查看」按需拉取。

### Modified Capabilities
<!-- 无现有 capability 的 requirement 变更 -->

## Impact

- **Frontend**：
  - `ChatView.vue` 的 `saveMessageCallback`：序列化 `toolInvocations` 写入 `skill_calls`；触发 LLM 日志落库 API。
  - `ChatView.vue` 的 `convertHistoryMessages` / `convertSingleMessage`：从持久化数据还原 `toolInvocations`（已有 `parseSkillCalls`）；按计数渲染「日志查看」入口。
  - `MessageList.vue` 日志查看器：按 `messageId` 懒加载 LLM 交互记录。
- **Gateway**：
  - 新增 `conversation_message_llm_logs` 表 + 实体 + Mapper。
  - 新增写入端点（保存 LLM 交互记录）与读取端点（按 `messageId` 拉取）。
  - `getMessages` 返回附带 `llm_log_count`（轻量）。
  - `SchemaMigrationRunner` 新增幂等迁移；`schema-mysql.sql` 新增 CREATE TABLE。
- **Agent-core**：无改动。
- **数据库**：新增 1 张表 `conversation_message_llm_logs`；`conversation_messages.skill_calls` 列由"始终 NULL"变为"实际写入工具调用 JSON"（向后兼容：老消息 NULL 仍渲染为无工具调用）。
- **依赖**：无新增第三方包。
