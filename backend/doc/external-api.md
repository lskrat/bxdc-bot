# 外部系统接入 API 文档

## 概述

外部系统通过 `POST /api/agent-chat/external` 端点调用平台的 AI 对话能力。每个外部用户（`callerId`）拥有独立的长期记忆和对话上下文，互不干扰。

## 端点

```
POST {平台地址}/api/agent-chat/external
Content-Type: application/json
```

## 鉴权

所有请求通过 `apiKey` 字段鉴权，无需 `X-User-Id` 请求头。`apiKey` 由平台管理员在对话发布时生成。

## 请求参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `apiKey` | string | 是 | - | 管理员发布的 API 密钥 |
| `instruction` | string | 是 | - | 用户指令/问题 |
| `callerId` | string | 是 | - | 外部系统的用户标识（同一 `(apiKey, callerId)` 组合的对话上下文会持续） |
| `apiClient` | string | 否 | - | 来源系统标识（如 `ecommerce`、`erp`），用于平台统计 |
| `streaming` | boolean | 否 | `false` | `true` 启用 SSE 流式输出，`false` 返回 JSON |

### 请求示例

```json
{
  "apiKey": "c_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "instruction": "帮我查一下订单 #12345 的状态",
  "callerId": "user123",
  "apiClient": "ecommerce",
  "streaming": false
}
```

## 响应格式

### 非流式（`streaming: false`，默认）

Content-Type: `application/json`

```json
{
  "conversationId": "abc-def-ghi-uuid",
  "reply": "订单 #12345 状态为：已发货，物流单号 SF1234567890，预计明日送达。",
  "toolCalls": [
    {
      "count": 1
    }
  ],
  "durationMs": 3200
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `conversationId` | string | 克隆对话 ID（该用户的独立对话标识） |
| `reply` | string | AI 的完整回复文本 |
| `toolCalls` | array | Skill 调用汇总（当前仅返回调用次数 `count`） |
| `durationMs` | number | 请求处理耗时（毫秒） |

### 流式（`streaming: true`）

Content-Type: `text/event-stream`

```
data: {"type":"agent_message","content":"我"}

data: {"type":"agent_message","content":"来帮你查"}

data: {"type":"agent_message","content":"一下订单状态..."}

data: {"type":"tool_start","toolName":"api_call","status":"started"}

data: {"type":"tool_result","toolName":"api_call","status":"completed"}

data: {"type":"agent_message","content":"订单 #12345 状态为：已发货"}

data: {"type":"agent_finish","conversationId":"abc-def-ghi-uuid","reply":"完整回复文本","toolCalls":[{"count":1}],"durationMs":3200}

data: [DONE]
```

**SSE 事件类型：**

| 事件类型 | 说明 |
|---------|------|
| `agent_message` | AI 回复的流式文本片段（增量追加） |
| `tool_start` | Skill 开始执行 |
| `tool_result` | Skill 执行完成 |
| `agent_finish` | 最终汇总（完整回复 + Skill 调用数据 + 耗时） |
| `[DONE]` | 流结束信号 |

**错误事件（仅在流式模式下）：**

```
data: {"type":"error","message":"错误描述"}
```

### 错误响应

| HTTP 状态码 | 场景 |
|-------------|------|
| 400 | `instruction` 为空或 `callerId` 缺失 |
| 401 | `apiKey` 无效 |
| 404 | 对话未发布或已取消 |
| 502 | Agent 服务不可用 |

```json
{
  "error": "Invalid API key"
}
```

## 调用说明

### 1. 幂等性

同一 `(apiKey, callerId)` 组合的首次调用会触发：自动创建平台用户 → 克隆对话 → 写入租户映射。

后续相同组合的调用直接复用已有的用户和对话，不会重复创建。

### 2. 对话上下文

- 同一个 `callerId` 对同一模板对话的多轮调用共享上下文（AI 记得之前的对话内容）
- 不同 `callerId` 之间的上下文完全隔离

### 3. 长期记忆

每个 `callerId` 拥有独立的长期记忆（由 Mem0 服务提供），AI 会记住用户偏好和历史信息。

## curl 示例

### 非流式调用

```bash
curl -X POST "http://{平台地址}/api/agent-chat/external" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "c_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "instruction": "帮我查订单 #12345",
    "callerId": "user123",
    "apiClient": "ecommerce"
  }'
```

### 流式调用

```bash
curl -X POST "http://{平台地址}/api/agent-chat/external" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "c_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "instruction": "帮我查订单 #12345",
    "callerId": "user123",
    "streaming": true
  }' \
  -N
```
