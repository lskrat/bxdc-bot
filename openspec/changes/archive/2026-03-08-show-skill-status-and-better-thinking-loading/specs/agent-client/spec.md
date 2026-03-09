## MODIFIED Requirements

### Requirement: 流式事件解析
前端客户端 MUST 能从任务 SSE 中解析 assistant 文本内容与 Skill 调用状态事件，并分别写入消息状态。

#### Scenario: 解析 assistant 文本
- **WHEN** SSE 事件中包含 assistant 文本内容
- **THEN** 客户端更新当前 assistant 消息正文
- **AND** 不影响已记录的 Skill 调用状态列表

#### Scenario: 解析 Skill 状态事件
- **WHEN** SSE 事件中包含结构化的 Skill 调用状态
- **THEN** 客户端提取 Skill 名称与状态
- **AND** 将其关联到当前 assistant 消息

### Requirement: 多 Skill 顺序维护
前端客户端 MUST 为单条 assistant 消息维护有序的 Skill 调用列表，并支持同一 Skill 的增量状态更新。

#### Scenario: 首次收到 Skill 事件
- **WHEN** 某个 Skill 首次出现在当前回复的事件流中
- **THEN** 客户端在该消息的 Skill 列表末尾追加一条记录

#### Scenario: 收到同一 Skill 的后续状态
- **WHEN** 客户端再次收到同一 Skill 的更新事件
- **THEN** 客户端更新已有 Skill 记录的状态
- **AND** 不新增重复条目

### Requirement: Thinking 状态收敛
前端客户端 MUST 在流式会话生命周期内正确维护 thinking 状态，避免 loading 与 Skill 状态残留。

#### Scenario: 正常完成
- **WHEN** SSE 收到完成事件
- **THEN** 客户端结束 thinking 状态
- **AND** 保留最终 assistant 文本与 Skill 完成态

#### Scenario: 请求失败
- **WHEN** SSE 连接失败或任务执行失败
- **THEN** 客户端结束 thinking 状态
- **AND** 不再继续追加 Skill 或文本更新
