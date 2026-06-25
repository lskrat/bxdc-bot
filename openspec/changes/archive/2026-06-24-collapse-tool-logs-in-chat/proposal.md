## Why

Skill 执行时工具调用日志逐条展示在 LLM 回复下方，数量一多就把文本内容推离视口，用户每次都要滚动回上方才能看到 LLM 的实际回复。同时确认卡片与工具调用日志在页面中分散展示，缺乏统一的折叠控制。优化为「运行时自动展开、完成后自动收起」的折叠块，提升对话浏览体验。

## What Changes

- 将确认卡片（`confirmation-card`）与工具调用列表（`tool-status-list`）合并到同一个折叠块内，标题显示工具数量与待确认状态
- 折叠行为由状态驱动，无需手动开关：
  - 有 tool 处于 `running` 状态，或有 `pending` 状态确认卡片 → **强制展开**
  - 全部 tool 进入终态（`completed` / `failed`）且无 `pending` 确认 → **自动收起**
- 失效时仍允许用户手动点击标题展开/收起（仅在非 pending 状态下可收起）

## Capabilities

### New Capabilities
<!-- No new backend capabilities - pure frontend UI change -->
- `chat-tool-log-collapse`: 聊天页工具调用与确认卡片统一的折叠展示机制，由运行状态自动控制展开/收起，手动仅在非 pending 状态下介入。

### Modified Capabilities
<!-- No existing spec requirements changed - pure presentation change -->

## Impact

- 仅改 `frontend/src/components/MessageList.vue`：模板调整、移除独立的 tool-status-list 区域，与 confirmation-card 合并到折叠块；新增 `isBlockExpanded` computed 控制展开状态。
- 不影响数据流、SSE 协议、持久化、API。
