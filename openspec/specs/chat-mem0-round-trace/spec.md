# chat-mem0-round-trace Specification

## Purpose
TBD - created by archiving change chat-mem0-round-trace. Update Purpose after archive.
## Requirements
### Requirement: SSE 推送 mem0 轨迹事件

系统 SHALL 在用户对话任务关联的 SSE 流中推送结构化事件，用以表示本轮与 mem0 的交互，且事件 MUST 包含 `sessionId` 以便客户端过滤到当前任务。

#### Scenario: 检索后推送读取轨迹

- **WHEN** agent-core 为当前用户请求调用 mem0 检索（msearch）
- **THEN** 系统 MUST 在该任务的 SSE 流中发送至少一条可解析的轨迹事件
- **AND** 事件 MUST 标明操作为读取（retrieve）或等价语义
- **AND** 事件 MUST 包含 `sessionId` 与可用于展示的详情（例如请求中的 query、userid、topk 及返回的记忆列表或错误信息）

#### Scenario: 回合结束后推送写入轨迹

- **WHEN** agent-core 在完成一轮对话后调用 mem0 写入（madd）
- **THEN** 系统 MUST 在该任务的 SSE 流中发送至少一条可解析的轨迹事件
- **AND** 事件 MUST 标明操作为写入（store）或等价语义
- **AND** 事件 MUST 包含 `sessionId` 与可用于展示的详情（例如写入请求摘要、mem0 响应状态或错误信息）

### Requirement: 前端按会话归属并展示

客户端 SHALL 解析 mem0 轨迹事件，并将其关联到当前任务下正在展示的那条助手消息（与现有 LLM 日志归属策略一致），且 SHALL 提供与「日志查看」类似的入口打开只读对话框。

#### Scenario: 助手消息上的入口

- **WHEN** 某条助手消息存在至少一条 mem0 轨迹
- **THEN** 用户 MUST 能通过该消息区域的控件打开记忆轨迹对话框
- **AND** 对话框 MUST 区分展示读取与写入两类记录（或无记录时的空状态说明）

#### Scenario: 会话隔离

- **WHEN** 用户同时存在多个任务或切换会话
- **THEN** 展示的轨迹 MUST 仅属于当前 `sessionId` 对应任务
- **AND** MUST 不混入其他会话的轨迹条目

### Requirement: 向后兼容

旧版本前端在未识别新事件类型时 MUST 仍能正常完成对话与 LLM 日志功能；新事件 MUST 为附加数据，不改变既有事件语义。

#### Scenario: 忽略未知类型

- **WHEN** SSE 数据中包含客户端不识别的 `type`
- **THEN** 客户端 MUST 忽略该条而不崩溃
- **AND** 其余消息处理逻辑 MUST 继续工作

