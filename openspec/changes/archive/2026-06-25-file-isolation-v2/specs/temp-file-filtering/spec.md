## MODIFIED Requirements

### Requirement: Check-duplicate 排除临时文件

`GET /api/files/check-duplicate?fileName=xxx` SHALL 不匹配 `source_file_id IS NOT NULL` 的行。

#### Scenario: 查重不命中临时文件
- **WHEN** 用户已有 `report_temp.docx`（临时文件，source_file_id=5）和 `report.docx`（原文件，source_file_id=NULL）
- **AND** 用户上传 `report.docx`
- **THEN** `check-duplicate?fileName=report.docx` 返回 `exists=true`（命中原文件）
- **AND** 不会因 `_temp` 后缀命中误报

#### Scenario: 查重跳过已存在的临时文件
- **WHEN** 用户只有 `data_temp.xlsx`（临时文件，source_file_id=3）
- **AND** 用户上传 `data_temp.xlsx`
- **THEN** `check-duplicate?fileName=data_temp.xlsx` 返回 `exists=false`（临时文件被跳过）

### Requirement: 文件列表过滤语义统一

过滤规则 SHALL 仅基于 `is_tool_generated` + `conversation_id`，不再使用 `source_file_id`：
- `GET /api/files`：返回 `is_tool_generated=0` 的行（仅用户上传文件，不分会话）
- `file_list` 工具（在 `file-isolation-v2` 激活后）：返回 `is_tool_generated=0` 的行（用户上传且在 `enabled_files` 中） + `is_tool_generated=1` 且 `conversation_id == 当前会话 Id` 的行（同会话临时文件）
- `file_detail`：不限类型，按 fileId/fileRef/fileName 直接查（已被 file-isolation-v2 中 `enabled_files` 或 `conversationId` 校验拦截）

#### Scenario: 前端 GET /api/files 仅展示用户上传文件
- **WHEN** 用户有 `a.docx`（`is_tool_generated=0`）、`a_temp.docx`（`is_tool_generated=1`、`source_file_id!=NULL`）、`b.xlsx`（`is_tool_generated=0`）
- **THEN** `GET /api/files` 返回 2 条：`a.docx` + `b.xlsx`
- **AND** 不返回 `a_temp.docx`

#### Scenario: file_list 包含同会话临时文件
- **WHEN** 会话 `conv-abc` 的 `enabled_files=[10, 20]`（均 `is_tool_generated=0`）
- **AND** 同会话产生临时文件 ID=30（`is_tool_generated=1`、`conversation_id=conv-abc`、`source_file_id=NULL`，即新建）
- **AND** 同会话产生临时副本 ID=31（`is_tool_generated=1`、`conversation_id=conv-abc`、`source_file_id=10`，即修改产生）
- **THEN** `file_list` 在 `conv-abc` 中返回 ID=10、20、30、31

#### Scenario: file_list 排除跨会话临时文件
- **WHEN** 会话 `conv-abc` 产生临时文件 ID=40（`conversation_id=conv-abc`）
- **AND** 会话 `conv-xyz` 调 `file_list`
- **THEN** ID=40 不出现在 `conv-xyz` 的 `file_list` 结果中

#### Scenario: file_detail 仍可查任意临时文件
- **WHEN** 调用 `file_detail(fileId=99)`（文件为 `is_tool_generated=1`，但 fileId 已知）
- **THEN** 返回其元数据
- **AND** 由 `file-isolation-v2` 的 `enabledFiles`/`conversationId` 校验决定是否在调用前拒绝（不与本需求重复）
