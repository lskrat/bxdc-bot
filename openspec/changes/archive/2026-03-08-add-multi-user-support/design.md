## Context

系统目前作为单用户 Agent 运行。所有记忆都存储在一个公共池中，没有用户身份或认证的概念。为了支持多用户，我们需要引入持久的用户身份、认证流程和数据隔离层。后端分为基于 Java 的 Gateway/Controller 和基于 Node.js 的 Agent Core。认证逻辑要求在 Java 端实现。

## Goals / Non-Goals

**Goals:**
- 实现使用 ID（6 位数字）和昵称的用户注册。
- 实现注册期间使用 LLM 自动生成 emoji 头像。
- 实现用户登录和会话持久化（Frontend）。
- 隔离用户记忆，确保用户无法访问他人的数据。
- 支持在用户之间切换。

**Non-Goals:**
- 复杂的密码管理（目前仅使用 ID 登录即可）。
- 基于角色的访问控制（RBAC）。
- 社交登录（OAuth）。
- 加密记忆存储（逻辑隔离已足够）。

## Decisions

### 1. 用户标识
- **Decision**：使用 6 位数字 ID 作为主要用户标识符和登录凭证。
- **Rationale**：简单易记，足以满足当前规模/安全需求。
- **Constraint**：ID 必须唯一。

### 2. 架构与数据流
- **Decision**：认证逻辑驻留在 Java 后端。
- **Decision**：Agent Core 关于“会话”保持无状态，但在请求上下文中接收 `userId` 以限定记忆操作范围。
- **Flow**：
  1. Frontend -> Java: 登录/注册
  2. Java -> Database: 存储/检索用户
  3. Frontend -> Java (Chat): 在上下文中发送 `userId`
  4. Java -> Agent Core: 转发 `userId`
  5. Agent Core: 使用 `userId` 过滤 `memories.db` 上的 SQL 查询

### 3. 头像生成
- **Decision**：在注册期间，Java 后端调用 Agent Core（或直接调用 LLM）生成头像。
- **Implementation**：Agent Core 将暴露一个工具或端点 `generate_avatar(nickname)`，返回单个 emoji。
- **Storage**：emoji 字符直接存储在 `users` 表中。

### 4. 记忆隔离
- **Decision**：在 SQLite (`memories.db`) 的 `user_memories` 表中添加 `user_id` 列。
- **Migration**：现有记忆将被分配给默认的“旧版”用户或留空（并被过滤掉）。
- **Logic**：`CoworkMemoryManager` 中的所有 `SELECT` 和 `INSERT` 查询必须包含 `user_id = ?`。

## Risks / Trade-offs

- **Risk**：没有密码保护。
  - **Mitigation**：对于特定需求可接受；系统可能是内部使用或实验性的。
- **Risk**：SQLite 迁移复杂性。
  - **Mitigation**：使用 `better-sqlite3` 在启动时安全地执行 DDL `ALTER TABLE` 命令。

## Data Model

### `users` (New Table)
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT/INT | PK, 6 digits | 用户登录 ID |
| nickname | TEXT | NOT NULL | 显示名称 |
| avatar | TEXT | | Emoji 字符 |
| created_at | INT | | 时间戳 |

### `user_memories` (Modified)
- **Add**: `user_id` (TEXT, Indexed)

## API Design

### Java Backend
- `POST /api/auth/register`
  - Body: `{ id: "123456", nickname: "Rabbit" }`
  - Response: `{ success: true, user: { id, nickname, avatar } }`
- `POST /api/auth/login`
  - Body: `{ id: "123456" }`
  - Response: `{ success: true, user: { ... } }` (Set cookie/token)

### Agent Core (Internal)
- `POST /agent/run` (Existing)
  - Context update: `{ sessionId: "...", userId: "123456" }`
