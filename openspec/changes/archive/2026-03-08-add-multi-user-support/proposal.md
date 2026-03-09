## Why

当前系统假定为单用户或共享上下文环境，这限制了个性化和数据隐私。不同用户无法维护独立的记忆、个人资料或对话历史。通过增加多用户支持，我们能够实现个性化体验，让每个用户拥有独立的记忆空间、个人资料（ID、昵称、头像）和会话上下文。这对于扩展 Agent 以服务多个不同个体至关重要。

## What Changes

- **用户注册**：新增 UI 流程，使用 6 位数字 ID 和唯一昵称（最多 10 个字符）进行注册。
- **头像生成**：在注册期间集成 LLM，根据昵称生成一个 emoji 头像。
- **用户登录**：使用 6 位数字 ID 进行简单登录，并在浏览器中持久化会话。
- **记忆隔离**：更新后端逻辑，将所有记忆和个人资料限定在特定用户 ID 范围内。
- **用户切换**：提供 UI 功能，允许在已登录用户之间切换。
- **数据库 Schema**：更新 memory/user 表，包含用户 ID 和个人资料元数据。

## Capabilities

### New Capabilities
- `user-auth`：管理用户注册、登录、会话持久化和用户切换。
- `user-profile`：处理用户个人资料数据（ID、昵称、头像）及通过 LLM 生成头像。
- `memory-isolation`：确保记忆的存储和检索仅限于经过验证的用户。

### Modified Capabilities
- `cowork-memory`：更新现有的记忆提取和检索逻辑，以支持用户上下文（按用户 ID 过滤）。

## Impact

- **Frontend**：新增登录/注册视图；更新聊天界面以显示用户上下文/头像；新增会话管理逻辑。
- **Backend (Java)**：新增用户管理端点（注册、登录、获取个人资料）。
- **Backend (Node.js/Agent Core)**：更新 `MemoryService` 和 `CoworkMemoryManager`，要求并使用 `userId`。
- **Database**：`users` 表的 Schema 迁移，以及在 `memories` 表中添加 `user_id`。
