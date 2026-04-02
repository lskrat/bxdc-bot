## 1. agent-core：SSE 事件

- [ ] 1.1 定义 `mem0_trace`（或选定名）事件类型与 TypeScript 类型，字段含 `sessionId`、`operation`、`timestamp`、`summary`、`detail`
- [ ] 1.2 在 `MemoryService` 的 retrieve/store 路径调用可注入的 emitter（或回调），由 `AgentController` 传入 `subject.next`
- [ ] 1.3 对 `sentenceout` / 长文本做可配置或固定截断，避免异常大的 SSE 负载

## 2. 前端：解析与 UI

- [ ] 2.1 在 `useChat`（或 SSE 处理中心）增加 `isMem0TraceEvent` 与消息字段（如 `mem0Traces`），合并逻辑参考 `llmLogs`
- [ ] 2.2 在 `MessageList.vue`（或等价）增加「记忆轨迹」按钮与对话框，区分 retrieve / store 展示 `detail` JSON
- [ ] 2.3 工具栏可增加「查看最新回复的记忆轨迹」快捷入口（与「日志查看」对称，可选）

## 3. 验证

- [ ] 3.1 手工走一轮对话：确认检索与写入各出现轨迹，且切换会话不串
- [ ] 3.2 旧前端或未升级 build 忽略未知事件（回归 smoke）
