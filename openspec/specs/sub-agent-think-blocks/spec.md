# Sub-Agent Think Blocks - 功能规范

## 概述

Sub-Agent Think Blocks（子 Agent 思考块）功能为子 Agent 的执行过程提供可视化思考过程展示。用户可以实时看到子 Agent 的 AI 文本输出、推理过程，增强透明度和信任感。

## Requirements

### REQ-1: 实时思考展示

**Requirement**: 子 Agent 开始执行时，前端创建可折叠的思考区域，实时流式展示子 Agent 的 AI 文本。

**验证标准**:
- 子 Agent 执行时，前端出现思考块（Think Block）
- 思考块内实时流式显示子 Agent 的 AI 文本
- 思考块有明确的"思考过程"标识

**实现位置**:
- `backend/agent-core/src/tools/execute-skill.ts` — 发射 think_start、agent_text 事件
- `frontend/src/composables/useChat.ts` — ThinkBlock 数据结构、事件处理
- `frontend/src/components/MessageList.vue` — 思考块渲染

### REQ-2: Inline 渲染

**Requirement**: 思考块与主 Agent 的回答文本穿插排列，形成连贯的对话流。

**验证标准**:
- 思考块内嵌在主 Agent 的回答文本中（不单独成块）
- contentSegments 数组包含 text 和 think 类型段
- 文本段和思考块段穿插排列，形成连贯对话流

**实现位置**:
- `frontend/src/composables/useChat.ts` — ContentSegment 类型、contentSegments 字段
- `frontend/src/components/MessageList.vue` — inline 渲染逻辑

### REQ-3: 状态标记

**Requirement**: 思考块有明确的状态标识（running、completed、failed），让用户了解执行进度。

**验证标准**:
- 思考块有 running 状态（绿色，动画脉冲）
- 思考块有 completed 状态（绿色，静态）
- 思考块有 failed 状态（红色，静态）
- 状态标记清晰可读

**实现位置**:
- `frontend/src/composables/useChat.ts` — ThinkBlock.status 字段
- `frontend/src/components/MessageList.vue` — 状态样式、状态渲染

### REQ-4: 可折叠交互

**Requirement**: 用户可以折叠/展开思考块，避免长内容干扰阅读。

**验证标准**:
- 用户点击思考块标题，折叠/展开思考块
- 折叠时只显示标题和状态标记
- 展开时显示完整 AI 文本内容
- 折叠状态在前端会话内保持

**实现位置**:
- `frontend/src/components/MessageList.vue` — expandedThinkBlockKeys、toggleThinkBlockExpansion

### REQ-5: 多语言提示

**Requirement**: 子 Agent 使用独立的系统提示词，支持中英文双语，引导子 Agent 输出结构化思考内容。

**验证标准**:
- 子 Agent 使用专用提示词（不同于主 Agent）
- 提示词中明确要求输出"思考过程"和"执行结果"
- 支持中英文双语提示词

**实现位置**:
- `backend/agent-core/src/prompts/en.ts` — SUB_AGENT_THINK_PROMPT_EN
- `backend/agent-core/src/prompts/zh.ts` — SUB_AGENT_THINK_PROMPT_ZH
- `backend/agent-core/src/tools/execute-skill.ts` — 加载子 Agent 提示词

### REQ-6: LangGraph Interrupt 支持

**Requirement**: 支持 LangGraph interrupt 机制，提取子 Agent 的中断输出。

**验证标准**:
- 从 payload 中提取 interrupt 条目
- interrupt 输出正确显示在思考块中
- 处理 agent/tools/messages 多层级输出

**实现位置**:
- `backend/agent-core/src/tools/execute-skill.ts` — extractInterruptEntries、getMessagesFromPayload

### REQ-7: 性能优化

**Requirement**: 思考块文本内容限制在合理范围，避免大文本影响渲染性能。

**验证标准**:
- 前端限制每个思考块文本上限 ~50KB
- 超长内容截断并显示提示
- SSE 单次推送限制在 ~10KB

**实现位置**:
- `frontend/src/composables/useChat.ts` — 文本长度检查
- `backend/agent-core/src/tools/tool-trace-context.ts` — sanitizeToolResultForTrace

### REQ-8: 错误处理

**Requirement**: 子 Agent 执行失败时，思考块保留所有推理过程，便于调试。

**验证标准**:
- 子 Agent 执行失败，思考块标记为 failed
- 已接收的 AI 文本保留在思考块中
- SSE 连接中断，思考块标记为 failed，保留已接收内容

**实现位置**:
- `frontend/src/composables/useChat.ts` — handleThinkEnd、handleStreamError
- `backend/agent-core/src/tools/execute-skill.ts` — 异常处理

## Constraints

### CON-1: 不修改 gateway

思考块功能完全在 agent-core 层实现，gateway 侧无需修改。

### CON-2: 不持久化到数据库

思考块数据仅在前端和 SSE 流中存在，不持久化到数据库。

### CON-3: 向后兼容

现有对话历史不受影响，思考块仅在新对话中展示。

### CON-4: 不新增第三方依赖

不引入新的 npm 包或外部库，复用现有的 SSE、Vue、LangGraph 工具。

### CON-5: JDK 1.8 兼容

虽然功能在 agent-core（NestJS）实现，但遵循项目 AGENTS.md §5.4 规范，不使用 JDK 1.8 不支持的特性（此处无 Java 代码改动）。

## Interface

### SSE Events

#### think_start

```json
{
  "type": "think_start",
  "thinkId": "uuid-string",
  "parentToolId": "tool-call-id",
  "parentToolName": "execute-skill",
  "displayName": "子 Agent 执行"
}
```

#### agent_text

```json
{
  "type": "agent_text",
  "thinkId": "uuid-string",
  "role": "sub_agent",
  "content": "AI text content",
  "replace": false
}
```

#### think_end

```json
{
  "type": "think_end",
  "thinkId": "uuid-string",
  "parentToolId": "tool-call-id",
  "status": "completed"
}
```

### Frontend Data Structures

#### ThinkBlock

```typescript
interface ThinkBlock {
  id: string;
  parentToolId: string;
  displayName: string;
  content: string;
  status: 'running' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
}
```

#### ContentSegment

```typescript
type ContentSegment =
  | { type: 'text'; text: string }
  | { type: 'think'; thinkId: string }
```

#### Message Extension

```typescript
interface Message {
  // ... existing fields
  thinkBlocks?: ThinkBlock[];
  contentSegments?: ContentSegment[];
}
```

## Examples

### Example 1: 正常执行流程

1. 用户发送消息："查询北京天气"
2. 主 Agent 调用 execute-skill 工具，传入天气查询 skillId
3. 子 Agent 开始执行，发射 `think_start` 事件
4. 前端创建思考块，状态为 running
5. 子 Agent 输出："正在查询天气数据..."
6. 前端流式显示在思考块中
7. 子 Agent 完成，发射 `think_end` 事件，状态为 completed
8. 前端标记思考块为 completed，用户可折叠

### Example 2: 执行失败

1. 用户发送消息："执行 Python 脚本"
2. 主 Agent 调用 execute-skill 工具，传入 Python skillId
3. 子 Agent 开始执行，发射 `think_start` 事件
4. 子 Agent 输出："正在准备 Python 环境..."
5. 子 Agent 执行失败（脚本错误）
6. 发射 `think_end` 事件，状态为 failed
7. 前端标记思考块为 failed，保留已接收内容

### Example 3: SSE 连接中断

1. 子 Agent 正在执行，思考块显示部分内容
2. SSE 连接突然中断
3. 前端检测到连接中断，触发 `handleStreamError`
4. 思考块标记为 failed，保留已接收内容
5. 用户可查看部分推理过程

## Testing Strategy

### Unit Tests

- `extractInterruptEntries` 函数测试（多种 payload 格式）
- `getMessagesFromPayload` 函数测试（多层级消息提取）
- ThinkBlock 事件处理函数测试

### Integration Tests

- 子 Agent 执行完整流程测试
- SSE 流式推送测试
- 思考块渲染测试

### Manual Tests

- 用户交互测试（折叠/展开）
- 长文本测试（>50KB）
- 多浏览器兼容性测试（Chrome、Firefox、Safari、Edge）

## Deployment Notes

- 不需要数据库 schema 变更
- 不需要 gateway 侧配置变更
- 仅需前端和 agent-core 代码部署
- 向后兼容，无破坏性变更