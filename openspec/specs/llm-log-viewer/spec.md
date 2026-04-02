# llm-log-viewer Specification

## Purpose
TBD - created by archiving change add-llm-log-viewer. Update Purpose after archive.
## Requirements
### Requirement: 当前对话的结构化 LLM 日志
系统 SHALL 为当前对话中的大模型调用生成结构化日志，并明确区分请求侧与响应侧内容。

#### Scenario: 记录发送给大模型的请求
- **WHEN** 系统向大模型发起一次调用
- **THEN** 生成一条属于当前对话/任务的结构化请求日志
- **AND** 该日志明确包含送给大模型的参数信息

#### Scenario: 记录大模型返回内容
- **WHEN** 系统收到一次大模型响应
- **THEN** 生成一条属于同一对话/任务的结构化响应日志
- **AND** 该日志明确包含大模型返回的内容

### Requirement: 请求与响应字段区分
结构化 LLM 日志 SHALL 对请求侧参数和响应侧内容使用稳定且可区分的字段模型。

#### Scenario: 请求侧字段清晰
- **WHEN** 用户查看一条请求日志
- **THEN** 可以识别模型名、消息内容或其他送给大模型的关键参数
- **AND** 这些字段不会与响应内容混在同一展示区块中

#### Scenario: 响应侧字段清晰
- **WHEN** 用户查看一条响应日志
- **THEN** 可以识别大模型返回的文本、结构化响应或 tool call 相关内容
- **AND** 这些字段不会被误标为请求参数

### Requirement: 实时更新当前对话日志
系统 SHALL 在当前对话进行过程中实时更新结构化 LLM 日志，而不是只在对话结束后写入最终结果。

#### Scenario: 对话进行中追加日志
- **WHEN** 当前对话中新产生新的 LLM 请求或响应
- **THEN** 当前对话关联的日志列表实时追加或更新对应条目
- **AND** 用户无需刷新页面即可看到变化

#### Scenario: 多轮对话隔离
- **WHEN** 系统存在不同对话或任务的日志
- **THEN** 当前查看器只展示当前对话关联的日志
- **AND** 不混入其他会话的日志条目

### Requirement: 与记忆轨迹查看器交互一致

在为助手消息提供「日志查看」的同一区域或相邻区域，系统 MUST 为存在 mem0 轨迹的回复提供「记忆轨迹」入口，并使用相同的对话框只读展示模式（标题与内容区区分于 LLM 日志）。

#### Scenario: 双入口并列

- **WHEN** 某助手消息同时具有 LLM 日志与 mem0 轨迹
- **THEN** 用户 MUST 能分别打开 LLM 日志对话框与记忆轨迹对话框
- **AND** 两个对话框 MUST 互不覆盖各自数据

#### Scenario: 仅轨迹无 LLM 日志

- **WHEN** 某助手消息仅有 mem0 轨迹而无 LLM 日志条目
- **THEN** 记忆轨迹入口 MUST 仍可用
- **AND** LLM 日志入口 MAY 显示空状态或隐藏（与现有产品约定一致）

