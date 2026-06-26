## 1. 后端：DTO 与 Controller 扩展

- [x] 1.1 在 `SkillController` 添加 `SkillImportRequest` DTO（fields: `metaSchemaVersion: String`, `payload: SkillDto`, `overrideStrategy: String?`）
- [x] 1.2 扩展 `POST /api/skills` 接收可选 `importPayload` 字段；当前 user 必须是 createdBy（覆盖 payload.createdBy）
- [x] 1.3 加字段大小校验：`name ≤ 100`, `description ≤ 2000`, `configuration ≤ 65536`，超限返回 400

## 2. 后端：导入入口校验

- [x] 2.1 `SkillController.createSkill` 检查 `importPayload != null` 走导入分支：拒绝覆盖 createdBy="public" 的系统种子
- [x] 2.2 若 `metaSchemaVersion` 解析失败 / 不匹配当前支持版本，返回 400 + 错误信息 `unsupported-meta-schema-version`
- [ ] 2.3 加单元测试：导出→导入 round-trip 测试（同一 Skill 导出 JSON 后导入应能还原核心字段）— 等前端工具函数 + SkillImportDialog 完成后一起做

## 3. 前端：工具函数

- [ ] 3.1 新建 [frontend/src/utils/skillExport.ts](file:///e:/AI/bxdc-bot/fishtank/frontend/src/utils/skillExport.ts)：`exportSkillToJson(skill, currentUser)` → 返回 `SkillExportPayload` 对象（含 metaSchemaVersion、exportedAt、exportedBy、sourceType、skill）
- [ ] 3.2 同文件实现 `stripSessionScopedFields(configuration: string): string`：删除 conversationId/sessionId/userId/xUserId 键
- [ ] 3.3 同文件实现 `downloadSkillJson(skill, currentUser)`：调 stripSessionScopedFields + Blob + URL.createObjectURL + `<a download>` + revokeObjectURL（参考 [fileService.downloadFile](file:///e:/AI/bxdc-bot/fishtank/frontend/src/services/fileService.ts) 的 blob 下载模式）
- [ ] 3.4 新建 [frontend/src/utils/skillImport.ts](file:///e:/AI/bxdc-bot/fishtank/frontend/src/utils/skillImport.ts)：`parseSkillJson(text: string): SkillExportPayload` → 校验 + 解析 + 返回；失败抛 `SkillImportError`

## 4. 前端：SkillImportDialog 组件

- [ ] 4.1 新建 [frontend/src/components/SkillImportDialog.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillImportDialog.vue)：Dialog 包裹，props `{visible: boolean, currentUser: User}`，emit `(close, imported)`
- [ ] 4.2 Dialog 内含 3 个状态：`idle`（待选文件）/ `preview`（已解析，待确认）/ `conflict`（命名冲突）
- [ ] 4.3 `idle` 状态：拖拽区 + 选文件按钮 + 格式说明 + 关闭按钮
- [ ] 4.4 `preview` 状态：展示 Skill 名称（可改名）、类型徽章、description、字段计数、"确认导入"按钮
- [ ] 4.5 `conflict` 状态：命名冲突时弹三选一：覆盖 / 重命名（输入框 + HHmmss 后缀提示）/ 取消
- [ ] 4.6 文件读取失败（不是 JSON / schema 不匹配）→ 切回 `idle` + toast 红色错误

## 5. 前端：SkillHub 集成

- [ ] 5.1 在 [frontend/src/components/SkillHub.vue](file:///e:/AI/bxdc-bot/fishtank/frontend/src/components/SkillHub.vue) 行尾"编辑/删除"按钮旁加"导出"按钮（仅当 `canManageRow(skill)` 为 true 时显示）
- [ ] 5.2 导出按钮 `@click` 调 `downloadSkillJson(skill, currentUser.value)`
- [ ] 5.3 系统种子 Skill（createdBy="public"）导出按钮 disabled + tooltip
- [ ] 5.4 工具栏新增"导入 Skill"按钮 + 导入对话框 ref
- [ ] 5.5 导入成功后调 `refreshSkills()` 刷新列表

## 7. 验证

- [ ] 7.1 `cd frontend && npx vue-tsc -b` 必须静默通过（无 TS6133，AGENTS.md 5.6 强约束）
- [ ] 7.2 `cd frontend && npm run build` 必须 exit 0
- [ ] 7.3 后端 `mvn compile` exit 0；新加单元测试 round-trip 通过
- [ ] 7.4 手工测试场景（按 spec 13 个 scenario 走一遍）：
  - 导出 + 导入同名无冲突 → 成功
  - 导出 + 导入有冲突 → 三选一覆盖/重命名/取消
  - 系统种子 Skill → 导出按钮 disabled
  - 跨 user 导入 → createdBy 强制改为 importer
  - 损坏 JSON → 错误提示不写入
  - 跨会话字段剥离 → 导出后 configuration 不含 conversationId
- [ ] 7.5 `cd frontend && git status` 不含 `dist/`