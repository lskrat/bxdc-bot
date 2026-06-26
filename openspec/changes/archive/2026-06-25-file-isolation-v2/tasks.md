## 1. 数据层 — UserFile 实体激活 conversationId

- [x] 1.1 `UserFile` 实体增加 `@TableField("conversation_id") private String conversationId` 及 getter/setter
- [x] 1.2 `UserFileMapper` 增加 `findByConversationId(String conversationId, String userId)` 查询方法

## 1.5 存量数据迁移 — SchemaMigrationRunner 幂等修正

- [x] 1.5.1 `SchemaMigrationRunner.migrateUserFiles()` 新增幂等修正：将 `is_tool_generated=0` 且 `source_file_id IS NOT NULL` 的行更新为 `is_tool_generated=1`（这些行实际上是工具生成的临时副本，之前 `is_tool_generated` 列加得晚拿了默认 0）
- [x] 1.5.2 修正后打印受影响行数到日志（便于排查）
- [x] 1.5.3 在变更前手动跑 `SELECT COUNT(*) FROM user_files WHERE is_tool_generated=0 AND source_file_id IS NOT NULL` 确认受影响行数（验收）

## 2. 修复隔离生效 — SkillController 提取 X-Conversation-Id

- [x] 2.1 `SkillController.executeSkill()` 增加 `@RequestHeader("X-Conversation-Id")` 参数提取
- [x] 2.2 将提取值写入 `req.conversationId`

## 3. 权限核心 — FileToolService / FileToolConversationContext 改造

- [x] 3.1 `FileToolConversationContext` 扩展支持存储 `conversationId` 字符串（除 `List<Long>` 外）
- [x] 3.2 `FileToolService.execute()` 中：
  - `resolveEnabledFiles()` 获取 `enabledFiles` 列表
  - `FileToolConversationContext` 同时设置 `enabledFiles` + `conversationId`
  - 操作类工具校验改造：用户文件检查 `enabledFiles`，临时文件检查 `conversationId` 匹配
- [x] 3.3 `autoBindCreatedFiles` 对 `is_tool_generated=1` 的文件跳过绑定 `enabled_files`

## 4. FileManageService — 列表/删除/清空/详情按双路径过滤

- [x] 4.1 `file_list`：用户上传文件按 `enabledFiles` 过滤 + 同会话临时文件按 `conversationId` 追加
- [x] 4.2 `file_delete`：用户文件需在 `enabledFiles` 中，临时文件需同 `conversationId`
- [x] 4.3 `file_clear_all`：仅清空 `enabledFiles` 内 + 同会话临时文件
- [x] 4.4 `file_detail`：同上校验逻辑

## 5. 临时文件写入 conversationId — 各 ToolService 改造

- [x] 5.1 `FileToolService` 增加将 `conversationId` 传入 handler 的机制（通过 `FileToolConversationContext` 或参数）
- [x] 5.2 `ExcelFileToolService` 所有 `new UserFile()` + `setIsToolGenerated(1)` 处增加 `setConversationId()`
- [x] 5.3 `WordToolService` 同上
- [x] 5.4 `TxtToolService` 同上
- [x] 5.5 `MdToolService` 同上

## 6. 用户上传时写入 conversationId

- [x] 6.1 `FileUploadController.uploadFile()` 上传文件时写入 `userFile.setConversationId(conversationId)`

## 7. enabled_files 上限校验

- [x] 7.1 `ConversationService` 增加常量 `public static final int MAX_ENABLED_FILES = 5`
- [x] 7.2 `ConversationService` 增加私有 helper `validateEnabledFilesSize(List<Long> ids)`：超过上限抛 `IllegalArgumentException("enabled_files 最多 5 个文件")`
- [x] 7.3 在所有 `enabled_files` 写入路径调用统一 helper：`appendEnabledFile()` 调用
- [x] 7.4 `ConversationController` 把 helper 异常翻译成 `400` + 中文错误信息
- [x] 7.5 前端 `ConversationSkillPanel.vue` 文件 Tab：
  - 勾选时实时统计已选数量（"已选 N/5"），超过 5 时禁用未勾选的复选框
  - 全选按钮限制最多选 5 个
  - 选满时提示变红

## 8. 验证与测试

- [x] 8.1 vue-tsc -b 静默通过（零 TS6133）
- [x] 8.2 npm run build exit 0
- [ ] 8.3 curl 测试 `file_list` 只返回 `enabled_files` + 同会话临时文件（需启动服务）
- [ ] 8.4 curl 测试跨会话临时文件操作被拒绝（需启动服务）
- [ ] 8.5 前端测试勾选超过 5 个文件被阻止（需启动前端）
- [ ] 8.6 存量会话（`conversationId=NULL`）文件操作不受影响（需启动服务）
