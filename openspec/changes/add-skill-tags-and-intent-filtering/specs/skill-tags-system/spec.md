## ADDED Requirements

### Requirement: 技能三维度标签数据模型

`skills` 表 MUST 包含三个 VARCHAR(32) 可空标签列：`file_type`、`operation_intent`、`business_scenario`。三列与现有 `search_weight` 字段独立，允许单独为 NULL 表示未分类。

#### Scenario: 空库初始化携带三列
- **WHEN** MySQL 容器首次启动且执行 `schema-mysql.sql`
- **THEN** `skills` 表 CREATE 语句 MUST 含 3 个 VARCHAR(32) 可空列
- **AND** 列默认值为 NULL（不强制非空）

#### Scenario: 旧库升级自动补列
- **WHEN** 老部署环境的 skills 表只有 e2ac8ce 的列，**没有** file_type / operation_intent / business_scenario
- **THEN** `SchemaMigrationRunner.migrateSkills()` MUST 用 `ensureColumn` 模式幂等补列
- **AND** `IF NOT EXISTS` / `INFORMATION_SCHEMA` 检查保证重复启动不报错
- **AND** AGENTS.md §5.3 自查 checklist 全部通过

### Requirement: 种子数据覆盖本次需求图示的 47 个文件工具

`FileToolSeeder.run()` MUST 在 seed 现有 37 个文件工具时同步写 3 个标签，标签内容与本次需求图示表格**完全一致**。

#### Scenario: file_list 标签正确
- **WHEN** `registerTool("file_list", ...)` 首次写入或更新 DB
- **THEN** 该行 `file_type` = "通用", `operation_intent` = "展示", `business_scenario` = "文件管理"

#### Scenario: file_write 标签正确
- **WHEN** `registerTool("file_write", ...)` 写入
- **THEN** `file_type` = "通用", `operation_intent` = "写入", `business_scenario` = "生成导出"

#### Scenario: excel_aggregate 标签正确
- **WHEN** `registerTool("excel_aggregate", ...)` 写入
- **THEN** `file_type` = "Excel", `operation_intent` = "分析", `business_scenario` = "计算分析"

#### Scenario: word_extract_content 标签正确
- **WHEN** `registerTool("word_extract_content", ...)` 写入
- **THEN** `file_type` = "Word", `operation_intent` = "提取", `business_scenario` = "提取解析"

#### Scenario: md_filter_section 标签正确
- **WHEN** `registerTool("md_filter_section", ...)` 写入
- **THEN** `file_type` = "Markdown", `operation_intent` = "修改", `business_scenario` = "编辑整理"

#### Scenario: 旧行 NULL 自动回填
- **WHEN** 重启 gateway 时发现某 file_type / operation_intent / business_scenario 为 NULL
- **THEN** FileToolSeeder MUST UPDATE 该行的三列为正确值（已有逻辑是触发 update 而非 insert 时机）

### Requirement: 单一权威源

标签词汇 MUST 只在 `FileToolSeeder.TOOL_TAGS` 一处定义。agent-core prompt 中的 "白名单 23 标签" 列表 MUST 通过 tools.md 注释与 `FileToolSeeder.TOOL_TAGS` 双向引用；任何分歧 MUST 在 PR review 阶段拒绝合并。

#### Scenario: 词表唯一性
- **WHEN** agent-core `INTENT_RECOGNITION_SYSTEM_PROMPT` 中出现"写入"标签
- **THEN** `FileToolSeeder.TOOL_TAGS.get("file_write").operationIntent` MUST 也包含 "写入"
- **AND** 任何一边改动另一边的硬同步是 PR 评审 check item
