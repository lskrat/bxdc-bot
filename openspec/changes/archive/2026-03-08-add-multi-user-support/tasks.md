## 1. 数据库与核心基础设施 (Node.js)

- [x] 1.1 为 `memories.db` (Node.js) 创建迁移脚本以添加 `users` 表
- [x] 1.2 创建迁移脚本以在 `user_memories` 表中添加 `user_id` 列
- [x] 1.3 更新 `CoworkMemoryManager`，在构造函数或方法中接收 `userId`
- [x] 1.4 更新 `CoworkMemoryManager` 中的 SQL 查询以按 `user_id` 过滤
- [x] 1.5 更新 `MemoryService`，从 AgentController 传递 `userId` 上下文
- [x] 1.6 实现注册时注入初始“用户昵称是 X”记忆的逻辑

## 2. 后端 API (Java)

- [x] 2.1 定义 `User` 数据模型（ID、昵称、头像）
- [x] 2.2 实现 `POST /api/auth/register` 端点（处理 ID 验证、存储）
- [x] 2.3 在注册流程中实现头像生成逻辑（模拟或调用 LLM）
- [x] 2.4 实现 `POST /api/auth/login` 端点
- [x] 2.5 实现 `GET /api/user/:id` 端点

## 3. 前端：认证基础

- [x] 3.1 创建 `useUser` composable 以管理认证状态（登录/退出/当前用户）
- [x] 3.2 创建带有 ID 输入框的 `LoginView.vue`
- [x] 3.3 创建带有 ID 和昵称输入框的 `RegisterView.vue`
- [x] 3.4 实现登录和注册的 API 集成

## 4. 前端：UI 集成

- [x] 4.1 创建 `UserAvatar` 组件以显示 emoji
- [x] 4.2 更新 `Layout.vue` 以显示当前用户个人资料
- [x] 4.3 在布局中添加“切换用户”/“退出”按钮
- [x] 4.4 更新 `useChat.ts`，在 `sendMessage` 上下文中包含 `userId`
- [x] 4.5 添加路由守卫，将未验证用户重定向到登录页

## 5. 验证

- [ ] 5.1 验证创建两个不同用户会产生两个不同头像
- [ ] 5.2 验证用户 A 无法看到用户 B 的记忆
- [ ] 5.3 验证同一用户的记忆在不同会话间的持久性
