## 1. 后端：DB schema + entity 扩展

- [ ] 1.1 在 [SchemaMigrationRunner.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/SchemaMigrationRunner.java) 加迁移：ALTER TABLE skills ADD COLUMN shared_with_user_ids VARCHAR(1024) NULL AFTER team_id; ALTER TABLE skills ADD COLUMN updated_by VARCHAR(64) NULL AFTER updated_at;
- [ ] 1.2 在 [SchemaMigrationRunner.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/config/SchemaMigrationRunner.java) 加迁移：CREATE TABLE skill_share_record (id BIGINT AUTO_INCREMENT PRIMARY KEY, skill_id BIGINT NOT NULL, user_id VARCHAR(64) NOT NULL, permission VARCHAR(16) NOT NULL, shared_at DATETIME NOT NULL, UNIQUE KEY uk_skill_user (skill_id, user_id), INDEX idx_user (user_id), INDEX idx_skill (skill_id))
- [ ] 1.3 [SkillVisibility.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/SkillVisibility.java) 加 SHARED 枚举值
- [ ] 1.4 [Skill.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/Skill.java) 加 `sharedWithUserIds: String` + `updatedBy: String` 两个 @TableField 字段 + getter/setter

## 2. 后端：mapper + entity for share record

- [ ] 2.1 新建 [SkillShareRecord.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/entity/)：字段 id/skillId/userId/permission/sharedAt + MyBatis Plus @TableName("skill_share_record")
- [ ] 2.2 新建 [SkillShareRecordMapper.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/mapper/SkillShareRecordMapper.java)：extends BaseMapper<SkillShareRecord> + 自定义方法 findBySkillId(Long skillId) / findBySkillIdAndUserId(Long, String) / deleteBySkillIdAndUserId(Long, String)

## 3. 后端：SkillShareService 业务逻辑

- [ ] 3.1 新建 [SkillShareService.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillShareService.java)：注入 SkillMapper + SkillShareRecordMapper + UserMapper
- [ ] 3.2 `shareSkill(skillId, userIds: List<String>, permission, currentUserId)` —— 校验 owner (createdBy == currentUserId)；校验所有 userIds 在 user 表存在；用 upsert 模式 (skillShareRecordMapper 存在则 update permission，否则 insert)；同步更新 skill.shared_with_user_ids（去重 + trim + 用逗号 join）
- [ ] 3.3 `unshareSkill(skillId, userId, currentUserId)` —— 校验 owner；deleteBySkillIdAndUserId；同步从 skill.shared_with_user_ids 移除 userId
- [ ] 3.4 `listShares(skillId, currentUserId)` —— 校验 owner；返回 List<{userId, userNickname, permission, sharedAt}>（按 sharedAt desc）
- [ ] 3.5 `listSharedWithMe(currentUserId)` —— 返回 List<Skill>，WHERE visibility='SHARED' AND FIND_IN_SET(#{currentUserId}, shared_with_user_ids)
- [ ] 3.6 加单元测试：owner share → list → unshare → list 回到空；重复 share 同 user 更新 permission；非 owner 调 share 抛 SecurityException

## 4. 后端：SkillMapper SQL 扩展（可见性过滤）

- [ ] 4.1 [SkillMapper.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/mapper/SkillMapper.java) 的 `findVisibleSummaryForUser` XML 加 OR 条件：(visibility = 'SHARED' AND FIND_IN_SET(#{userId}, shared_with_user_ids))
- [ ] 4.2 同 SQL 加：ORDER BY updated_at DESC（用户体验：最近分享/修改的排前）
- [ ] 4.3 同 SQL 在 select 字段加 `updated_by` 列（WRITE 接收方编辑后追溯用）

## 5. 后端：SkillService 业务逻辑扩展

- [ ] 5.1 [SkillService.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/service/SkillService.java) 的 `listSkillsForUser` 已通过 mapper 自动包含 SHARED，无需改；但需确认与 `findVisibleSummaryForUserByOwnerType` 的一致性
- [ ] 5.2 `getSkillByIdForUser` 加 SHARED 读权限：若 visibility=SHARED 且 userId 在 shared_with_user_ids → 允许查看（即使非 createdBy）
- [ ] 5.3 `updateSkill` 加 WRITE 接收方校验：若 createdBy != userId 但 userId 在 shared_with_user_ids 且对应 permission=WRITE → 允许更新业务字段，拒绝 visibility/teamId/sharedWithUserIds/createdBy/id/createdAt/updatedAt/skillOwnerType 变更
- [ ] 5.4 `updateSkill` 在更新时设置 `updatedBy = currentUserId`
- [ ] 5.5 `createSkill` 加 SHARED visibility 校验：visibility=SHARED 时 shared_with_user_ids 必须非空（至少 1 个 user id）
- [ ] 5.6 `deleteSkill` 加 WRITE 接收方拒绝：createdBy != userId 时拒绝删除（除非 owner）

## 6. 后端：SkillController REST API

- [ ] 6.1 [SkillController.java](file:///e:/AI/bxdc-bot/fishtank/backend/skill-gateway/src/main/java/com/lobsterai/skillgateway/controller/SkillController.java) 注入 SkillShareService
- [ ] 6.2 `POST /api/skills/{id}/share` —— body `{userIds: List<String>, permission: "READ"|"WRITE"}` + X-User-Id；调 SkillShareService.shareSkill；返回 201 + share record 列表
- [ ] 6.3 `DELETE /api/skills/{id}/share/{userId}` + X-User-Id；调 SkillShareService.unshareSkill；返回 200（idempotent）
- [ ] 6.4 `GET /api/skills/{id}/shares` + X-User-Id；调 SkillShareService.listShares；返回 200 + List<{userId, userNickname, permission, sharedAt}>；非 owner 返回 403
- [ ] 6.5 `GET /api/skills/shared-with-me` + X-User-Id；调 SkillShareService.listSharedWithMe；返回 200 + List<Skill>
- [ ] 6.6 全局异常处理：`SecurityException` → 403；`IllegalArgumentException` → 400；`EntityNotFoundException` → 404

## 7. 前端：useSkillHub composable 扩展

- [ ] 7.1 [useSkillHub.ts](file:///e:/AI/bxdc-bot/fishtank/frontend/src/composables/useSkillHub.ts) 加 type `SkillShareRecord = { userId: string; userNickname?: string; permission: 'READ' | 'WRITE'; sharedAt: string }`
- [ ] 7.2 加 `shareSkill(skillId, userIds, permission)` 函数：POST /api/skills/{id}/share；成功后 refreshSkills + emit
- [ ] 7.3 加 `unshareSkill(skillId, userId)` 函数：DELETE /api/skills/{id}/share/{userId}；成功后 refreshSkills
- [ ] 7.4 加 `listSkillShares(skillId)` 函数：GET /api/skills/{id}/shares；返回 Promise<SkillShareRecord[]>
- [ ] 7.5 加 `fetchSharedWithMe()` 函数：GET /api/skills/shared-with-me；返回 Promise<Skill[]>；新增 ref `sharedWithMeSkills: Ref<Skill[]>` 在 fetchSkills 之外独立调用

## 8. 前端：SkillShareDialog 组件

- [ ] 8.1 新建 [SkillShareDialog.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillShareDialog.vue)：t-dialog 包裹，props `{visible, skill}`；emit close / shared
- [ ] 8.2 选用户区：t-select (multiple) + 远程搜索 + 调 GET /api/users?keyword=...&page=...&size=...（如不支持模糊，先全量 GET /api/users）
- [ ] 8.3 权限选择：t-radio-group（READ / WRITE），默认 WRITE
- [ ] 8.4 已分享列表：调 listSkillShares(skill.id)，展示 userNickname + permission tag + 删除按钮（点击调 unshareSkill）
- [ ] 8.5 提交按钮：调 shareSkill → 关弹窗 + emit shared + refreshSkills

## 9. 前端：SkillHub 列表集成

- [ ] 9.1 [SkillHub.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillHub.vue) Skill 行加"分享"按钮（owner-only：canManageRow(skill) 为 true 时显示）
- [ ] 9.2 "分享"按钮 onClick 打开 SkillShareDialog，传入 skill
- [ ] 9.3 Skill 行加 badge：owner 视角显示"分享给 N 人"（t-tag theme="primary"），接收方视角显示"分享给我"（t-tag theme="success"）
- [ ] 9.4 SkillHub 工具栏加 Tab：t-tabs items [{label:'我的 Skill', value:'mine'}, {label:'共享给我', value:'shared'}]
- [ ] 9.5 切换 Tab 触发 fetchSkills (mine) 或 fetchSharedWithMe (shared)；复用同一列表渲染
- [ ] 9.6 接收方视角的 Skill 行"编辑"按钮调 canManageRow 检查（WRITE 接收方 → 可编辑；READ 接收方 → 编辑按钮变详情查看）

## 10. 前端：SkillManagementModal 集成（详情/编辑 modal）

- [ ] 10.1 [SkillManagementModal.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillManagementModal.vue) 加 t-tab "分享列表"（owner-only）：展示该 Skill 的 listSkillShares(skill.id) 结果 + "管理分享"按钮（打开 SkillShareDialog）
- [ ] 10.2 WRITE 接收方打开 modal 时不显示"分享列表" tab，但允许编辑业务字段；保存时调 updateSkill API

## 11. 验证

- [ ] 11.1 `cd frontend && npx vue-tsc -b` 静默通过（无 TS6133，AGENTS.md 5.6 强约束）；日志输出 E:\approot1\logs\
- [ ] 11.2 `cd frontend && npm run build` exit 0
- [ ] 11.3 `cd backend/skill-gateway && ./apache-maven-3.8.5/bin/mvn -s ./settings.xml compile` exit 0
- [ ] 11.4 启动 skill-gateway，确认 SchemaMigrationRunner 自动跑 ALTER TABLE + CREATE TABLE
- [ ] 11.5 手工测试场景（按 spec 全部 Scenario 走一遍）：
  - owner 分享给单个用户 READ → 接收方列表可见
  - owner 分享给多个用户 WRITE → 接收方可编辑业务字段
  - WRITE 接收方尝试改 visibility → 400
  - WRITE 接收方尝试改 sharedWithUserIds → 400
  - WRITE 接收方尝试删除 → 403
  - WRITE 接收方尝试 share → 403
  - 非 owner 调 share/unshare → 403
  - 分享给不存在的用户 → 400
  - 重复分享同用户 → permission 更新（不重复）
  - owner unshare → 接收方列表立即消失
  - owner unshare 已不存在的分享 → 200 idempotent
  - GET /api/skills/shared-with-me → 只返回分享给我的
  - owner 列表 GET /api/skills/{id}/shares → 含 permission + sharedAt
  - 存量 Skill（旧数据 NULL shared_with_user_ids）功能不受影响
- [ ] 11.6 `cd frontend && git status` 不含 dist/