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

#### Scenario:解析 assistant 文本

- **当** SSE 事件中包含 assistant 文本内容
- **那么** 客户端更新当前 assistant 消息正文
- **并且** 不影响已记录的 Skill 调用状态列表

#### Scenario:解析 Skill 状态事件

- **当** SSE 事件中包含结构化的 Skill 调用状态
- **那么** 客户端提取 Skill 名称与状态
- **并且** 将其关联到当前 assistant 消息

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
