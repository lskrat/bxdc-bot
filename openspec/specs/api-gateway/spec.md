# api-gateway

## Purpose

定义 API 网关的 CORS 支持、任务事件流的转发与 Skill 状态事件格式，以及会话结束信号的发送规则。

## Requirements

### Requirement: CORS 支持

API 网关 MUST 支持前端应用程序的跨源资源共享 (CORS)。

#### Scenario: 开发环境

- **当** 请求来自 `http://localhost:5173`（Vite 开发服务器）时
- **那么** 服务器响应 `Access-Control-Allow-Origin: http://localhost:5173`
- **并且** 允许方法 `GET`、`POST`、`OPTIONS`
- **并且** 允许头信息 `Content-Type`、`Authorization`

#### Scenario: 生产环境

- **当** 请求来自配置的生产域时
- **那么** 服务器响应相应的 `Access-Control-Allow-Origin` 头信息

### Requirement:任务事件流转发

任务事件流 MUST 向前端持续输出可消费的结构化事件，除了 assistant 文本外，还要包含 Skill 调用状态信息。

#### Scenario: 转发文本事件

- **当** Agent 产生新的回复文本事件
- **那么** 任务 SSE 将文本事件发送给前端客户端

#### Scenario: 转发 Skill 状态事件

- **当** Agent 产生 Skill 调用开始、进行中、完成或失败事件
- **那么** 任务 SSE 将包含 Skill 名称与状态字段的结构化事件发送给前端客户端

### Requirement:Skill 状态字段一致性

任务事件流中的 Skill 状态事件 MUST 使用稳定的数据字段，便于前端统一解析。

#### Scenario: Skill 事件字段完整

- **当** 网关向前端发送 Skill 状态事件
- **那么** 事件中包含可识别的事件类型
- **并且** 包含 Skill 名称
- **并且** 包含当前状态值

#### Scenario: 多个 Skill 连续执行

- **当** 同一任务在一次回复中连续触发多个 Skill
- **那么** 事件流按实际执行顺序输出对应事件
- **并且** 前端可依据顺序恢复完整的调用轨迹

### Requirement:会话结束信号

任务事件流 MUST 在任务结束时发送明确的完成信号，使前端能够收敛 loading 状态。

#### Scenario: 正常结束

- **当** Agent 完成当前任务
- **那么** 网关发送完成事件
- **并且** 之后不再继续发送新的 Skill 状态或文本事件
