## ADDED Requirements

### Requirement: UserFile 实体映射 conversationId

`UserFile` 实体 SHALL 映射 `conversation_id` 字段为 `conversationId` 属性，类型 `String`，可为 NULL。

#### Scenario: 实体取值
- **WHEN** 从 DB 查询 `user_files` 行
- **THEN** `userFile.getConversationId()` 返回 `conversation_id` 列的值（或 NULL）

### Requirement: enabled_files 上限为 5

会话的 `enabled_files` 数组 SHALL 最多包含 5 个文件 ID。前端和后端 MUST 双重校验。

#### Scenario: 前端保存时拒绝超过 5 个
- **WHEN** 用户在配置面板勾选 6 个文件并点击保存
- **THEN** 前端阻止保存，显示 "最多选择 5 个文件"

#### Scenario: 后端拒绝超过 5 个
- **WHEN** `PUT /api/conversations/{id}` 的 `enabled_files` 包含 6 个 ID
- **THEN** 后端返回 400，错误信息说明上限为 5

#### Scenario: 存量会话超过 5 个不强制裁剪
- **WHEN** 存量会话的 `enabled_files` 已有 6 个文件
- **THEN** 加载配置面板时正常展示 6 个勾选，但提示用户 "已超出 5 个上限，请取消勾选部分文件"
- **AND** 用户可以取消勾选，但不能新增勾选超过 5 个

### Requirement: 临时文件写入 conversationId

所有工具生成文件（`is_tool_generated=1`）创建 `user_files` 行时 SHALL 填充 `conversation_id` 为当前会话 ID。

#### Scenario: excel_filter 生成临时文件
- **WHEN** LLM 在会话 `conv-abc` 中对文件 ID=10 调 `excel_filter`
- **THEN** 新 `user_files` 行的 `is_tool_generated` = 1
- **AND** `conversation_id` = `conv-abc`

#### Scenario: word_write 新建文件
- **WHEN** LLM 在会话 `conv-xyz` 中调 `word_write`
- **THEN** 新 `user_files` 行的 `is_tool_generated` = 1
- **AND** `conversation_id` = `conv-xyz`

#### Scenario: 没有会话上下文时不写
- **WHEN** `FileToolController` 直调工具（无 conversationId）
- **THEN** 新 `user_files` 行的 `conversation_id` = NULL（向后兼容）

### Requirement: 临时文件不进入 enabled_files

工具生成文件 SHALL NOT 自动加入 `enabled_files`。`autoBindCreatedFiles` 逻辑 MUST 对 `is_tool_generated=1` 的文件跳过。

#### Scenario: 工具生成文件不绑定 enabled_files
- **WHEN** `autoBindCreatedFiles` 检测到新文件 `is_tool_generated=1`
- **THEN** 不调用 `conversationService.appendEnabledFile()`

### Requirement: 临时文件按 conversationId 隔离

操作类工具（Excel/Word/Txt/MD 的读写）校验文件权限时 SHALL 对 `is_tool_generated=1` 的文件检查 `conversationId` 匹配，而非检查 `enabled_files`。

#### Scenario: 同会话临时文件可操作
- **WHEN** LLM 在会话 `conv-abc` 中调 `word_read(fileId=50)`
- **AND** 文件 ID=50 的 `is_tool_generated=1` 且 `conversation_id=conv-abc`
- **THEN** 校验通过，正常执行

#### Scenario: 跨会话临时文件被拒绝
- **WHEN** LLM 在会话 `conv-xyz` 中调 `txt_read(fileId=50)`
- **AND** 文件 ID=50 的 `is_tool_generated=1` 且 `conversation_id=conv-abc`
- **THEN** 返回错误 "临时文件(50)不属于当前会话"

#### Scenario: 存量临时文件（conversation_id=NULL）全量允许
- **WHEN** LLM 在任意会话中调 `excel_read(fileId=50)`
- **AND** 文件 ID=50 的 `is_tool_generated=1` 且 `conversation_id=NULL`
- **THEN** 校验通过，允许操作（向后兼容）

### Requirement: 用户上传文件 conversationId 非空

用户上传文件（`is_tool_generated=0`）如果有关联的 `conversationId`，SHALL 写入 `user_files.conversation_id`。

#### Scenario: 上传时写入 conversationId
- **WHEN** 用户在会话 `conv-abc` 中上传文件
- **AND** 请求携带 `conversationId=conv-abc`
- **THEN** `user_files` 行的 `conversation_id` = `conv-abc`

#### Scenario: 上传时不带 conversationId
- **WHEN** 用户在文件管理页（独立页面，不在具体会话内）上传文件
- **AND** 请求未携带 `conversationId`（或为空字符串）
- **THEN** `user_files` 行的 `conversation_id` = NULL
- **AND** 文件仍正常入库
- **AND** 用户后续可在配置面板把它勾选到任意会话

### Requirement: SkillController 提取 X-Conversation-Id

`POST /api/skills/execute` SHALL 从 `X-Conversation-Id` header 提取 `conversationId`，写入 `ExecuteRequest.conversationId`，使下游 `executeFileToolSkill` 获得有效值。

#### Scenario: agent-core 发送 X-Conversation-Id
- **WHEN** agent-core 调 `POST /api/skills/execute` 并带 `X-Conversation-Id: conv-abc`
- **THEN** `ExecuteRequest.conversationId` = `conv-abc`
- **AND** `executeFileToolSkill` 获得 `conversationId = conv-abc`

#### Scenario: 没有发送 X-Conversation-Id 时向后兼容
- **WHEN** 请求没有 `X-Conversation-Id` header
- **THEN** `ExecuteRequest.conversationId` = null（向后兼容，不启隔离）

### Requirement: file_list 展示同会话临时文件

`file_list` 工具 SHALL 展示 (1) `enabled_files` 中的用户上传文件 + (2) 同 `conversationId` 的临时文件。

#### Scenario: 列表包含同会话临时文件
- **WHEN** 会话 `conv-abc` 的 `enabled_files=[10, 20]`
- **AND** 该会话产生的临时文件有 ID=30（is_tool_generated=1, conversation_id=conv-abc）
- **AND** 其他会话的临时文件有 ID=40（is_tool_generated=1, conversation_id=conv-xyz）
- **THEN** `file_list` 返回 ID=10, 20, 30
- **AND** 不返回 ID=40

### Requirement: file_delete/clear_all 对临时文件的会话隔离

`file_delete` 和 `file_clear_all` SHALL 仅能操作 (1) `enabled_files` 中的用户文件 + (2) 同 `conversationId` 的临时文件。

#### Scenario: 删除同会话临时文件允许
- **WHEN** LLM 在会话 `conv-abc` 调 `file_delete(fileId=30)`
- **AND** 文件 ID=30 `is_tool_generated=1` 且 `conversation_id=conv-abc`
- **THEN** 允许删除

#### Scenario: 删除跨会话临时文件被拒绝
- **WHEN** LLM 在会话 `conv-abc` 调 `file_delete(fileId=40)`
- **AND** 文件 ID=40 `is_tool_generated=1` 且 `conversation_id=conv-xyz`
- **THEN** 拒绝并提示文件不属于当前会话

### Requirement: 工具链式调用不破坏隔离

LLM 在同一会话内连续调用 file_tool（先写后读）时，新产生的临时文件 SHALL 在后续调用中可被立即访问，无需用户介入。

#### Scenario: excel_filter 写后立刻 excel_read 读
- **WHEN** LLM 在会话 `conv-abc` 调 `excel_filter(fileId=10, ...)`，返回 `newFileId=99`
- **AND** 立即在下一轮调 `excel_read(fileId=99)`
- **THEN** `excel_read` 校验通过（`fileId=99.conversation_id == "conv-abc"`）
- **AND** 不需要用户手动把 99 加入 `enabled_files`

#### Scenario: 跨会话链路调用被拒绝
- **WHEN** 会话 `conv-abc` 内 LLM 调 `excel_filter` 产生新文件 ID=99（`conversation_id=conv-abc`）
- **AND** 用户切换到会话 `conv-xyz` 继续 LLM 调 `excel_read(fileId=99)`
- **THEN** `excel_read` 拒绝（`conversation_id` 不匹配）
