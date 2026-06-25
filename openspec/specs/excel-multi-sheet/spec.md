# excel-multi-sheet Specification

## Purpose
Excel 文件技能的多工作表读取与写入能力：按名称/索引选择工作表、返回工作表元信息、多 sheet 追加写入而不覆盖已有工作表。

## Requirements
### Requirement: 按名称或索引选择工作表
所有 Excel 读取与变换技能（excel_read、excel_filter、excel_sort、excel_aggregate、excel_pivot、excel_calculate、excel_select_columns、excel_clean、excel_convert_format、excel_validate）SHALL 接受可选参数 `sheetName` 与 `sheetIndex` 来选择目标工作表。当 `sheetName` 非空时 MUST 优先按名称选择；否则 MUST 按 `sheetIndex` 选择，`sheetIndex` 默认值为 0（第一个工作表）。

#### Scenario: 默认读取第一个工作表
- **WHEN** 调用 excel_read 且未传 sheetName 与 sheetIndex
- **THEN** 系统读取索引为 0 的工作表内容

#### Scenario: 按名称选择工作表
- **WHEN** 调用任一 Excel 技能并传入存在的 sheetName
- **THEN** 系统对该名称对应的工作表执行操作

#### Scenario: 按索引选择工作表
- **WHEN** 调用任一 Excel 技能并传入 sheetIndex 且未传 sheetName
- **THEN** 系统对该索引对应的工作表执行操作

#### Scenario: 指定的工作表不存在
- **WHEN** 调用 Excel 技能并传入不存在的 sheetName 或 sheetIndex
- **THEN** 系统返回明确错误信息（包含所请求的名称或索引），且不静默回退到第一个工作表

### Requirement: 返回工作表元信息
excel_read SHALL 在返回结果中包含当前工作表的元信息：`sheetName`（当前工作表名）、`sheetIndex`（当前工作表索引）、`totalSheets`（工作表总数）、`sheetNames`（全部工作表名称列表）。

#### Scenario: 读取多工作表文件返回元信息
- **WHEN** 对含多个工作表的文件调用 excel_read
- **THEN** 返回结果包含 sheetName、sheetIndex、totalSheets 与完整的 sheetNames 列表

### Requirement: CSV 转换按工作表导出
excel_convert_format 转换为 CSV 时 SHALL 仅导出由 `sheetName`/`sheetIndex` 指定的工作表（默认第一个工作表）。

#### Scenario: 多工作表文件转 CSV
- **WHEN** 对含多个工作表的文件调用 excel_convert_format 转 CSV 并指定 sheetName
- **THEN** 生成的 CSV 仅包含该指定工作表的数据

### Requirement: 写入工作表不覆盖已有工作表
excel_write SHALL 支持通过 `sheetName` 指定工作表名（新建文件时默认 "Sheet1"）。当传入 fileId 时，系统 MUST 在原文件工作簿上追加或替换该 `sheetName` 指定的工作表，并保留文件中其余已存在的工作表；当同名工作表已存在时 MUST 覆盖该工作表。当不传 fileId 时，系统创建仅含该工作表的全新文件并返回新 fileId。

#### Scenario: 在已有文件上追加新工作表
- **WHEN** 先创建含工作表 A 的文件得到 fileId，再用同一 fileId 与不同 sheetName=B 调用 excel_write
- **THEN** 结果文件同时包含工作表 A 与工作表 B

#### Scenario: 覆盖同名工作表
- **WHEN** 对已含工作表 A 的文件用同一 fileId 与 sheetName=A 再次调用 excel_write
- **THEN** 工作表 A 的内容被新数据替换，文件中其余工作表保持不变

#### Scenario: 不传 fileId 创建新文件
- **WHEN** 不传 fileId 调用 excel_write 并提供 headers 与 rows
- **THEN** 系统创建仅含指定工作表的新文件并返回新 fileId
