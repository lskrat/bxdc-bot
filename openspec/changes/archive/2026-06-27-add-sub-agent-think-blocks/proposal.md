# Sub-Agent Think Blocks - 提案

## Why

### 问题描述
当前系统在执行子 Agent（execute-skill 工具）时，子 Agent 的思考过程（AI 生成的文本内容）完全隐藏在工具执行日志中，用户无法看到子 Agent 在做什么、如何推理、为什么做出某个决策。这导致：

- **黑盒执行**：用户只看到子 Agent 的最终结果，不了解中间推理过程
- **信任度低**：无法验证子 Agent 是否正确理解了任务需求
- **调试困难**：当子 Agent 执行失败时，难以定位问题根源
- **用户体验差**：长时间执行的子 Agent 没有实时反馈，用户不知道是否卡住

### 需求描述
需要为子 Agent 的执行过程增加可视化思考块（Think Blocks）功能：

1. **实时思考展示**：子 Agent 开始执行时，创建可折叠的思考区域，实时流式展示子 Agent 的 AI 文本
2. **inline 渲染**：思考块与主 Agent 的回答文本穿插排列，形成连贯的对话流
3. **状态标记**：思考块有明确的状态标识（running、completed、failed），让用户了解执行进度
4. **可折叠交互**：用户可以折叠/展开思考块，避免长内容干扰阅读
5. **多语言提示**：子 Agent 使用独立的系统提示词，支持中英文双语

### 预期效果
- 用户可以实时看到子 Agent 的思考过程，增强透明度和信任感
- 思考块内嵌在对话流中，不影响主 Agent 的正常回答
- 长时间执行的子 Agent 有实时反馈，避免用户焦虑
- 执行失败时，思考块保留所有推理过程，便于调试

## What Changes

### 前端改动
- **MessageList.vue**：新增思考块渲染逻辑，支持 inline 渲染（contentSegments 穿插排列）
- **useChat.ts**：新增 ThinkBlock 数据结构、contentSegments 字段、think_start/agent_text/think_end 事件处理
- **折叠/展开功能**：新增 `expandedThinkBlockKeys` 状态，用户可手动折叠思考块

### 后端改动（agent-core）
- **tool-trace-context.ts**：新增 ThinkStartEvent、AgentTextEvent、ThinkEndEvent 事件类型
- **execute-skill.ts**：子 Agent 执行时发射 think_start 事件，流式推送 AI 文本，完成时发射 think_end
- **agent.ts**：支持 LangGraph interrupt 机制，提取中断条目处理子 Agent 的思考输出
- **prompts/**：新增子 Agent 专用系统提示词（中英文双语），引导子 Agent 输出结构化思考内容

### 后端改动（gateway）
- **无改动**：Think blocks 功能完全在 agent-core 层实现，gateway 侧无需修改

## Capabilities

### New Capabilities
- `sub-agent-think-blocks`：子 Agent 思考过程的可视化展示能力，包括实时流式推送、inline 渲染、折叠交互、状态标记

### Modified Capabilities
- `execute-skill`：扩展 execute-skill 工具，增加思考块事件发射逻辑（think_start、agent_text、think_end）
- `api-extension-skill-llm-tool-call`：不影响主 Agent 的 tool-call 协议，思考块作为子 Agent 的内部可视化机制

## Impact

### 前端影响
- 新增数据结构：`ThinkBlock`、`ContentSegment`
- 新增事件处理：`think_start`、`agent_text`、`think_end`
- 新增 UI 状态：`expandedThinkBlockKeys`（折叠状态管理）
- 新增渲染逻辑：`contentSegments` inline 渲染
- **性能影响**：每个思考块的文本内容上限为 ~50KB（避免大文本影响渲染性能）

### 后端影响（agent-core）
- 新增事件类型：`ThinkStartEvent`、`AgentTextEvent`、`ThinkEndEvent`
- 扩展 execute-skill 工具：增加思考块发射逻辑
- 扩展 agent.ts：支持 interrupt 机制提取子 Agent 输出
- 新增 prompts：子 Agent 专用系统提示词
- **性能影响**：SSE 流式推送增加 ~3 种事件类型，每个事件文本内容限制在合理范围

### 后端影响（gateway）
- **无改动**：功能完全在 agent-core 实现，不侵入 gateway

### 数据库影响
- **无改动**：思考块数据仅在前端和 SSE 流中存在，不持久化到数据库

### 兼容性影响
- **向后兼容**：现有对话历史不受影响，思考块仅在新对话中展示
- **浏览器兼容**：SSE 流式推送依赖浏览器原生支持，现代浏览器全覆盖

### 风险评估

| 风险 | 等级 | 描述 | 缓解策略 |
|------|------|------|---------|
| 大文本影响性能 | 中 | 子 Agent 输出过长文本可能影响渲染 | 前端限制每个思考块文本上限 ~50KB，超长内容截断 |
| SSE 事件顺序错乱 | 低 | 网络延迟可能导致事件顺序错乱 | 前端按 thinkId 聚合事件，使用 think_start 初始化，think_end 标记完成 |
| 子 Agent 无输出 | 低 | 子 Agent 可能不生成 AI 文本（纯工具调用） | 前端允许空思考块，仅显示状态标记（completed/failed） |
| 多语言提示不完整 | 低 | 子 Agent 提示词可能引导不明确 | 提示词中明确要求子 Agent 输出"结构化思考内容"，避免无输出 |