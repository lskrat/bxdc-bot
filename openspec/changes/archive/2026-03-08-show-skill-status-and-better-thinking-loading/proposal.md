## Why

当前聊天界面只能展示最终回复，用户看不到 Agent 在处理中调用了哪些 Skill、当前执行到哪一步，导致“系统是否还在工作”缺少可见反馈。同时，现有三个点的 loading 表现过于单调，与整体 UI 质感不一致，需要升级为更明确、更有动效的“思考中”状态提示。

## What Changes

- **技能调用状态展示**：在 AI 回复消息下方增加轻量级的 Skill 调用轨迹，按调用顺序展示 Skill 名称与执行状态；成功完成后显示小对勾。
- **多 Skill 顺序呈现**：当一次回复过程中触发多个 Skill 时，界面按实际调用顺序逐条展示，避免只显示最后一次调用或覆盖前序记录。
- **思考中 loading 升级**：将当前三个点 loading 改为“思考中 + emoji + 动态效果”的展示方式，并与消息流式生成状态保持一致。
- **流式事件增强**：补充前后端事件流中与 Skill 调用相关的状态数据，让前端能区分“开始调用”“执行中”“完成/失败”等阶段。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `chat-ui`: AI 消息需要展示 Skill 调用状态列表，并使用新的“思考中”动态 loading 表现。
- `agent-client`: 前端消息状态管理需要解析并保存 Skill 调用过程数据，支持多个 Skill 的顺序更新与完成态同步。
- `api-gateway`: 任务事件流需要向前端透传或补充可消费的 Skill 调用状态事件，保证前端可实时渲染执行进度。

## Impact

- **前端组件**：`frontend/src/components/MessageList.vue`、`frontend/src/components/MessageInput.vue` 及聊天状态管理逻辑需要调整。
- **前端状态层**：`frontend/src/composables/useChat.ts` 需要从仅处理文本流扩展为同时处理 Skill 调用状态流。
- **后端事件流**：`backend/skill-gateway` 与 `backend/agent-core` 可能需要补充或标准化 Skill 调用相关的 SSE 数据结构。
