## Context

- 前端通过 skill-gateway 订阅任务 SSE，流内容来自 agent-core `POST /agent/run`。
- LLM 日志：`LoggerService.createLlmCallbackHandler` 经 `subject.next(JSON.stringify({ type: 'llm_log', entry }))` 推送；前端 `isLlmLogEvent` 解析后挂到当前助手消息的 `llmLogs`。
- 记忆：`MemoryService.searchMemories`（msearch）在跑 Agent 前调用；`processTurn`（madd）在流结束后调用；`logMemory` 仅写文件。

## Goals / Non-Goals

**Goals:**

- 与「日志查看」相同心智模型：每条助手回复可打开对话框，看到她依赖的记忆读取与本回合写入。
- 事件与 `sessionId` 绑定，多标签/多任务不串数据。

**Non-Goals:**

- 不在首版提供 mem0 服务端全量记忆浏览或删除（仅占位本轮轨迹）。
- 不改变 mem0 HTTP 契约；不强制展示 mem0 内部向量等实现细节。

## Decisions

1. **事件类型**：采用 `type: 'mem0_trace'`（或 `memory_trace`，实现二选一但全链路统一），payload 含 `sessionId`、`operation: 'retrieve' | 'store'`、`timestamp`、`summary`（短句）、`detail`（请求/响应/snapshots 等可 JSON 序列化对象）。失败路径也发事件，`detail.error` 承载原因。
2. **挂载消息**：与 `llm_log` 一致——`sessionId` 匹配活跃任务时，追加到**当前正在生成的**助手消息；若需在流结束后仍归属该条，沿用现有 `activeSessionId` + 最后一条 assistant 的合并逻辑（与 llm logs 相同实现策略）。
3. **发射点**：retrieve 在 `searchMemories` 返回路径各发一条（含 `sentence`、`userid`、`topk`、解析后的字符串列表或原始响应摘要）；store 在 `processTurn` 完成路径发一条（含 `sentencein` / `sentenceout` 长度或截断预览 + `userid` + mem0 响应 code/message）。
4. **skill-gateway**：默认为字符串行透传，**不修改**；若集成测试发现缓冲改写，再补网关单测。

## Risks / Trade-offs

- **[Risk] 助手回复过长导致 SSE 体过大** → Mitigation：`sentenceout` 在 trace 里可截断（如前后各 N 字）并标注 `truncated: true`；完整内容仍以 madd 实际提交为准。
- **[Risk] 与 llm_log 事件顺序混淆** → Mitigation：独立 `type` 与前端分支解析。

## Migration Plan

1. 先部署 agent-core（向后兼容：旧前端忽略未知 `type`）。
2. 再部署前端。
3. 回滚：撤回前端按钮即可；后端多推事件无害。

## Open Questions

- `sentenceout` 在 trace 中的默认截断长度可由环境变量配置，首版固定常量即可。
