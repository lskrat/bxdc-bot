## Context

历史对话只持久化 `conversation_messages` 的 `role` / `content`，工具调用与 LLM 交互记录全部丢失：

- **工具调用**：`conversation_messages.skill_calls` 列**已存在**，但前端 [`saveMessageCallback`](file:///Users/yangkai/Desktop/fishtank/frontend/src/views/ChatView.vue#L41-L51) 保存时写死 `skill_calls: undefined`，导致永远为 NULL；历史加载 [`convertHistoryMessages`](file:///Users/yangkai/Desktop/fishtank/frontend/src/views/ChatView.vue#L59) 调 `parseSkillCalls(null)` 返回 `[]`。
- **LLM 交互**：`conversation_messages` 没有相关列；`convertHistoryMessages` / `convertSingleMessage` 把 `llmLogs` 写死 `[]`。

但实时 SSE 流期间前端内存已完整持有这两类数据：`message.toolInvocations`（`ToolInvocation[]`，含 `id/name/displayName/kind/status/arguments/result/children/pollingStatus`）与 `message.llmLogs`（`LlmLogEntry[]`，含 `direction/timestamp/summary/modelName/request/response`，单条 `request/response` 可达数十 KB）。

项目另有一套独立日志系统（`conversation_logs` / `tool_call_logs`，agent-core 写、按 `session_id` 关联、供运营看板用），但其关联键是临时 `session_id` 而非持久 `conversation_id`，聊天历史页无法据此回显。本设计走"系统 A"路线：直接补齐 `conversation_messages` 同源数据，不依赖那套日志系统。

## Goals / Non-Goals

**Goals:**
- 工具调用记录随历史消息持久化并在切换对话后正确回显（卡片、参数、结果、状态）。
- LLM 交互记录持久化且**不拖慢历史列表加载**：列表仅带轻量计数，全量内容点击「日志查看」时按 `message_id` 懒加载。
- 不修改 agent-core（遵循 AGENTS.md 5.5）。
- schema 变更走 `SchemaMigrationRunner` 幂等迁移（遵循 AGENTS.md 5.3 新规约）。
- 不新增第三方依赖。

**Non-Goals:**
- 不改动 `conversation_logs` / `tool_call_logs` 运营日志系统（继续供看板使用）。
- 不为存量历史消息回填（老消息 `skill_calls` 为 NULL、无 LLM 日志，渲染为"无工具调用 / 无日志"，向后兼容）。
- 不持久化实时轮询中间态（`pollingStatus`），只持久化终态工具调用结果。
- 不持久化 API 对话（发布为 API 的无前端会话）的工具/LLM 记录——无前端在场，本期不覆盖。

## Decisions

### 决策 1：工具调用内联存入已有 `skill_calls` 列

流结束时 `saveMessageCallback` 把 assistant 消息的 `toolInvocations` 序列化为 JSON 写入 `skill_calls`（替换当前的 `undefined`）。单条消息工具调用 JSON 约 1–5 KB，20 条历史 ≈ 100 KB，可随历史一次性加载，无需独立查询。

- **序列化字段**：`id` / `name` / `displayName` / `kind` / `status` / `arguments` / `result` / `children`（不含 `pollingStatus` 等实时态）。
- **还原**：扩展 [`parseSkillCalls`](file:///Users/yangkai/Desktop/fishtank/frontend/src/views/ChatView.vue#L116)——当前它把 `status` 写死 `'completed'`、`result` 写死 `undefined`；改为优先读取持久化的 `status` / `result`，缺失时回退原默认（兼容历史/异步任务回灌写入的旧形状）。
- **为何不另起表**：体量小、与消息强绑定、加载路径已现成，内联最简单。

**备选（弃用）**：为工具调用也建独立懒加载表 → 过度设计，体量不构成加载压力。

### 决策 2：LLM 交互记录走独立懒加载子表 `conversation_message_llm_logs`

LLM 记录单条 `request`/`response` 可达数十 KB（含完整 messages 数组），内联会让 20 条历史膨胀到数 MB。故独立成表，列表只带计数：

```
conversation_messages（历史加载，轻量）
  + 加载时附带 llm_log_count（由子表 COUNT 得出，不存列、不内联内容）
        │ 用户点击「日志查看」
        ▼
conversation_message_llm_logs（懒加载子表）
  id BIGINT PK
  message_id   VARCHAR  ← 关联 conversation_messages.message_id（建索引）
  conversation_id VARCHAR ← 冗余便于按对话清理
  log_index    INT      ← 同一消息内顺序
  direction    VARCHAR(16)   request / response
  model_name   VARCHAR(128)
  summary      TEXT
  request_json LONGTEXT
  response_json LONGTEXT
  created_at   DATETIME
  UNIQUE(message_id, log_index)
```

- **`llm_log_count` 不落列**：`getMessages` 返回时对子表做 `COUNT(*) GROUP BY message_id`（或一次 IN 查询），避免冗余列与写时维护。
- **懒加载端点**：`GET /api/conversations/{id}/messages/{messageId}/llm-logs` 返回该消息全量日志，前端复用现有「日志查看」弹窗（[`openLatestLogViewer`](file:///Users/yangkai/Desktop/fishtank/frontend/src/components/MessageList.vue#L695)），与文件详情按需加载模式一致。

### 决策 3：写入由前端发起 + gateway 同事务落库（不改 agent-core）

复用现有保存链路 [`saveMessages`](file:///Users/yangkai/Desktop/fishtank/frontend/src/services/api.ts#L137) → `POST /api/conversations/{id}/messages`。扩展每条 message 项可携带 `llm_logs` 数组：

```
前端 saveMessageCallback
  messages: [{ role, content, skill_calls(JSON), skill_outputs, llm_logs?: LlmLogEntry[] }]
        │ POST /api/conversations/{id}/messages
        ▼
gateway 保存 message（生成 message_id）
        │ 同一 @Transactional 内
        ▼
若该 message 带 llm_logs → 批量 INSERT 到 conversation_message_llm_logs（用刚生成的 message_id）
```

- **为何把 `llm_logs` 一并放进保存请求**：message_id 由 gateway 生成，前端保存前拿不到。一并提交可让 gateway 在生成 message_id 后**同事务**写子表，避免"先存消息拿 id、再二次往返写日志"的非原子两步。
- **为何不让 agent-core 写**：agent-core 当前只往系统 B（`session_id` 关联）写，改它去写系统 A 既违反 5.5、又要解决 session→conversation 映射，得不偿失。前端内存已有现成数据，直接带上最省。

### 决策 4：schema 变更同时落 `schema-mysql.sql` + `SchemaMigrationRunner`

按 AGENTS.md 5.3 新规约：
- `schema-mysql.sql` 加 `CREATE TABLE IF NOT EXISTS conversation_message_llm_logs (...)`（空库路径）。
- `SchemaMigrationRunner` 新增 `migrateConversationMessageLlmLogs()`：`tableExists` 判断 + 幂等建表（旧库路径），`HIGHEST_PRECEDENCE` 保证早于查询执行。

## Risks / Trade-offs

- **`skill_calls` 写入后体量增长** → 仅序列化终态必要字段（剔除 `pollingStatus`/`children` 实时噪声若过大可截断 `result`）；单条 1–5 KB 可控。
- **超大 `result`（如长文本工具输出）撑大 `skill_calls`** → `result` 已由 SSE 服务端 sanitize；如仍过大可设上限截断并标注"已截断，完整见日志"。本期先不截断，观察后迭代。
- **LLM 日志写入失败影响消息保存** → 子表写入与消息写入同事务；但 `llm_logs` 为可选字段，缺失/异常时降级为"只存消息不存日志"，不阻断主保存（catch 后仅记 log）。
- **API 对话 / 断线无前端在场漏记** → 明确列为 Non-Goal；这类对话仍可在系统 B（运营日志）追溯。
- **存量老消息无记录** → 向后兼容渲染为空，不回填。
- **多 tab 重复保存** → 沿用现有 `saveMessageCallback` 既有去重/幂等行为，子表 `UNIQUE(message_id, log_index)` 兜底防重。

## Migration Plan

1. gateway 先行部署：建表迁移幂等，旧库自动补表，老前端不写 `llm_logs`/`skill_calls`（仍 NULL）——不破坏现状。
2. 前端部署后开始写入新数据；历史中"部署前的消息"仍为空记录（兼容）。
3. 回滚：前端回退即停止写入；`conversation_message_llm_logs` 表与 `skill_calls` 数据保留无害（读侧对 NULL 兼容）。

## Open Questions

- `result` 是否需要长度上限截断？（倾向：本期不截断，上线后按实际体量决定）
- 「日志查看」是否需要分页？（倾向：单条消息日志条数有限，本期不分页）
