# Design: Skill 分享给指定用户

## Context

- 已有可见性模型（[SkillVisibility.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/SkillVisibility.java)）：`PUBLIC` / `PRIVATE` / `TEAM`
- 已有团队机制：[UserTeam.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/UserTeam.java) + [UserTeamController.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/controller/UserTeamController.java)，通过 `teamId` 字符串字段关联
- 已有 Skill 服务：[SkillService.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillService.java) 的 `listSkillsForUser` + `getSkillByIdForUser` 已做可见性过滤
- 已有 Mapper：[SkillMapper.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/mapper/SkillMapper.java) 的 `findVisibleSummaryForUser` 用 MyBatis Plus QueryWrapper 组合 `createdBy == userId` ∨ `visibility = PUBLIC` ∨ `visibility = TEAM && teamId 包含当前用户的 team`
- 已有前端 [SkillHub.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillHub.vue) + [useSkillHub.ts](file:///e:/AI/bxdc-bot/fishtank/frontend/src/composables/useSkillHub.ts) composable

**约束**：
- 必须复用现有 `skill-gateway` Spring Boot + MyBatis Plus + MySQL 技术栈
- 必须复用现有 `X-User-Id` 鉴权模式
- 前端必须复用现有 `useSkillHub` composable 模式 + TDesign 组件
- DB schema 演进走 [SchemaMigrationRunner.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/SchemaMigrationRunner.java)（已有）—— 加列而非新建表

## Goals / Non-Goals

**Goals:**
- 给 Skill 加上"指定用户可见"的能力，**不**新建 team、不强制 PUBLIC
- 支持 owner 控制接收方的权限粒度（READ / WRITE）
- 接收方体验零负担：在自己的 Skill Hub 列表里直接看到分享的 Skill
- 严格权限：owner-only 操作（删除、转分享、修改 visibility）不被授予
- 完全向后兼容：存量 Skill 数据无需迁移

**Non-Goals:**
- 不做实时推送（分享/取消分享后接收方需要刷新或下次轮询才看到）
- 不做分享链接 / 二维码分享（仅做"按 user id 分享"）
- 不做分享权限的多层级（只有 READ / WRITE 两档，不再细分如"调用但不能查看参数"）
- 不做分享过期时间（永久有效，由 owner 手动 unshare）
- 不做"接受分享"确认流程（直接可见，符合用户需求"分享后则该用户可以...调用"）
- 不动 [agent-core](file:///e:/AI/bxdc-bot/fishtank/backend/agent-core/src/) 主 Agent 调用 Skill 的路径 —— agent-core 调 `GET /api/skills/by-conversation` 已经走 user-visible 过滤，本次只需要让过滤包含 SHARED
- 不做"分享给团队"自动级联 —— owner 显式选 user id，不根据 team 推断

## Decisions

### 决策 1：数据模型 —— 新增列 vs 独立 `skill_share_record` 表

**选**：**新增列 `shared_with_user_ids` 到 `skills` 表**（对齐已有 `teamId: String` 的简化模式）。

**理由**：
- 已有 `teamId` 字段就是字符串列（逗号分隔 team id），`SHARED` 可见性沿用同样的"低基数关系"模式，最小侵入
- `skill-gateway` 用 MyBatis Plus + 自定义 SQL，过滤逻辑写在 `findVisibleSummaryForUser` 一个方法里 —— 加列 + 改 SQL 一处
- 独立 `skill_share_record(skill_id, user_id, permission, shared_at)` 表的优势是"能存每条 share 的 permission 和 timestamp"—— 这是 spec 想要的（"Permission Boundaries" + "Listing Share Recipients" 两个 Requirement 都要 permission + sharedAt）

**结论**：**混合方案**
- **字段 `shared_with_user_ids: VARCHAR(1024) NULL` 在 `skills` 表** —— 用于可见性过滤（和 `teamId` 同样的查询模式）
- **独立表 `skill_share_record(skill_id, user_id, permission, shared_at)`** —— 用于审计 / permission 粒度 / 列出 recipient 详情

读写分离：可见性过滤查 `shared_with_user_ids`（快、命中索引）；展示分享列表查 `skill_share_record`（含 permission）。

**否决方案**：
- 全用字符串列：permission 无法存储，只能 SHARE 全部一种权限 —— 不满足 spec
- 全用独立表：可见性过滤要做 JOIN（subquery like `%userId%`） —— 性能差 + SQL 复杂

### 决策 2：permission 枚举粒度

**选**：`READ` / `WRITE` 两档（[spec.md](file:///e:/AI/bxdc-bot/fishtank/openspec/changes/add-skill-share/specs/skill-share/spec.md) 已有定义）。

**理由**：
- 用户需求明确"分享后该用户可...调用 + 可编辑"—— 默认给 WRITE 即可
- WRITE 也只允许编辑**业务字段**（name/description/configuration/enabled/requiresConfirmation/avatar/introMd），**不允许**改 visibility / sharedWithUserIds / 删除 / 再分享
- 不做 OWNER 档（容易和 owner 混淆），用 `createdBy` 区分 owner

### 决策 3：API 端点设计

| 端点 | 方法 | 权限 | 用途 |
|---|---|---|---|
| `/api/skills/{id}/share` | POST | owner-only | 分享给 1..N 用户 |
| `/api/skills/{id}/share/{userId}` | DELETE | owner-only | 取消分享 |
| `/api/skills/{id}/shares` | GET | owner-only | 查看分享列表 |
| `/api/skills/shared-with-me` | GET | 任意用户 | 查看"分享给我的 Skill" |

**理由**：
- 子资源 `/share` `/share/{userId}` `/shares` —— REST 风格对齐 Skill 已有 `/api/skills` 下其他子资源（如 `/by-conversation` `/by-owner-type`）
- `shared-with-me` 平铺端点 —— 不需要走 `?ownerType=...` 复合过滤，直接给用户一个干净路径
- 不做 `/api/skills/{id}/transfer-ownership` —— 非本 change 范围

### 决策 4：WRITE 接收方的编辑边界

**实现**：在 [SkillController.updateSkill](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/controller/SkillController.java) 处增加校验：若 `createdBy != userId` 但当前 user 在 `shared_with_user_ids` 且 permission=WRITE，则允许更新业务字段，**拒绝**更新 `visibility` / `teamId` / `sharedWithUserIds` / `createdBy` / `id` / `createdAt` / `updatedAt` / `skillOwnerType`。

**理由**：spec "WRITE recipient can edit fields but not delete or share" 明确要求。

### 决策 5：可见性过滤 SQL

[SkillMapper.findVisibleSummaryForUser](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/mapper/SkillMapper.java) 增加 OR 条件：

```sql
(visibility = 'SHARED' AND FIND_IN_SET(#{userId}, shared_with_user_ids))
```

**理由**：`FIND_IN_SET` 是 MySQL 内置函数，按逗号分隔字符串查找 —— 与 `teamId` 现有查询模式一致。性能：每行扫 1024 字符，单用户库（< 1000 Skills）足够。

**否决**：
- `LIKE CONCAT('%,', #{userId}, ',%')` —— 需要保证字符串首尾带逗号，复杂度高
- JSON 数组列 + JSON_CONTAINS —— 需要改列类型，破坏向后兼容

### 决策 6：前端 UI 交互

**新增 [SkillShareDialog.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillShareDialog.vue)**：
- 触发：Skill 行"分享"按钮（owner-only）
- 内容：t-select（多选 + 远程搜索 user）/ 权限 radio（READ / WRITE）/ 已分享列表（含删除按钮）
- 提交：调 `POST /api/skills/{id}/share` 一次性 batch 添加

**复用 [useSkillHub.ts](file:///e:/AI/bxdc-bot/fishtank/frontend/src/composables/useSkillHub.ts)**：加 `shareSkill(id, userIds, permission)` / `unshareSkill(id, userId)` / `listSkillShares(id)` / `sharedWithMe()` 四个 composable 方法。

**Skill 列表行**：加 "分享给 N 人" badge（owner 视角）+ "分享给我" badge（接收方视角）。

**SkillHub 工具栏**：加 Tab 或筛选条件 —— `我的` / `共享给我` / `全部`。

### 决策 7：迁移策略

**DB schema 演进** —— 走 [SchemaMigrationRunner.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/SchemaMigrationRunner.java)：

```sql
ALTER TABLE skills ADD COLUMN shared_with_user_ids VARCHAR(1024) NULL AFTER team_id;
CREATE TABLE skill_share_record (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  skill_id BIGINT NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  permission VARCHAR(16) NOT NULL,
  shared_at DATETIME NOT NULL,
  UNIQUE KEY uk_skill_user (skill_id, user_id),
  INDEX idx_user (user_id),
  INDEX idx_skill (skill_id)
);
```

**MyBatis 实体**：[Skill.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/Skill.java) 加 `@TableField("shared_with_user_ids") private String sharedWithUserIds;`

**向后兼容**（spec "Backward compatibility" 场景）：存量 Skills 无 `shared_with_user_ids` = NULL → 不可见（除非 PUBLIC/PRIVATE/TEAM 命中）。

## Risks / Trade-offs

**[Risk 1] FIND_IN_SET 不走索引** → 单用户库规模 < 1000 Skills 时无感知；规模 > 10K 时需要重构成独立表 + 关联查询。
**[Mitigation]** 在 [SkillMapper.findVisibleSummaryForUser](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/mapper/SkillMapper.java) 加注释说明规模上限；后续如果性能瓶颈再做迁移。

**[Risk 2] WRITE 接收方编辑后 `updatedAt` 不记录 owner 信息** → spec 要求 "audit log records the recipient's user id, NOT the owner"。
**[Mitigation]** Skill 实体加 `updatedBy: String` 字段（nullable，迁移旧数据为 NULL）；WRITE 接收方编辑时填自己 user id；owner 编辑时填自己 user id（与 `createdBy` 同）。

**[Risk 3] 接收方在主 Agent 调用 Skill 时 `requiresConfirmation` 仍生效** —— 这条对接收方也是按需求"分享后可调用"的正确语义，但需要 confirmation 卡片显示 "分享自 <owner>" 上下文。
**[Mitigation]** agent-core 主 Agent confirmation 卡片组件加 `sharedFrom` 显示 —— 跨模块改动较大；本期先做数据 + UI，不动 agent-core confirmation 文案，留 TODO。

**[Risk 4] `DELETE /api/skills/{id}/share/{userId}` idempotent 行为** → spec 要求 200 OK；agent-core / 前端 cache 可能短暂持有 stale 数据。
**[Mitigation]** unshare 后通知前端 `refreshSkills()` —— composable `unshareSkill` 返回后调一次。

**[Risk 5] User 选择器需要远程搜索 + 分页** —— 已有 [UserController.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/controller/UserController.java) 提供 user 列表 API；远程搜索需确认是否支持 nickname 模糊匹配。
**[Mitigation]** 复用已有 user 搜索端点；如果不支持模糊，加 `GET /api/users?keyword=...&page=...&size=...` 参数。

## Migration Plan

**一次性部署**（无灰度）：

1. 部署 skill-gateway 新版（带新 SQL 迁移）：
   - [SchemaMigrationRunner](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/SchemaMigrationRunner.java) 启动时自动跑 `ALTER TABLE` + `CREATE TABLE`
2. 部署 frontend 新版（带 [SkillShareDialog.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillShareDialog.vue)）：
   - Vite HMR 自动应用，无需重启 vite
3. agent-core **无需变更** —— 它调 `GET /api/skills/by-conversation` 走 user-visible 过滤，filter 自动包含 SHARED

**回滚策略**：
- DB：`DROP TABLE skill_share_record; ALTER TABLE skills DROP COLUMN shared_with_user_ids;`
- 代码：回滚到前一个 commit

**数据兼容**：
- 存量 Skill 完全不受影响（NULL `shared_with_user_ids` 等同于不分享）
- 无需手动数据迁移

## Open Questions

1. **WRITE 接收方修改 Skill 后，owner 是否需要通知？** —— 当前 design 不做推送。可选：agent-core 加 SSE 通知，owner 收到 "你的 Skill 被 <recipient> 修改了" 事件。**结论**：本期不做，留后续增强。
2. **WRITE 接收方能否 "fork"（复制一份到自己名下）？** —— spec 未明确。本期不允许（按权限要求，WRITE 只能编辑业务字段，不能"另存为"）。**结论**：留 spec 增强空间。
3. **Public Skill 是否可分享？** —— 当前 design 允许（SHARED visibility 是顶层属性）。**结论**：保留 —— Public 全员可见 + 再分享给特定人是无副作用的额外能力。