## ADDED Requirements

### Requirement: Cancel confirmation gracefully stops sub-agent
When a user cancels a confirmation dialog during sub-agent execution, the system SHALL signal the sub-agent to stop with a CANCELLED status and prevent retry loops.

#### Scenario: User cancels confirmation during sub-agent execution
- **WHEN** a sub-agent triggers a confirmation request and the user clicks cancel
- **THEN** execute_skill_with_context SHALL detect `confirmed: false` in the catch block
- **THEN** SHALL return `{ status: "CANCELLED", message: "用户取消了操作" }` instead of throwing an error
- **THEN** the sub-agent SHALL NOT retry the cancelled operation

#### Scenario: Cancel message appears in summary area
- **WHEN** the user cancels a confirmation during sub-agent execution
- **THEN** the cancel summary message SHALL appear in the main conversation area (not inside the think block)
- **THEN** the think block SHALL be closed with `status: "failed"` via think_end event

### Requirement: Cancel flow uses iterator replacement
The agent controller SHALL use iterator replacement (`iterator = newStream[Symbol.asyncIterator]()`) instead of drain-and-break when resuming after user cancellation, allowing the main agent to naturally produce a cancellation summary.

#### Scenario: Cancel resume triggers main agent summary
- **WHEN** the controller detects `confirmed: false` in the confirmation result
- **THEN** it SHALL create a new stream with `Command({ resume: { confirmed: false } })` and replace the iterator
- **THEN** the main agent SHALL produce a natural-language cancellation summary message

## MODIFIED Requirements

### Requirement: 错误处理

**Requirement**: 子 Agent 执行失败时，思考块保留所有推理过程，便于调试。用户取消确认时，子 Agent 不重试，直接返回取消状态。

**验证标准**:
- 子 Agent 执行失败，思考块标记为 failed
- 已接收的 AI 文本保留在思考块中
- SSE 连接中断，思考块标记为 failed，保留已接收内容
- 用户取消确认，子 Agent 返回 CANCELLED 状态，不重试操作
- 取消消息显示在主对话区域而非思考块内

**实现位置**:
- `frontend/src/composables/useChat.ts` — handleThinkEnd、handleStreamError
- `backend/agent-core/src/tools/execute-skill.ts` — 异常处理、cancelFlow
- `backend/agent-core/src/controller/agent.controller.ts` — iterator 替换逻辑
