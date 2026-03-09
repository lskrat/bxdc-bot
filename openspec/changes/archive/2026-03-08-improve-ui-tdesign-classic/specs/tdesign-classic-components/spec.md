## ADDED Requirements

### Requirement: 消息区使用经典组件
消息列表 MUST 使用 TDesign 经典组件（Card、Space、Avatar 等）呈现，提升视觉层次。

#### Scenario: 用户消息展示
- **WHEN** 显示用户发送的消息
- **THEN** 消息使用 t-avatar 或 t-space 等组件包装
- **AND** 视觉上与其他元素有明确区分

#### Scenario: 助手消息展示
- **WHEN** 显示 Agent 回复的消息
- **THEN** 消息使用 TDesign 经典组件包装
- **AND** 与用户消息在布局或样式上有区分

### Requirement: 输入区使用经典组件
输入区域 MUST 使用 t-textarea、t-button 等 TDesign 组件，并置于带边框或 Card 的容器内。

#### Scenario: 输入区渲染
- **WHEN** 聊天界面加载
- **THEN** 输入区使用 t-textarea 与 t-button
- **AND** 输入区有明确的视觉边界（如边框或 Card）

### Requirement: 空状态使用经典组件
当无消息时，MUST 使用 t-empty 或带图标的占位区域展示空状态。

#### Scenario: 空状态展示
- **WHEN** 聊天记录为空且无进行中的请求
- **THEN** 显示 TDesign 空状态组件或等效占位内容
- **AND** 用户可明确识别“暂无消息”状态
