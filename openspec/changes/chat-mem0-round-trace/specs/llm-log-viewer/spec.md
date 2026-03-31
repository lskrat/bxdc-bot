# llm-log-viewer (delta)

## ADDED Requirements

### Requirement: 与记忆轨迹查看器交互一致

在为助手消息提供「日志查看」的同一区域或相邻区域，系统 SHOULD 为存在 mem0 轨迹的回复提供「记忆轨迹」入口，并使用相同的对话框只读展示模式（标题与内容区区分于 LLM 日志）。

#### Scenario: 双入口并列

- **WHEN** 某助手消息同时具有 LLM 日志与 mem0 轨迹
- **THEN** 用户 MUST 能分别打开 LLM 日志对话框与记忆轨迹对话框
- **AND** 两个对话框 MUST 互不覆盖各自数据

#### Scenario: 仅轨迹无 LLM 日志

- **WHEN** 某助手消息仅有 mem0 轨迹而无 LLM 日志条目
- **THEN** 记忆轨迹入口 MUST 仍可用
- **AND** LLM 日志入口 MAY 显示空状态或隐藏（与现有产品约定一致）
