## MODIFIED Requirements

### Requirement: 任务事件流转发
任务事件流 MUST 向前端持续输出可消费的结构化事件，除了 assistant 文本外，还要包含 Skill 调用状态信息。

#### Scenario: 转发文本事件
- **WHEN** Agent 产生新的回复文本事件
- **THEN** 任务 SSE 将文本事件发送给前端客户端

#### Scenario: 转发 Skill 状态事件
- **WHEN** Agent 产生 Skill 调用开始、进行中、完成或失败事件
- **THEN** 任务 SSE 将包含 Skill 名称与状态字段的结构化事件发送给前端客户端

### Requirement: Skill 状态字段一致性
任务事件流中的 Skill 状态事件 MUST 使用稳定的数据字段，便于前端统一解析。

#### Scenario: Skill 事件字段完整
- **WHEN** 网关向前端发送 Skill 状态事件
- **THEN** 事件中包含可识别的事件类型
- **AND** 包含 Skill 名称
- **AND** 包含当前状态值

#### Scenario: 多个 Skill 连续执行
- **WHEN** 同一任务在一次回复中连续触发多个 Skill
- **THEN** 事件流按实际执行顺序输出对应事件
- **AND** 前端可依据顺序恢复完整的调用轨迹

### Requirement: 会话结束信号
任务事件流 MUST 在任务结束时发送明确的完成信号，使前端能够收敛 loading 状态。

#### Scenario: 正常结束
- **WHEN** Agent 完成当前任务
- **THEN** 网关发送完成事件
- **AND** 之后不再继续发送新的 Skill 状态或文本事件
