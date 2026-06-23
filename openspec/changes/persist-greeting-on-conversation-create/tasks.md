## 1. Gateway — 迁入模板并在创建时注入问好语

- [x] 1.1 在 gateway 侧新增 `GREETING_TEMPLATES`（从 agent-core `prompts.ts` 迁入，JDK 1.8 兼容写法：`String[]` 或 `Arrays.asList`）
- [x] 1.2 新增私有方法：随机选取模板并用昵称/头像填充占位符（用户缺失/字段空时回退空串或默认值，不抛异常）
- [x] 1.3 `ConversationService.create()` 在同一 `@Transactional` 内、INSERT conversations 后注入一条 `role=assistant` 的问好语 `ConversationMessage`（复用既有写消息字段约定）
- [x] 1.4 注入时按 `userId` 查 `users` 表取 nickname/avatar（注入 `UserMapper`/`UserService`），前端无需传参

## 2. Frontend — 移除问好语模拟逻辑

- [x] 2.1 删除 `useChat.ts` 的 `fetchGreeting` 及并发重入补丁（`greetingInFlight` 等），并从 `ChatState`/`provide` 导出中移除 `fetchGreeting`
- [x] 2.2 删除 `ChatView.vue` `onMounted` 中空对话 → `fetchGreeting` 特判（空历史不再特殊处理）
- [x] 2.3 删除 `ChatView.vue` `historyMessages` watch 中空数组 → `fetchGreeting` 特判
- [x] 2.4 确认问好语按普通历史消息渲染（使用后端真实 `message_id`，不再用硬编码 `'greeting'`）

## 3. agent-core — 删除问好语端点（保留 avatar）

- [x] 3.1 删除 `avatar.controller.ts` 的 `@Post('greeting')` 处理方法
- [x] 3.2 删除 `service.ts` 的 `generateGreeting()` 方法
- [x] 3.3 删除 `prompts.ts` 的 `GREETING_TEMPLATES`（保留 `GENERATE_AVATAR_SYSTEM_PROMPT` 与 `generateAvatar`）
- [x] 3.4 清理因上述删除产生的未使用 import（含 `randomUUID`、不再使用的 `LoggerService`/`useUser`/`currentUser`）

## 4. 验证

- [x] 4.1 `cd frontend && npx vue-tsc -b` 静默通过（无 TS6133，尤其 `fetchGreeting` 解构残留）
- [x] 4.2 `cd frontend && npm run build` exit 0
- [x] 4.3 gateway 编译通过（`mvn compile`）
- [x] 4.4 agent-core 编译/类型检查通过（`tsc --noEmit`）
- [ ] 4.5 手测：新建对话首条即问好语；切到文件管理/运营看板再返回仅一条；发送首条消息后问好语不重复入库
