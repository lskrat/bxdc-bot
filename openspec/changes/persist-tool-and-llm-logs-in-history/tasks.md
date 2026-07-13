## 1. Gateway — 数据库与实体

- [ ] 1.1 `schema-mysql.sql` 新增 `CREATE TABLE IF NOT EXISTS conversation_message_llm_logs`（含 message_id/conversation_id/log_index/direction/model_name/summary/request_json LONGTEXT/response_json LONGTEXT/created_at + `INDEX(message_id)` + `UNIQUE(message_id, log_index)`）
- [ ] 1.2 `SchemaMigrationRunner` 新增 `migrateConversationMessageLlmLogs()`：`tableExists` 判断 + 幂等建表，并在 `afterPropertiesSet()` 中调用
- [ ] 1.3 新增实体 `ConversationMessageLlmLog`（JDK 1.8 写法，`@TableName`/`@TableField` 对齐列名）
- [ ] 1.4 新增 `ConversationMessageLlmLogMapper`（继承 `BaseMapper`）

## 2. Gateway — 保存与读取

- [ ] 2.1 扩展保存消息入参：每条 message 可携带 `llm_logs` 数组（缺省兼容老前端）
- [ ] 2.2 保存消息时把 `skill_calls` 实际写入（不再忽略前端传入的工具调用 JSON）
- [ ] 2.3 保存消息生成 `message_id` 后，于同一 `@Transactional` 内批量 INSERT `llm_logs` 到子表；写入异常 catch 后仅记 log，不阻断消息保存
- [ ] 2.4 `getMessages` 返回时附带每条消息的 `llm_log_count`（对子表 COUNT，IN 查询或 GROUP BY），MUST NOT 内联全量 request/response
- [ ] 2.5 新增端点 `GET /api/conversations/{id}/messages/{messageId}/llm-logs`：按 message_id 返回全量 LLM 交互记录（归属校验复用现有 `getById`）

## 3. Frontend — 持久化写入

- [ ] 3.1 `ChatView.vue` `saveMessageCallback`：把 `m.toolInvocations` 序列化为 `skill_calls`（id/name/displayName/kind/status/arguments/result/children，剔除 pollingStatus），替换当前写死的 `undefined`
- [ ] 3.2 `saveMessageCallback`：把 `m.llmLogs` 作为 `llm_logs` 一并提交到保存请求
- [ ] 3.3 `api.ts` 的 `SaveMessagesRequest` 类型扩展 `skill_calls?: string` 与 `llm_logs?: LlmLogEntry[]`

## 4. Frontend — 历史还原与懒加载

- [ ] 4.1 扩展 `parseSkillCalls`：优先读取持久化 `status` / `result`，缺失时回退兼容默认（不破坏异步任务回灌旧形状）
- [ ] 4.2 `convertHistoryMessages` / `convertSingleMessage`：按消息携带的 `llm_log_count` 设置「日志查看」可见性（count>0 才显示 LLM 日志入口）
- [ ] 4.3 `api.ts` 新增 `fetchMessageLlmLogs(userId, conversationId, messageId)` 调用懒加载端点
- [ ] 4.4 `MessageList.vue` 日志查看器：打开某条历史消息日志时，若 `llmLogs` 为空且 `llm_log_count>0`，按 messageId 懒加载并填充

## 5. 验证

- [ ] 5.1 gateway `mvn compile` 通过；启动后旧库自动补出 `conversation_message_llm_logs` 表
- [ ] 5.2 `cd frontend && npx vue-tsc -b` 静默通过（无 TS6133）
- [ ] 5.3 `cd frontend && npm run build` exit 0
- [ ] 5.4 手测：发一条触发工具调用的消息 → 切走对话再切回 → 工具调用卡片（参数/结果/状态）正确回显
- [ ] 5.5 手测：历史消息点击「日志查看」→ 懒加载出该消息的 LLM 交互记录；列表加载不含全量日志
- [ ] 5.6 手测：存量无记录的旧消息正常渲染、不报错
