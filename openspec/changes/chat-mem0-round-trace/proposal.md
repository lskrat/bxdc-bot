## Why

运维与调试时能已通过「日志查看」看到本轮 LLM 请求/响应，但 **mem0 的检索（msearch）与写入（madd）** 仅落在服务端 `memory.log`，前端无法对应到「当前这一条助手回复」究竟读写了哪些记忆。需要在同一交互范式下提供可点击的 **记忆轨迹**，降低排查成本。

## What Changes

- **agent-core**：在本轮对话的 SSE 流中推送结构化的 mem0 轨迹事件（与 `llm_log` 类似），至少覆盖一次用户提问触发的 **检索** 与回合结束时的 **写入**；事件带 `sessionId`，与现有 LLM 日志对齐过滤方式。
- **前端**：仿照 `MessageList.vue` 中「日志查看」——在工具栏与助手消息区增加 **记忆轨迹** 入口（按钮 + 对话框），展示本轮 **读取**（请求参数 + 解析后的记忆条目标）与 **写入**（madd 请求与响应摘要）。
- **skill-gateway**：若 SSE 为透传 agent-core 行流，通常 **无需改网关**；若存在过滤或转换，需保证新事件类型原样到达浏览器。

## Capabilities

### New Capabilities

- `chat-mem0-round-trace`: 定义 SSE 事件形状、按会话归属、以及 UI 上「本轮读取 / 本轮写入」的展示与空状态。

### Modified Capabilities

- `agent-client`: 扩展 SSE 解析与消息模型，识别并挂载 mem0 轨迹到当前助手消息（与 `llmLogs` 并列）。
- `llm-log-viewer`: 在规格层面与「日志类查看器」并列说明 **记忆轨迹查看器** 的交互一致性（按钮位置、对话框模式、按消息归属）；若团队更希望完全独立，可在实现时仅引用 `chat-mem0-round-trace` 而本项留空——**本提案采并列扩展 llm-log-viewer 的交互一致性要求**。

## Impact

- `backend/agent-core`：`MemoryService` 与 `AgentController`（或编排层）在 `msearch` / `madd` 成功或失败路径上发射事件；注意不在日志中重复泄露比现有 `logMemory` 更多的敏感字段。
- `frontend`：`useChat`、`MessageList`（或等价组件）、新/扩展示 util 类型。
- **隐私**：写入内容含用户输入与助手全文，对话框仅限当前登录用户本会话内可见（与 LLM 日志一致）。
