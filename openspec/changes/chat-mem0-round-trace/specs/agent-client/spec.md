# agent-client (delta)

## ADDED Requirements

### Requirement: 解析并挂载 mem0 轨迹事件

客户端 MUST 能从任务 SSE 中识别 mem0 轨迹事件类型，将条目合并到当前助手消息的状态中（与 `llmLogs` 并列的独立列表），并在 UI 中供记忆轨迹查看器使用。

#### Scenario: 收到轨迹事件

- **WHEN** SSE `message` 数据中包含带约定 `type` 的 mem0 轨迹事件且 `sessionId` 与当前任务一致
- **THEN** 客户端 MUST 将该轨迹追加或更新到当前助手消息关联的轨迹列表
- **AND** MUST 不在无关会话的消息上显示该条目

#### Scenario: 类型守卫

- **WHEN** 数据缺少必要字段（如 `sessionId` 或操作类型）
- **THEN** 客户端 MUST 跳过该条并记录可观测错误（如控制台）而不中断流处理

## MODIFIED Requirements

### Requirement: 流式事件解析

前端客户端 MUST 能从任务 SSE 中解析 assistant 文本内容与 Skill 调用状态事件，并分别写入消息状态。

#### Scenario: 流式事件解析

- **WHEN** 任务 SSE 推送多种 JSON 事件（含助手内容、工具状态、LLM 日志、mem0 轨迹等）
- **THEN** 客户端 MUST 将各事件路由到对应的消息字段或 UI 状态
- **AND** assistant 文本与工具状态行为与修改前一致
