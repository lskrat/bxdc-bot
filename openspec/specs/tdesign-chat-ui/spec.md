# tdesign-chat-ui

## Purpose

定义基于 TDesign 的聊天界面布局与组件选型（与 chat-ui 互补）。

## Requirements

### Requirement: 聊天布局

界面 MUST 使用 TDesign 布局组件（Layout、Content、Header）来构建聊天页面。

#### Scenario: 响应式布局

- **当** 用户调整窗口大小时
- **那么** 聊天布局会适当调整（例如，消息列表占据可用高度）

### Requirement: 消息列表

界面 MUST 使用 TDesign List 或 Card 组件显示滚动的消息列表。

#### Scenario: 显示消息

- **当** 添加新消息时
- **那么** 它出现在列表底部
- **并且** 视图自动滚动到最新消息
- **并且** 用户消息靠右对齐
- **并且** Agent 消息靠左对齐

### Requirement: 消息输入

界面 MUST 使用 TDesign Input 或 Textarea 组件提供文本输入区域。

#### Scenario: 发送消息

- **当** 用户输入消息并按 Enter（不按 Shift）或点击发送时
- **那么** 消息被添加到聊天记录中
- **并且** 输入字段被清空

### Requirement: Markdown 渲染

界面 MUST 使用兼容 Vue 的 Markdown 渲染器（例如 `markdown-it`）渲染 Agent 响应。

#### Scenario: 渲染代码块

- **当** Agent 响应包含代码块时
- **那么** 它被渲染为语法高亮的代码块
