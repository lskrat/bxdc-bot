# Proposal: Skill 分享给指定用户

## Why

当前 Skill 的可见性模型只有 `PUBLIC`（全员可见）/ `PRIVATE`（仅创建者）/ `TEAM`（按 user_team 整组成员）三种粒度（[SkillVisibility.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/SkillVisibility.java)）。**没有"分享给单个指定用户"的能力**——导致：

1. 用户想临时把 Skill 给同事用一下，必须**先建一个 team**（成本高、对"临时协作"过度）
2. 想"半公开"（不给全员但给特定几个人），只能逐个建 team 或改成 `PUBLIC` 后承担数据外泄风险
3. 已有 [skill-import-export](file:///e:/AI/bxdc-bot/fishtank/openspec/specs/skill-import-export/spec.md) 的导出/导入流程，但那是**离线**（导出 JSON、共享文件、再导入）—— 体验差，**做不到"一键发"**

需要新增 `SHARED` 可见性 + "分享给用户"动作，让创建者直接选择 1..N 个具体用户作为接收方；接收方能在自己的 Skill 列表里看到、调用、编辑（默认不能改/删/再分享，可选权限）。

## What Changes

- 新增 `SkillVisibility.SHARED` 枚举值
- 新增字段 `sharedWithUserIds: String`（逗号分隔 user id 列表，语义对齐已有 `teamId`）
- 新增 REST API：
  - `POST /api/skills/{id}/share` body `{userIds: string[], permission: "READ"|"WRITE"}` —— 把 Skill 分享给指定用户
  - `DELETE /api/skills/{id}/share/{userId}` —— 取消分享
  - `GET /api/skills/{id}/shares` —— 查看分享列表
  - `GET /api/skills/shared-with-me` —— 查看"分享给我的 Skill"列表
- 扩展 `GET /api/skills` 的可见性过滤：用户能看到自己的 PRIVATE / 自己创建或被分享的 SHARED / 自己在 team 里的 TEAM / 全部 PUBLIC
- 权限语义（按需求"可调用 + 可编辑"）：
  - 默认 `READ` —— 接收方可在列表看到、可调用、可查看详情、可在主 Agent 会话勾选使用
  - 可选 `WRITE` —— 接收方还可编辑字段（name / description / configuration 等），但**仍不能**删除或转分享（owner-only）
  - 任何接收方都**不能**改 visibility / 不能改 sharedWithUserIds / 不能删 Skill
- 前端 SkillHub：
  - Skill 行加"分享"按钮（owner-only）→ 弹对话框选用户（带搜索）+ 选权限
  - 列表展示"分享给 N 人"徽章
  - "分享给我"Tab 或筛选
  - 详情/编辑页加"分享列表"区域
- 数据迁移：存量 Skill 无需迁移（默认还是 PRIVATE/PUBLIC/TEAM，向后兼容）

**BREAKING**：扩展 SkillVisibility 枚举 + 新增 `sharedWithUserIds` 字段—— 但通过 MyBatis-Plus `@TableField` 默认值兼容（新增字段 nullable，老数据全 NULL），不算真正的破坏性变更。

## Capabilities

### New Capabilities

- `skill-share`: Skill 分享给指定用户的能力——含 SHARED 可见性、share API、权限模型、前端分享 UI、被分享方列表展示

### Modified Capabilities

- 无（不影响任何已有 spec 的 REQUIREMENTS；skill-import-export 的 visibility 语义不变）

## Impact

### 后端（skill-gateway，Spring Boot）

- 新增 entity: [SkillShareRecord.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/)（可选，存单条 share 记录，含 permission/createdAt，便于审计和分权管理——也可走 `sharedWithUserIds` 字符串列简化）
- 新增 mapper: SkillShareRecordMapper（如果选独立表）
- 新增 service: SkillShareService
- 扩展 [SkillController.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/controller/SkillController.java) — 新增 4 个端点
- 扩展 [SkillService.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillService.java) — `listSkillsForUser` 加 SHARED 过滤；`getSkillByIdForUser` 加 SHARED 读权限
- 扩展 [Skill.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/Skill.java) — 加 `sharedWithUserIds` 字段 + `skillOwnerType` 语义不变
- 扩展 [SkillVisibility.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/SkillVisibility.java) — 加 SHARED 枚举
- 扩展 [SkillMapper.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/mapper/SkillMapper.java) SQL — `findVisibleSummaryForUser` 加 SHARED 分支（user 在 `sharedWithUserIds` 中）
- DB schema 迁移：`skills` 表加 `shared_with_user_ids VARCHAR(1024) NULL`

### 前端（Vue 3 + TDesign）

- 扩展 [SkillHub.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillHub.vue) — 工具栏"分享给我"Tab / 筛选 + 行"分享"按钮
- 新增 [SkillShareDialog.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillShareDialog.vue) — 选用户 + 选权限 + 确认
- 扩展 [SkillManagementModal.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillManagementModal.vue) — 分享列表区
- 扩展 [useSkillHub.ts](file:///e:/AI/bxdc-bot/fishtank/frontend/src/composables/useSkillHub.ts) — share / unshare / listShares composable

### 文档

- 新增 OpenSpec spec: `openspec/specs/skill-share/spec.md`（archive 后同步到 main specs）