# 主 Agent 按会话勾选技能加载 - 设计

## Context

主 Agent 加载用户技能原链路：

```
createMainAgent (agent-core)
  └─ loadGatewayExtendedTools(skillOwnerType=1)
       └─ GET /api/skills/by-owner-type?ownerType=1   ← 全量 enabled 用户技能，不读 X-User-Id
```

会话勾选的技能虽然由 `ConversationApiService` 解析后以 `enabledSkillIds` 透传到 agent-core 的 `/agent/run`，但 `createMainAgent` 调用处未将其传入，主 Agent 实际全量加载。

## Goals / Non-Goals

**Goals:**
- 主 Agent 加载技能 = 当前会话 `enabled_skills` ∩ 该用户可见 ∩ enabled
- 过滤逻辑在 gateway 接口内完成，agent-core 仅切换端点
- 无 conversationId 时向后兼容（回退全量）

**Non-Goals:**
- 不改子 Agent（系统技能）链路
- 不动数据库结构

## Decisions

### 1. 新增专用接口 `GET /api/skills/by-conversation`

入参：`conversationId`（query）+ `X-User-Id`（header）。

接口内部编排：
```
getSkillsByConversation(userId, conversationId)
  ├─ ConversationService.getEnabledSkillIds(conversationId, userId)
  │     ├─ getById(conversationId, userId)  // 校验归属，非本人抛 404
  │     └─ 解析 enabled_skills JSON → List<Long>
  └─ SkillService.listEnabledSkillsForUserByIds(userId, ids)
        └─ SkillMapper.findVisibleEnabledSummaryForUserByIds(userId, ids)
              // id IN (ids) AND enabled=true AND 可见性(PUBLIC / 自建PRIVATE / 所在TEAM)
```

为什么新建接口而非给 `by-owner-type` 加 `ids` 参数：会话→技能 ID 的解析与归属校验属于 gateway 职责，封装在一个接口里调用方（agent-core）只需传 conversationId，链路更清晰且避免 agent-core 重复解析会话表。

### 2. agent-core 侧改动最小

`loadGatewayExtendedTools` 新增 `loadFromConversation` 选项：为 true 且有 conversationId 时走 `/api/skills/by-conversation`；否则回退原 `by-owner-type` / `/api/skills` 分支。`createMainAgent` 加载用户技能时传 `loadFromConversation: true` + `conversationId`，并保留 `skillOwnerType: 1` 作为无 conversationId 的兜底。

### 3. 修复 MyBatis-Plus `.apply` 占位符

SkillMapper 中可见性查询使用 `.apply("... LIKE CONCAT('%', ?, '%') ...", userId)`。MyBatis-Plus 的 `apply` 仅识别 `{0}` 占位符，`?` 会被原样拼入 SQL 并导致参数索引错位，抛 `No value specified for parameter 6`。统一将 `?` 改为 `{0}`，覆盖 `findVisibleSummaryForUser`、`findVisibleSummaryForUserByOwnerType` 及新增的 `findVisibleEnabledSummaryForUserByIds`。

## Risks / Trade-offs
- 直连无 conversationId 调用仍全量加载——可接受，作为兼容兜底
- 不缓存会话技能列表——每轮加载查一次会话表，量级小可接受
