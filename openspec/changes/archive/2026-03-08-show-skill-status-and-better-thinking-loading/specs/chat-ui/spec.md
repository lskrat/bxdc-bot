## MODIFIED Requirements

### Requirement: 聊天记录
界面 MUST 在 assistant 消息正文下方展示与该条回复关联的执行状态信息，且与正文内容分离渲染。

#### Scenario: 展示单个 Skill 调用状态
- **WHEN** assistant 回复过程中触发一个 Skill 调用事件
- **THEN** 该条 assistant 消息下方显示该 Skill 的名称
- **AND** 状态信息使用小字号辅助文本展示

#### Scenario: 展示多个 Skill 调用状态
- **WHEN** 同一条 assistant 回复过程中按顺序触发多个 Skill 调用事件
- **THEN** 界面按实际触发顺序逐条展示多个 Skill
- **AND** 先前已展示的 Skill 状态不会被后续 Skill 覆盖

### Requirement: Skill 调用完成态
界面 MUST 在 Skill 调用成功完成后为对应条目展示明确的完成标记。

#### Scenario: Skill 调用成功
- **WHEN** 某个 Skill 的状态变为完成
- **THEN** 该 Skill 条目显示成功完成态
- **AND** 条目末尾显示一个小对勾

#### Scenario: Skill 调用进行中
- **WHEN** 某个 Skill 尚未完成
- **THEN** 该 Skill 条目显示进行中状态文案
- **AND** 不显示完成对勾

### Requirement: Thinking Loading 展示
界面 MUST 使用“思考中”文案配合 emoji 和动态效果表示 assistant 正在处理中，而不是默认的三个点。

#### Scenario: 请求处理中
- **WHEN** 用户发送消息后 assistant 尚未完成回复
- **THEN** 界面展示包含“思考中”字样的 loading 状态
- **AND** loading 中包含一个 emoji
- **AND** loading 具有可感知的动态效果

#### Scenario: 请求完成
- **WHEN** assistant 回复流结束或请求失败
- **THEN** “思考中” loading 状态消失
