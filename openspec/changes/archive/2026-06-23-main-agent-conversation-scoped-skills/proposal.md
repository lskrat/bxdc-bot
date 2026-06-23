# 主 Agent 按会话勾选技能加载 - 提案

## 1. 需求背景

### 1.1 问题描述
主 Agent（agent-core 的 `createMainAgent`）在会话中加载用户技能时，调用 gateway 的 `/api/skills/by-owner-type?ownerType=1`，**全量加载数据库中所有 `enabled=true` 的用户技能**，既不按当前会话勾选的技能过滤，也不按用户可见性过滤。

这导致：
- 主 Agent 暴露了用户在当前会话未勾选的技能，违背"按会话配置加载技能"的产品预期
- `by-owner-type` 接口不读 `X-User-Id`，存在跨用户技能可见性泄漏风险

### 1.2 需求描述
主 Agent 在会话中加载技能时，应当**加载当前会话表（conversations）中配置勾选的技能**：
1. 由 gateway 提供专门接口，传入会话 ID
2. 接口内部查会话表，从 `enabled_skills` 字段解析出启用的 skillId 列表
3. 按该列表去查询「该用户可见 + enabled=true」的技能列表返回
4. 主 Agent 调用该接口加载用户技能，不再全量加载 `ownerType=1`

### 1.3 预期效果
- 主 Agent 仅加载当前会话勾选、且对该用户可见、且启用的技能
- 过滤逻辑下沉到 gateway 接口（查会话表 + 可见性 + enabled），agent-core 不做技能集合裁剪
- 无 `conversationId`（如直连调用）时回退到原 `ownerType=1` 全量加载，向后兼容

## 2. 价值分析

- **行为正确**：主 Agent 技能范围与会话配置一致，避免加载未勾选技能
- **安全**：技能可见性过滤在接口内按 `X-User-Id` 完成，杜绝跨用户泄漏
- **架构合规**：核心过滤在 gateway（Java）侧以接口实现，agent-core 仅切换调用端点（符合 AGENTS.md 5.5）

## 3. 范围界定

### 3.1 包含范围
- gateway 新增 `GET /api/skills/by-conversation` 接口
- gateway 新增会话技能 ID 解析与按 ID 列表的可见性查询
- 修复 SkillMapper 中 MyBatis-Plus `.apply` 占位符 bug（`?` → `{0}`）
- agent-core 主 Agent 加载用户技能改为调用新接口

### 3.2 排除范围
- 不修改子 Agent（系统技能 ownerType=2）的加载链路
- 不新增数据库表/字段（复用现有 `conversations.enabled_skills`）
- 不新增第三方依赖、不新增环境变量

## 4. 风险评估

| 风险 | 等级 | 描述 | 缓解策略 |
|------|------|------|---------|
| 旧调用兼容 | 低 | 直连 `/agent/run` 无 conversationId | 无 conversationId 时回退 by-owner-type 全量加载 |
| SQL 占位符 | 中 | `.apply` 用 `?` 导致参数错位报错 | 统一改为 MyBatis-Plus 的 `{0}` 占位符 |
| 会话归属 | 中 | 跨用户读取他人会话技能 | `getEnabledSkillIds` 校验会话归属（非本人抛 404） |

## 5. 依赖检查
- 复用 `conversations.enabled_skills`（JSON 数组）字段，已存在
- 复用 `SkillVisibility` 可见性规则（PUBLIC / 自建 PRIVATE / 所在 TEAM）
