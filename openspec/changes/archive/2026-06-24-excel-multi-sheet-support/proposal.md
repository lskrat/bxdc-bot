## Why

Excel 系列文件技能（excel_read 及各类变换/校验技能）此前硬编码只操作第一个工作表（`wb.getSheetAt(0)`），无法读取或处理多工作表文件的其他 sheet；同时 excel_write 在传 fileId 时用全新工作簿整体覆盖原文件，导致写入第二个 sheet 时第一个 sheet 连同整个文件被覆盖，多工作表文件无法正确构建。

## What Changes

- excel_read 支持通过 `sheetName`（优先）或 `sheetIndex`（默认 0）指定工作表，返回结果新增 `sheetName`、`sheetIndex`、`totalSheets`、`sheetNames` 工作表元信息。
- excel_filter / excel_sort / excel_aggregate / excel_pivot / excel_calculate / excel_select_columns / excel_clean / excel_convert_format / excel_validate 全部支持 `sheetName` / `sheetIndex` 指定工作表（默认第一个），指定工作表不存在时返回明确错误。
- excel_convert_format 转 CSV 时按 `sheetName` / `sheetIndex` 导出指定工作表。
- excel_write 支持 `sheetName` 指定工作表名；**修复多 sheet 覆盖缺陷**：传 fileId 时在原文件工作簿上追加/替换指定 sheet（其余 sheet 保留），不再整体覆盖。
- 各 Excel 技能的 description 与参数 schema 精简并补充 sheet 相关说明，指导 LLM 正确按"首次不传 fileId 建首个 sheet、后续同 fileId 追加其余 sheet"流程构建多工作表文件。

## Capabilities

### New Capabilities
- `excel-multi-sheet`: Excel 文件技能的多工作表读取与写入能力，包括按名称/索引选择工作表、返回工作表元信息、多 sheet 追加写入而不覆盖已有 sheet。

### Modified Capabilities
<!-- 无现存 spec 的 requirement 变更 -->

## Impact

- `backend/skill-gateway/.../service/tools/ExcelFileToolService.java`：新增 `getSheet/getSheetIndex/getSheetName` 辅助方法；各 excel* 方法加入 sheet 参数解析与校验；excelWrite 多 sheet 追加逻辑修复。
- `backend/skill-gateway/.../config/FileToolSeeder.java`：各 Excel 技能 schema 增加 `sheetName`/`sheetIndex` 参数，description 精简并补充 sheet 说明。
- 无新增第三方依赖、无数据库 schema 变更、无环境变量新增。
- description/schema 变更需重启 skill-gateway 经 `seedSkill` 刷新到 `skills` 表后生效。
