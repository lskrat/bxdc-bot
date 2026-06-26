## Why

当前 `enabled_files` 将用户上传文件和工具生成临时文件混在同一列表管理，导致两个问题：(1) 用户需要手动勾选临时文件才能让 LLM 操作，但临时文件是 LLM 自己生成的、用户不应感知；(2) 临时文件在多个会话间共享可见，可能泄露其他会话的工作产物。本次改动用两套机制分别管理两类文件：用户文件靠 `enabled_files`（上限 5 个），临时文件靠 `conversation_id` 自动绑定。

## What Changes

- **用户上传文件限制**：`enabled_files` 上限从无限制改为 **最多 5 个**，前端和后端双重校验
- **临时文件自动绑定会话**：工具生成文件写入时填充 `user_files.conversation_id`，不再加入 `enabled_files`
- **临时文件会话隔离**：`file_tool` 操作在校验权限时，除了检查 `enabled_files`，还检查 `userFile.conversationId == 当前会话 Id`
- **修复隔离生效**：`SkillController.executeSkill()` 提取 `X-Conversation-Id` 头写入 `ExecuteRequest.conversationId`
- **前端调整**：配置面板文件 Tab 展示上限提示（如 "3/5"），上传/勾选超过 5 个时前端阻止并提示

## Capabilities

### New Capabilities
- `file-isolation-v2`: 文件会话隔离 v2——`enabled_files` 上限 5 个（只存用户上传文件）+ 临时文件按 `conversation_id` 自动绑定（不进入 `enabled_files`）+ 修复 `SkillController` `X-Conversation-Id` 提取断链

### Modified Capabilities
- `temp-file-filtering`: 文件列表过滤维度从 `source_file_id` 改为 `is_tool_generated`+`conversation_id` 组合判断；`GET /api/files` 仍仅展示用户上传文件；`file_list` 工具新增"同会话临时文件"可见

## Impact

- **DB**: `user_files.conversation_id` 列已存在，需在 `UserFile` 实体、`UserFileMapper` 补充映射；新增 `findByConversationId` 查询方法；临时文件写入处填充 `conversationId`
- **gateway**: `SkillController`、`FileToolService`、`FileManageService`、各 ToolService（`ExcelFileToolService`/`WordToolService`/`TxtToolService`/`MdToolService`）写入 `conversationId`；`FileUploadController` 上传时写入 `conversationId`
- **agent-core**: 无需改动（已发送 `X-Conversation-Id`）
- **前端**: `ConversationSkillPanel.vue` 文件 Tab 加上限校验（最多勾选 5 个）和提示
- **向后兼容**: 存量 `user_files` 行 `conversation_id=NULL` 的视为全量可见（不受会话隔离）；存量 `enabled_files` 超过 5 个的会话保留现有勾选但前端提示用户整理
