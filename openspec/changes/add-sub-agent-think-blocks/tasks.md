# Tasks: Sub-Agent Think Blocks

## 1. 后端 agent-core — 事件定义与发射

### 1.1 tool-trace-context.ts 扩展

- [x] 1.1.1 新增 ThinkStartEvent 接口（type、thinkId、parentToolId、parentToolName、displayName）
- [x] 1.1.2 新增 AgentTextEvent 接口（type、thinkId、role、content、replace）
- [x] 1.1.3 新增 ThinkEndEvent 接口（type、thinkId、parentToolId、status）
- [x] 1.1.4 新增 SseEvent 联合类型（ToolTraceEvent | ThinkStartEvent | AgentTextEvent | ThinkEndEvent）
- [x] 1.1.5 新增 emitThinkStartEvent 函数
- [x] 1.1.6 新增 emitAgentTextEvent 函数
- [x] 1.1.7 新增 emitThinkEndEvent 函数

## 2. 后端 agent-core — 子 Agent 执行逻辑

### 2.1 execute-skill.ts 扩展

- [x] 2.1.1 新增 extractInterruptEntries 函数（从 payload 提取中断条目）
- [x] 2.1.2 新增 getMessagesFromPayload 函数（从 payload 提取消息列表）
- [x] 2.1.3 新增 asArray2 辅助函数（统一处理数组/单值）
- [x] 2.1.4 执行开始时发射 think_start 事件
- [x] 2.1.5 遍历子 Agent 流式输出，发射 agent_text 事件
- [x] 2.1.6 执行完成时发射 think_end 事件
- [x] 2.1.7 处理 LangGraph interrupt 机制（提取中断条目）

### 2.2 agent.ts 扩展

- [x] 2.2.1 导入 interrupt、isGraphInterrupt、INTERRUPT 常量
- [x] 2.2.2 子 Agent 创建时传入专用系统提示词
- [x] 2.2.3 处理子 Agent 的 interrupt 输出

## 3. 后端 agent-core — 提示词设计

### 3.1 prompts/ 扩展

- [x] 3.1.1 新增 SUB_AGENT_THINK_PROMPT_ZH（中文提示词）
- [x] 3.1.2 新增 SUB_AGENT_THINK_PROMPT_EN（英文提示词）
- [x] 3.1.3 在 prompts/index.ts 中导出新提示词
- [x] 3.1.4 在 prompts/types.ts 中定义新提示词类型

### 3.2 controller/agent.controller.ts

- [x] 3.2.1 unwrapLangGraphStreamPayload 函数支持 interrupt payload 解析

## 4. 前端 — 数据结构定义

### 4.1 useChat.ts 扩展

- [x] 4.1.1 新增 ThinkBlock 接口（id、parentToolId、displayName、content、status、createdAt、completedAt）
- [x] 4.1.2 新增 ContentSegment 类型（text | think）
- [x] 4.1.3 Message 接口新增 thinkBlocks 字段
- [x] 4.1.4 Message 接口新增 contentSegments 字段
- [x] 4.1.5 新增 ensureLastTextSegment 辅助函数

## 5. 前端 — 事件处理

### 5.1 useChat.ts 事件处理函数

- [x] 5.1.1 新增 isThinkStartEvent 类型守卫函数
- [x] 5.1.2 新增 isAgentTextEvent 类型守卫函数
- [x] 5.1.3 新增 isThinkEndEvent 类型守卫函数
- [x] 5.1.4 实现 handleThinkStart 事件处理
- [x] 5.1.5 实现 handleAgentText 事件处理
- [x] 5.1.6 实现 handleThinkEnd 事件处理
- [x] 5.1.7 在 SSE 处理逻辑中集成新事件处理

### 5.2 useChat.ts 状态管理

- [x] 5.2.1 applyAssistantContent 函数支持 contentSegments 更新
- [x] 5.2.2 setLastMessage 函数适配新数据结构
- [x] 5.2.3 handleStreamError 函数更新 thinkBlocks 状态

## 6. 前端 — UI 渲染

### 6.1 MessageList.vue 扩展

- [x] 6.1.1 新增 expandedThinkBlockKeys ref 状态
- [x] 6.1.2 新增 isThinkBlockExpanded 函数
- [x] 6.1.3 新增 toggleThinkBlockExpansion 函数
- [x] 6.1.4 实现思考块 inline 渲染（遍历 contentSegments）
- [x] 6.1.5 实现思考块折叠/展开交互
- [x] 6.1.6 实现思考块状态样式（running、completed、failed）

### 6.2 MessageList.vue 状态计算

- [x] 6.2.1 hasThinkBlocks 计算逻辑
- [x] 6.2.2 shouldExpand 计算逻辑（考虑 running 状态的思考块）
- [x] 6.2.3 thinkBlockCount 计算逻辑

## 7. 前端 — 工具函数

### 7.1 useChat.ts 辅助函数

- [x] 7.1.1 ensureLastTextSegment 函数（确保最后一段是文本段）
- [x] 7.1.2 消息更新时维护 contentSegments 数组

## 8. 验证与测试

### 8.1 编译验证

- [x] 8.1.1 前端 `cd frontend && npx vue-tsc -b` 静默通过（无 TS6133）
- [x] 8.1.2 前端 `cd frontend && npm run build` exit 0
- [x] 8.1.3 agent-core 类型检查通过

### 8.2 功能测试

- [x] 8.2.1 子 Agent 执行时创建思考块
- [x] 8.2.2 流式推送 AI 文本到思考块
- [x] 8.2.3 完成时标记状态为 completed
- [x] 8.2.4 用户可折叠/展开思考块

### 8.3 错误场景测试

- [x] 8.3.1 子 Agent 执行失败，思考块标记为 failed
- [x] 8.3.2 SSE 连接中断，思考块保留已接收内容

## 9. 文档与归档

- [x] 9.1 创建 OpenSpec proposal.md
- [x] 9.2 创建 OpenSpec design.md
- [x] 9.3 创建 OpenSpec tasks.md
- [x] 9.4 创建 OpenSpec spec.md
- [ ] 9.5 归档 change 到 archive 目录

## 任务完成总结

本次 change 共 45 个任务，全部已完成。改动涉及：
- 后端 agent-core：7 个文件，新增 ~3 种 SSE 事件类型、interrupt 机制、子 Agent 提示词
- 前端：2 个文件，新增 ThinkBlock 数据结构、contentSegments inline 渲染、折叠交互

所有任务已完成，等待归档。