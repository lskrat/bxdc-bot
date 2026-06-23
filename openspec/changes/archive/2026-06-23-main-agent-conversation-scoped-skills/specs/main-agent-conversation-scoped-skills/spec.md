## ADDED Requirements

### Requirement: 按会话查询启用技能的 API

系统 SHALL 在 gateway 提供 `GET /api/skills/by-conversation` 端点，供主 Agent 按当前会话勾选的技能加载用户技能。

请求：
- Header `X-User-Id`（必填）：当前用户 ID，用于会话归属校验与技能可见性过滤
- Query `conversationId`（必填）：会话 ID

行为：系统 SHALL 查询会话表对应记录，解析其 `enabled_skills`（JSON 数组，如 `[1,3,5]`）为 skillId 列表，再返回这些 ID 中「该用户可见且 `enabled=true`」的技能列表。可见性规则为 PUBLIC、或创建者为该用户的 PRIVATE、或该用户所在 TEAM。

#### Scenario: 返回会话勾选且用户可见的启用技能
- **WHEN** 用户请求 `GET /api/skills/by-conversation?conversationId=abc` 且该会话 `enabled_skills=[1,3,5]`
- **THEN** 系统返回 id ∈ {1,3,5} 中 enabled=true 且对该用户可见的技能列表

#### Scenario: 会话未勾选任何技能
- **WHEN** 会话 `enabled_skills` 为空数组或 NULL
- **THEN** 系统返回空列表

#### Scenario: 非本人会话
- **WHEN** 请求的 conversationId 不属于该 `X-User-Id`
- **THEN** 系统返回 404 Not Found

### Requirement: 主 Agent 按会话勾选技能加载用户技能

主 Agent（agent-core `createMainAgent`）在会话中加载用户技能时，SHALL 优先按当前会话勾选的技能加载，而非全量加载 `skill_owner_type=1` 的用户技能。

行为：
- 当存在 `conversationId` 时，主 Agent SHALL 调用 `GET /api/skills/by-conversation` 加载用户技能
- 当不存在 `conversationId`（如直连调用）时，主 Agent SHALL 回退到 `by-owner-type?ownerType=1` 全量加载，保持向后兼容

#### Scenario: 会话内加载
- **WHEN** 主 Agent 在带 conversationId 的会话中加载技能
- **THEN** 仅加载该会话勾选、对用户可见且启用的技能

#### Scenario: 无会话上下文加载
- **WHEN** 主 Agent 无 conversationId
- **THEN** 回退到按 ownerType=1 全量加载启用的用户技能

### Requirement: MyBatis-Plus 自定义条件占位符规范

SkillMapper 中使用 `QueryWrapper.apply(sql, values...)` 拼接自定义 SQL 片段时，SHALL 使用 MyBatis-Plus 占位符 `{0}` 而非 JDBC 的 `?`，以保证参数正确绑定。

#### Scenario: 团队可见性子查询参数绑定
- **WHEN** 可见性查询通过 `.apply` 注入 `... members LIKE CONCAT('%', {0}, '%') ...` 并传入 userId
- **THEN** userId 正确绑定到 `{0}`，查询不再抛出 `No value specified for parameter` 错误
