# agent-client

## Purpose

定义前端客户端与 Agent 后端的交互行为，包括任务提交、SSE 订阅、连接处理及 Skill 状态解析。
## Requirements
### Requirement: 任务提交

客户端 MUST 通过 HTTP POST 将用户消息发送到后端（可使用 Vue composables 或等效方式）。

#### Scenario:发送任务

- **当** 用户提交消息时
- **那么** 客户端发送带有消息内容的 `POST /api/tasks` 请求
- **并且** 处理响应（成功或错误）

### Requirement: 实时更新

客户端 MUST 订阅 Server-Sent Events (SSE) 以获取 Agent 更新。

#### Scenario:订阅事件

- **当** 任务成功提交时
- **那么** 客户端打开到 `/api/tasks/{id}/events` 的 `EventSource` 连接
- **并且** 监听 `message` 事件
- **并且** 根据事件数据更新 UI 或响应式状态（Vue `ref` / `reactive`）

### Requirement: 连接处理

客户端 MUST 处理连接错误和重连。

#### Scenario:连接断开

- **当** SSE 连接中断时
- **那么** 客户端尝试自动重连或通知用户

### Requirement: 流式事件解析

前端客户端 MUST 能从任务 SSE 中解析 assistant 文本内容与 Skill 调用状态事件，并分别写入消息状态。

#### Scenario: 流式事件解析

- **WHEN** 任务 SSE 推送多种 JSON 事件（含助手内容、工具状态、LLM 日志、mem0 轨迹等）
- **THEN** 客户端 MUST 将各事件路由到对应的消息字段或 UI 状态
- **AND** assistant 文本与工具状态行为与修改前一致

### Requirement: 多 Skill 顺序维护

前端客户端 MUST 为单条 assistant 消息维护有序的 Skill 调用列表，并支持同一 Skill 的增量状态更新。

#### Scenario:首次收到 Skill 事件

- **当** 某个 Skill 首次出现在当前回复的事件流中
- **那么** 客户端在该消息的 Skill 列表末尾追加一条记录

#### Scenario:收到同一 Skill 的后续状态

- **当** 客户端再次收到同一 Skill 的更新事件
- **那么** 客户端更新已有 Skill 记录的状态
- **并且** 不新增重复条目

### Requirement: Thinking 状态收敛

前端客户端 MUST 在流式会话生命周期内正确维护 thinking 状态，避免 loading 与 Skill 状态残留。

#### Scenario:正常完成

- **当** SSE 收到完成事件
- **那么** 客户端结束 thinking 状态
- **并且** 保留最终 assistant 文本与 Skill 完成态

#### Scenario:请求失败

- **当** SSE 连接失败或任务执行失败
- **那么** 客户端结束 thinking 状态
- **并且** 不再继续追加 Skill 或文本更新

### Requirement: 层级化 Skill 轨迹解析

前端客户端 MUST 能解析带有父子关系的 skill/tool 事件，并将自主规划 skill 的内部子工具轨迹关联到对应外层 skill。

#### Scenario: 解析外层与子工具关系

- **WHEN** SSE 事件中包含自主规划 skill 主条目及其子工具轨迹
- **THEN** 客户端识别外层 skill 与子工具之间的归属关系
- **AND** 将子工具轨迹挂载到对应的外层 skill 下

#### Scenario: 维护子工具顺序

- **WHEN** 同一个自主规划 skill 在一次回复中连续触发多个子工具
- **THEN** 客户端按实际接收顺序维护这些子工具条目
- **AND** 后续状态更新不会打乱既有顺序

#### Scenario: 兼容旧版单层事件

- **WHEN** SSE 中只包含现有单层 skill 事件而没有父子关系字段
- **THEN** 客户端继续按现有方式解析
- **AND** 不因缺少新字段而导致消息渲染失败

### Requirement: 当前对话日志状态维护
前端客户端 SHALL 为当前对话维护结构化 LLM 日志状态，并将其与聊天会话关联。

#### Scenario: 接收日志更新
- **WHEN** 前端收到当前对话的结构化 LLM 日志事件或接口响应
- **THEN** 客户端将日志写入当前对话的响应式状态
- **AND** 不影响已有 assistant 文本与 Skill 状态更新逻辑

#### Scenario: 会话切换隔离日志
- **WHEN** 用户切换到其他对话或发起新的任务
- **THEN** 客户端仅展示与当前会话关联的日志状态
- **AND** 不复用上一轮对话的日志内容

### Requirement: 日志增量更新解析
前端客户端 SHALL 能解析结构化的 LLM 请求/响应日志更新，并按类型更新日志列表。

#### Scenario: 解析请求日志事件
- **WHEN** 客户端收到一条 LLM 请求日志更新
- **THEN** 客户端识别其为请求侧日志
- **AND** 将其写入当前对话日志列表的对应位置

#### Scenario: 解析响应日志事件
- **WHEN** 客户端收到一条 LLM 响应日志更新
- **THEN** 客户端识别其为响应侧日志
- **AND** 将其与同一轮调用的请求日志维持可理解的顺序关系

### Requirement: 用户 LLM 设置界面

前端客户端 MUST 提供界面供登录用户配置 OpenAI 兼容的 API base URL、模型名称与 API Key，并支持保存与更新。

#### Scenario: 打开设置并保存

- **WHEN** 用户在设置界面填写 base URL、模型名与 API Key 并提交
- **THEN** 客户端调用后端保存接口
- **AND** 成功后在界面展示已保存状态（不含完整 Key 明文）

#### Scenario: 掩码展示

- **WHEN** 用户再次打开设置且此前已保存过 API Key
- **THEN** 客户端展示「已配置」或掩码提示
- **AND** 不要求用户重新输入 Key 除非用户选择更换

### Requirement: 注册与资料中的头像交互

客户端 MUST 在注册与用户资料流程中提供 emoji 选择能力，并提供可选的「自动生成」操作；不得在无用户操作下自动请求 LLM 生成头像。

#### Scenario: 默认选择 emoji

- **WHEN** 用户完成注册或编辑资料且仅使用 emoji 选择器
- **THEN** 客户端不发送静默 LLM 头像生成请求

#### Scenario: 显式生成

- **WHEN** 用户点击「自动生成」
- **THEN** 客户端调用后端头像生成接口
- **AND** 根据响应更新预览或头像字段

#### Scenario: 无 Key 时禁用自动生成

- **WHEN** 当前解析得到的用于 LLM 的 API Key 为空（用户设置与环境均未提供）
- **THEN** 「自动生成」按钮处于禁用状态或等价不可交互
- **AND** 用户仍可使用 emoji 选择器

### Requirement: 解析并挂载 mem0 轨迹事件

客户端 MUST 能从任务 SSE 中识别 mem0 轨迹事件类型，将条目合并到当前助手消息的状态中（与 `llmLogs` 并列的独立列表），并在 UI 中供记忆轨迹查看器使用。

#### Scenario: 收到轨迹事件

- **WHEN** SSE `message` 数据中包含带约定 `type` 的 mem0 轨迹事件且 `sessionId` 与当前任务一致
- **THEN** 客户端 MUST 将该轨迹追加或更新到当前助手消息关联的轨迹列表
- **AND** MUST 不在无关会话的消息上显示该条目

#### Scenario: 类型守卫

- **WHEN** 数据缺少必要字段（如 `sessionId` 或操作类型）
- **THEN** 客户端 MUST 跳过该条并记录可观测错误（如控制台）而不中断流处理

### Requirement: Skill 可用性设置界面

前端客户端 MUST 为已登录用户提供 Skill 可用性管理界面：以列表展示当前后端返回的**可配置（非文件系统）** Skill（至少包含可区分项的名称与稳定 id），并允许用户切换每项的可用状态；保存时调用后端持久化接口，加载设置时调用读取接口。客户端 MUST NOT 在未登录状态下调用上述读写接口。

#### Scenario: 展示列表并切换状态

- **WHEN** 用户打开 Skill 可用性设置视图（例如设置页中的「扩展 Skill 可用性」区块）
- **THEN** 客户端请求当前用户的禁用列表及可配置 Skill 清单
- **AND** 用户切换某项为关闭后保存，客户端提交更新后的禁用 id 列表

#### Scenario: 与任务创建解耦

- **WHEN** 用户未打开该设置区块而直接聊天
- **THEN** 客户端不阻止任务提交
- **AND** 后端按已持久化的可用性规则绑定工具（默认全部可用）

#### Scenario: 未登录

- **WHEN** 用户未登录
- **THEN** 客户端将用户重定向到登录页或不展示依赖登录的设置（与现有设置页策略一致）
- **AND** 客户端不发起 Skill 可用性读写请求

