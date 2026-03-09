## 1. 后端事件流增强

- [x] 1.1 梳理 `backend/agent-core` 当前 LangGraph 流式 chunk 结构，确认可用于识别 Skill/工具调用的字段
- [x] 1.2 在 `backend/agent-core` 中新增或补充 Skill 调用事件归一化逻辑，输出统一的事件类型、Skill 名称和状态值
- [x] 1.3 确认 `backend/skill-gateway` 能原样转发结构化 Skill 状态事件，并在完成时继续发送明确的 `complete` 事件

## 2. 前端聊天状态模型扩展

- [x] 2.1 扩展 `frontend/src/composables/useChat.ts` 的消息类型，为 assistant 消息增加 Skill 调用列表与状态字段
- [x] 2.2 在 SSE 处理逻辑中区分文本事件和 Skill 状态事件，支持同一条消息下多个 Skill 的顺序追加与增量更新
- [x] 2.3 收敛 thinking 状态生命周期，确保完成或失败后不残留 loading 与过期的执行中状态

## 3. 聊天界面展示改造

- [x] 3.1 更新 `frontend/src/components/MessageList.vue`，在 assistant 回复下方用小字号展示 Skill 名称与状态列表
- [x] 3.2 为已成功完成的 Skill 条目增加小对勾，并保证多个 Skill 按调用顺序稳定展示
- [x] 3.3 将当前三个点 loading 替换为“思考中 + emoji + 动态效果”的展示方式

## 4. 联调与验证

- [ ] 4.1 使用至少一个会触发单个 Skill 的对话验证状态展示、完成对勾和正文流式更新
- [ ] 4.2 使用会触发多个 Skill 的对话验证顺序展示、状态更新和完成收敛逻辑
- [ ] 4.3 验证异常或中断场景下 loading 正常消失，界面不会持续显示过期的 Skill 执行中状态
