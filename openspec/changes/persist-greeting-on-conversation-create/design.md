## Context

问好语当前流程（详见 proposal）：前端 `newConversation` → `create`（gateway 仅 INSERT 一行 conversations）→ `switchConversation`（拿到空 messages）→ `ChatView` 发现空 → `fetchGreeting`（POST agent-core，纯模板随机替换，**不调 LLM**）→ `addMessage` 仅写内存。

相关源码：
- gateway：`ConversationService.create()`（`@Transactional`，仅插 conversations）、`saveMessages()`（已有的消息落库路径，`role ∈ VALID_ROLES`）、`User` 实体含 `nickname`/`avatar`。
- 前端：`useChat.fetchGreeting()`、`ChatView.vue` 的 `onMounted` + `historyMessages` watch 两处空对话特判、`messageCountBeforeSend` 切片持久化。
- agent-core：`avatar.controller.ts` `@Post('greeting')`、`service.ts` `generateGreeting()`、`prompts.ts` `GREETING_TEMPLATES`。

## Goals / Non-Goals

**Goals:**
- 问好语成为建对话时即持久化的真实历史消息（`role=assistant`），随普通历史加载渲染。
- 彻底移除前端「空对话→fetchGreeting」特判与并发补丁，使双问好语 bug 结构性消失。
- 问好语生成保持**纯模板随机、无 LLM、无额外网络往返**，保证第一时间展示。
- 能力归位到 gateway，agent-core 去除不属于其职责的死代码。

**Non-Goals:**
- 不改 `users`/`conversations`/`conversation_messages` 表结构。
- 不对发布为 API 的对话做特殊处理（Q1 暂不处理）。
- 不迁移存量空对话。
- 不引入 LLM 生成问好语。

## Decisions

### 决策 1：在 `ConversationService.create()` 同事务注入问好语，而非前端补存
- **选用**：`create()` 内 INSERT conversations 后，同一 `@Transactional` 复用 `saveMessages` 的写消息路径 INSERT 一条 `role=assistant`、`content=随机模板` 的消息。
- **理由**：原子性（create 与 greeting 同生同灭，不会出现「空对话无问好语」中间态）；单一真相源；前端零编排；问好语随 `GET /conversations/{id}` 历史一起返回，无额外往返，满足「第一时间展示」。
- **否决 前端补存**：需前端串 3 个网络调用且非原子，且「谁触发新建」分散多处易漏。

### 决策 2：`GREETING_TEMPLATES` 迁入 gateway，nickname/avatar 由 gateway 查 `users`
- 模板就是一组字符串常量 + `replace`，无状态无 LLM，迁到 gateway（如 `ConversationService` 私有常量或独立常量类）即可。
- gateway 已持有 `users` 表，`create(userId,...)` 时按 userId 查 nickname/avatar 填充模板；前端无需传参。用户不存在/字段空时模板占位符回退为空串或合理默认。

### 决策 3：删除 agent-core greeting 端点 —— 必须动 agent-core 的理由（AGENTS.md 5.5）
- **为什么不能走 Tool 接入**：问好语注入发生在「对话创建」这一 gateway 内部事务时点，不是一次 LLM tool-call；它本就不该是 agent-core 的职责。保留旧端点 = 留死代码 + 两份模板真相源。
- **对 agent-core 的影响**：仅删除 `avatar.controller.ts` 的 `generateGreeting`/`@Post('greeting')`、`service.ts` 的 `generateGreeting`、`prompts.ts` 的 `GREETING_TEMPLATES`。**保留** `generateAvatar`（真 LLM 能力）及其 `GENERATE_AVATAR_SYSTEM_PROMPT`。
- **对现有 Skill 类型兼容性**：无影响（不涉及 api/ssh/template/openclaw 的 tool-call 协议、SSE、调度策略）。
- **回归范围**：agent-core 仅需确认 avatar 模块编译通过、`generateAvatar` 端点不受影响；无需对 Skill 执行做回归。

### 决策 4：前端按普通历史消息渲染问好语
- 删除 `useChat.fetchGreeting` 及 `ChatView` 两处特判 + 并发锁补丁。
- `messageCountBeforeSend` 持久化逻辑无需改：问好语已是库内消息，发首条用户消息时 `slice(messageCountBeforeSend)` 只截新消息，不会重复保存问好语。
- 问好语消息 `id` 使用后端返回的真实 `message_id`，不再用硬编码 `'greeting'`。

## Risks / Trade-offs

- [问好语进入 LLM 上下文] → 用户已确认可接受（Q2）。首条用户消息时上下文会含这条 assistant 问好语，无害。
- [发布为 API 的对话也带问好语] → 本次接受（Q1 暂不处理）；如后续发现污染 API 上下文，可加「仅用户可见对话注入」开关，已在 proposal 记录范围。
- [存量空对话不再显示问好语] → 轻微体验差异，可接受（Q3），不做迁移。
- [事务内多写一条消息的失败传播] → 复用既有 `saveMessages` 校验与同事务，写失败则整个 create 回滚，行为可预期。
- [gateway 模板与 agent-core 删除需同一变更落地] → tasks 中确保「迁入 gateway」先于「删除 agent-core」，避免中间态缺失能力。
