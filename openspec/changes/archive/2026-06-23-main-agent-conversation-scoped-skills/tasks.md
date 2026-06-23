# 主 Agent 按会话勾选技能加载 - 任务清单

## 任务概览

| 序号 | 任务 | 状态 |
|------|------|------|
| 1 | SkillMapper 新增按 ID 列表 + 用户可见性 + enabled 查询 | 已完成 |
| 2 | SkillService 新增 listEnabledSkillsForUserByIds | 已完成 |
| 3 | ConversationService 新增 getEnabledSkillIds | 已完成 |
| 4 | SkillController 注入 ConversationService 并新增 /by-conversation 接口 | 已完成 |
| 5 | agent-core 主 Agent 改为调用 /by-conversation 加载用户技能 | 已完成 |
| 6 | 修复 SkillMapper `.apply` 占位符 bug（? → {0}） | 已完成 |

## 详细任务

### 任务 1: SkillMapper 新增按 ID 列表查询
- [x] 新增 `findVisibleEnabledSummaryForUserByIds(userId, ids)`：`id IN (ids) AND enabled=true AND 可见性(PUBLIC / 自建PRIVATE / 所在TEAM)`

### 任务 2: SkillService 新增方法
- [x] 新增 `listEnabledSkillsForUserByIds(userId, ids)`，ids 为空返回空列表，否则委托 Mapper

### 任务 3: ConversationService 新增方法
- [x] 新增 `getEnabledSkillIds(conversationId, userId)`：校验会话归属 + 解析 `enabled_skills` JSON 为 `List<Long>`

### 任务 4: SkillController 新增接口
- [x] 注入 `ConversationService`
- [x] 新增 `GET /api/skills/by-conversation?conversationId=xxx`（header `X-User-Id`），编排会话解析 + 可见性查询

### 任务 5: agent-core 主 Agent 改造
- [x] `loadGatewayExtendedTools` 新增 `loadFromConversation` 分支，调用 `/api/skills/by-conversation`
- [x] `createMainAgent` 加载用户技能时传 `loadFromConversation: true` + `conversationId`，保留 `skillOwnerType: 1` 兜底

### 任务 6: 修复 MyBatis-Plus 占位符
- [x] SkillMapper 三处 `.apply(... CONCAT('%', ?, '%') ...)` 的 `?` 改为 `{0}`
