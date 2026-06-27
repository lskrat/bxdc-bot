# Sub-Agent Think Blocks - 技术设计

## 1. 整体架构

### 1.1 数据流
```
用户消息 → 主 Agent → execute-skill 工具 → 子 Agent 创建
                                         ↓
                                  think_start 事件（SSE）
                                         ↓
                                  子 Agent 执行（流式）
                                         ↓
                                  agent_text 事件（SSE）
                                         ↓
                                  子 Agent 完成
                                         ↓
                                  think_end 事件（SSE）
                                         ↓
                                  前端渲染思考块
```

### 1.2 关键模块
- **execute-skill.ts**：子 Agent 执行入口，发射 think_start/agent_text/think_end 事件
- **tool-trace-context.ts**：SSE 事件定义和发射函数
- **agent.ts**：LangGraph interrupt 机制，提取子 Agent 输出
- **useChat.ts**：前端事件处理，ThinkBlock 数据结构
- **MessageList.vue**：思考块渲染，inline 渲染逻辑

## 2. 事件定义（tool-trace-context.ts）

### 2.1 ThinkStartEvent
```typescript
export interface ThinkStartEvent {
  type: "think_start";
  thinkId: string;        // 唯一标识思考块
  parentToolId: string;   // 父工具 ID（execute-skill 工具调用 ID）
  parentToolName: string; // 父工具名称（execute-skill）
  displayName: string;    // 子 Agent 显示名称（如"天气查询 Agent"）
}
```

### 2.2 AgentTextEvent
```typescript
export interface AgentTextEvent {
  type: "agent_text";
  thinkId: string;        // 对应的思考块 ID
  role: "sub_agent" | "main_agent"; // 子 Agent 或主 Agent
  content: string;        // AI 文本内容（流式推送）
  replace?: boolean;      // 是否替换整个思考块内容（默认追加）
}
```

### 2.3 ThinkEndEvent
```typescript
export interface ThinkEndEvent {
  type: "think_end";
  thinkId: string;        // 对应的思考块 ID
  parentToolId: string;   // 父工具 ID
  status: "completed" | "failed"; // 执行状态
}
```

### 2.4 事件发射函数
```typescript
export function emitThinkStartEvent(thinkId: string, parentToolId: string, parentToolName: string, displayName: string): void

export function emitAgentTextEvent(thinkId: string, role: "sub_agent" | "main_agent", content: string, replace?: boolean): void

export function emitThinkEndEvent(thinkId: string, parentToolId: string, status: "completed" | "failed"): void
```

## 3. 子 Agent 执行逻辑（execute-skill.ts）

### 3.1 执行流程
```typescript
async function executeSkillWithThinkBlock(skillIds: number[], userInput: string): Promise<string> {
  // 1. 创建子 Agent 实例
  const subAgent = await createSubAgent(skillIds);
  
  // 2. 发射 think_start 事件
  const thinkId = randomUUID();
  const parentToolId = getActiveParentToolId();
  emitThinkStartEvent(thinkId, parentToolId, "execute-skill", "子 Agent 执行");
  
  // 3. 流式执行子 Agent
  const stream = await subAgent.stream({ input: userInput });
  
  // 4. 遍历流式输出，发射 agent_text 事件
  for await (const chunk of stream) {
    if (chunk.agent?.messages) {
      for (const msg of chunk.agent.messages) {
        if (msg.type === "AIMessage" && msg.content) {
          emitAgentTextEvent(thinkId, "sub_agent", msg.content);
        }
      }
    }
  }
  
  // 5. 发射 think_end 事件
  emitThinkEndEvent(thinkId, parentToolId, "completed");
  
  // 6. 返回最终结果
  return formatSkillResult(stream);
}
```

### 3.2 Interrupt 机制（LangGraph）
```typescript
function extractInterruptEntries(payload: unknown): Array<{ value?: unknown }> {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const arr = p[INTERRUPT] ?? p.__interrupt__;
  return Array.isArray(arr) ? arr : [];
}

function getMessagesFromPayload(payload: any): any[] {
  if (!payload || typeof payload !== 'object') return [];
  return [
    ...asArray2(payload.agent?.messages),
    ...asArray2(payload.tools?.messages),
    ...asArray2(payload.messages),
  ];
}
```

## 4. 前端数据结构（useChat.ts）

### 4.1 ThinkBlock 接口
```typescript
export interface ThinkBlock {
  id: string;             // 唯一标识（thinkId）
  parentToolId: string;   // 父工具 ID
  displayName: string;    // 子 Agent 显示名称
  content: string;        // AI 文本内容（累积）
  status: 'running' | 'completed' | 'failed'; // 执行状态
  createdAt: number;      // 创建时间（think_start）
  completedAt?: number;   // 完成时间（think_end）
}
```

### 4.2 ContentSegment 接口（inline 渲染）
```typescript
export type ContentSegment =
  | { type: 'text'; text: string }
  | { type: 'think'; thinkId: string }

export interface Message {
  // ... existing fields
  thinkBlocks?: ThinkBlock[]
  contentSegments?: ContentSegment[]
}
```

### 4.3 事件处理逻辑
```typescript
// think_start 事件处理
function handleThinkStart(data: ThinkStartEvent): void {
  const thinkBlock: ThinkBlock = {
    id: data.thinkId,
    parentToolId: data.parentToolId,
    displayName: data.displayName,
    content: '',
    status: 'running',
    createdAt: Date.now(),
  };
  
  updateLastAssistantMessage((msg) => ({
    ...msg,
    thinkBlocks: [...(msg.thinkBlocks ?? []), thinkBlock],
    // 初始化 contentSegments（插入 think 块）
    contentSegments: [...(msg.contentSegments ?? []), { type: 'think', thinkId: data.thinkId }],
  }));
}

// agent_text 事件处理
function handleAgentText(data: AgentTextEvent): void {
  updateLastAssistantMessage((msg) => {
    const thinkBlocks = (msg.thinkBlocks ?? []).map((tb) =>
      tb.id === data.thinkId
        ? { ...tb, content: data.replace ? data.content : tb.content + data.content }
        : tb
    );
    return { ...msg, thinkBlocks };
  });
}

// think_end 事件处理
function handleThinkEnd(data: ThinkEndEvent): void {
  updateLastAssistantMessage((msg) => {
    const thinkBlocks = (msg.thinkBlocks ?? []).map((tb) =>
      tb.id === data.thinkId
        ? { ...tb, status: data.status, completedAt: Date.now() }
        : tb
    );
    return { ...msg, thinkBlocks };
  });
}
```

## 5. 前端渲染逻辑（MessageList.vue）

### 5.1 inline 渲染
```vue
<template>
  <div class="message-content">
    <!-- 遍历 contentSegments -->
    <template v-for="seg in message.contentSegments" :key="seg.type === 'text' ? seg.text : seg.thinkId">
      <!-- 文本段 -->
      <TChatContent v-if="seg.type === 'text'" role="assistant" :content="{ type: 'markdown', data: seg.text }" />
      
      <!-- think 块段 -->
      <div v-else-if="seg.type === 'think'" class="think-block" :class="`think-block--${thinkBlock.status}`">
        <div class="think-block-header" @click="toggleThinkBlockExpansion(seg.thinkId)">
          <span class="think-block-arrow">{{ isThinkBlockExpanded(seg.thinkId) ? '▾' : '▸' }}</span>
          <span class="think-block-title">{{ thinkBlock.displayName }}</span>
          <span class="think-block-status">{{ thinkBlock.status }}</span>
        </div>
        <div v-show="isThinkBlockExpanded(seg.thinkId)" class="think-block-body">
          <TChatContent role="assistant" :content="{ type: 'markdown', data: thinkBlock.content }" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
function isThinkBlockExpanded(thinkId: string): boolean {
  return expandedThinkBlockKeys.value.has(thinkId);
}

function toggleThinkBlockExpansion(thinkId: string): void {
  const next = new Set(expandedThinkBlockKeys.value);
  if (next.has(thinkId)) {
    next.delete(thinkId);
  } else {
    next.add(thinkId);
  }
  expandedThinkBlockKeys.value = next;
}
</script>
```

### 5.2 状态样式
```css
.think-block--running .think-block-status {
  color: #1890ff;
  animation: pulse 1.5s infinite;
}

.think-block--completed .think-block-status {
  color: #52c41a;
}

.think-block--failed .think-block-status {
  color: #ff4d4f;
}

.think-block-arrow {
  transition: transform 0.2s;
}

.think-block-header {
  cursor: pointer;
  user-select: none;
}
```

## 6. 子 Agent 提示词设计（prompts/）

### 6.1 中文提示词
```typescript
export const SUB_AGENT_THINK_PROMPT_ZH = `
你是一个执行特定技能的子 Agent。你的任务是：
1. 理解用户的请求意图
2. 使用提供的工具完成任务
3. 输出你的思考过程和最终结果

输出格式：
- **思考过程**：详细说明你的推理步骤、为什么选择某个工具、参数如何设置
- **执行结果**：工具调用后的结果，是否满足用户需求

注意事项：
- 保持思考过程的清晰和逻辑性
- 如果任务失败，说明原因和可能的解决方案
- 不要隐瞒任何推理步骤，让用户了解完整过程
`;
```

### 6.2 英文提示词
```typescript
export const SUB_AGENT_THINK_PROMPT_EN = `
You are a sub-agent executing a specific skill. Your task is to:
1. Understand the user's request intent
2. Use the provided tools to complete the task
3. Output your thought process and final result

Output format:
- **Thought process**: Explain your reasoning steps, why you chose a certain tool, how you set parameters
- **Execution result**: The result after tool invocation, whether it meets the user's requirements

Notes:
- Keep your thought process clear and logical
- If the task fails, explain the reason and possible solutions
- Don't hide any reasoning steps, let the user understand the complete process
`;
```

## 7. 性能优化

### 7.1 文本长度限制
- **前端**：每个思考块文本上限 ~50KB，超长内容截断并显示提示
- **后端**：agent_text 事件单次推送限制在 ~10KB，大文本分多次推送

### 7.2 SSE 事件去重
- 前端按 thinkId 聚合事件，避免重复渲染
- 使用 Map 结构缓存思考块状态，快速查找和更新

### 7.3 折叠状态持久化
- **不持久化**：折叠状态仅在前端会话内保持，不写入 localStorage
- **默认展开**：新建思考块默认展开，running 状态完成后自动折叠（可选）

## 8. 错误处理

### 8.1 子 Agent 无输出
- 思考块内容为空，仅显示状态标记（completed/failed）
- 不影响主 Agent 的正常回答

### 8.2 SSE 连接中断
- 思考块状态标记为 "failed"
- 保留已接收的文本内容，便于调试

### 8.3 think_end 未收到
- 思考块一直保持 "running" 状态
- 用户可手动折叠，不影响后续对话

## 9. 测试验证

### 9.1 基本功能
- 子 Agent 执行时创建思考块
- 流式推送 AI 文本到思考块
- 完成时标记状态为 completed

### 9.2 失败场景
- 子 Agent 执行失败，思考块标记为 failed
- SSE 连接中断，思考块保留已接收内容

### 9.3 性能测试
- 大文本输出（>50KB），前端截断并显示提示
- 多个思考块同时存在，渲染性能正常

### 9.4 兼容性测试
- 旧对话历史不受影响，思考块仅在新对话中展示
- 浏览器兼容性（Chrome、Firefox、Safari、Edge）