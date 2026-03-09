## MODIFIED Requirements

### Requirement: 聊天输入
界面 MUST 提供一个文本输入区域供用户输入消息，使用 t-textarea 与 t-button，并置于带视觉边界的容器内。

#### Scenario: 发送消息
- **WHEN** 用户输入消息并按 Enter 或点击发送时
- **THEN** 消息被添加到聊天记录中
- **AND** 消息被发送到后端
- **AND** 输入字段被清空

#### Scenario: 输入区样式
- **WHEN** 聊天界面加载
- **THEN** 输入区使用 TDesign 经典组件
- **AND** 输入区有明确的视觉边界（边框或 Card）

### Requirement: 聊天记录
界面 MUST 显示用户和 Agent 的消息滚动列表，使用 TDesign 经典组件（Card、Space、Avatar 等）增强视觉层次。

#### Scenario: 显示消息
- **WHEN** 添加新消息（来自用户或 Agent）时
- **THEN** 它出现在列表底部
- **AND** 视图自动滚动到最新消息
- **AND** 消息使用 TDesign 经典组件呈现（如 Avatar、Space）

### Requirement: Markdown 渲染
界面 MUST 使用 Markdown 渲染 Agent 响应。

#### Scenario: 渲染代码块
- **WHEN** Agent 响应包含代码块 (```) 时
- **THEN** 它被渲染为语法高亮的代码块
- **AND** 用户可以复制代码

### Requirement: 空状态
当无消息时，MUST 使用 t-empty 或带图标的占位内容展示空状态。

#### Scenario: 空状态
- **WHEN** 聊天记录为空且无进行中的请求
- **THEN** 显示 TDesign 空状态或等效占位
- **AND** 用户可识别“暂无消息”
