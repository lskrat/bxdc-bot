## Why

当前「问好语」是前端模拟拼接的临时消息：前端发现对话为空 → 调 agent-core `/features/avatar/greeting`（实为 `GREETING_TEMPLATES` 纯随机替换，并不调用 LLM）→ `addMessage` 仅写入内存、永不入库。这套设计带来三个问题：

1. **双问好语 bug**：`ChatView` 的 `onMounted` 与 `historyMessages` watch 两条路径都对空对话特判触发 `fetchGreeting`，并发进入时守卫（`messages.length > 0`）双双放行，`addMessage` 又不去重，导致出现两句问好语（已用并发锁打补丁，但属创可贴）。
2. **架构错位**：问好语生成逻辑住在 agent-core（LLM 调度层），却不做任何 LLM 工作，违背「thin agent / thick tools」分层。
3. **历史不稳定**：问好语不入库，每次进空对话重新随机一条；前端需编排「建→切→拼」三步并对「空对话」做 special-casing，时序脆弱。

## What Changes

- **问好语改为建对话时持久化的真实历史消息**：`ConversationService.create()` 在同一事务内额外 INSERT 一条 `role=assistant` 的问好语消息（内容由 `GREETING_TEMPLATES` 纯随机选取，**不调用 LLM**），nickname/avatar 由 gateway 直接查 `users` 表填充。
- **前端删除问好语模拟逻辑**：移除 `useChat.fetchGreeting`、`ChatView` 中 `onMounted`/`historyMessages` watch 对空对话的 `fetchGreeting` 特判、以及并发重入补丁；问好语按普通历史消息正常加载渲染。双问好语 bug 由此从结构上消除。
- **BREAKING（内部接口）**：删除 agent-core `/features/avatar/greeting` 端点与 `GREETING_TEMPLATES` 常量；保留 `generateAvatar`（真 LLM 能力）。

## Capabilities

### New Capabilities
- `conversation-greeting`: 新建对话时由 gateway 在创建事务内注入一条持久化的问好语助手消息（纯模板随机，无 LLM）。

### Modified Capabilities
<!-- None -->

## Impact

- **Gateway**：`ConversationService.create()` 同事务注入问好语消息；新增 `GREETING_TEMPLATES`（从 agent-core 迁入）；从 `users` 表读取 nickname/avatar。
- **Frontend**：`useChat.ts` 删除 `fetchGreeting`；`ChatView.vue` 删除空对话特判；问好语走普通历史加载路径。`messageCountBeforeSend` 持久化逻辑天然兼容（问好语已在库，不会被重复保存）。
- **agent-core**：删除 `avatar.controller.ts` 的 `greeting` 端点、`service.ts` 的 `generateGreeting`、`prompts.ts` 的 `GREETING_TEMPLATES`（属基础能力级别变更，理由见 design.md，遵循 AGENTS.md 5.5）。
- **范围**：所有新建对话一律注入问好语（含发布为 API 的对话，本次不特殊处理）。
- **存量空对话**：不做数据迁移；已有的空对话再次打开将不再出现问好语（可接受）。
- 不新增第三方包、不新增环境变量、Gateway 保持 JDK 1.8 语法、前端零 TS6133。
