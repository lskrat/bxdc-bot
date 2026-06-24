## 1. ExcelFileToolService 多工作表基础设施

- [x] 1.1 新增 `getSheet(wb, sheetName, sheetIndex)`、`getSheetIndex(...)`、`getSheetName(...)` 辅助方法
- [x] 1.2 excel_read 支持 sheetName/sheetIndex，返回 sheetName/sheetIndex/totalSheets/sheetNames 元信息，并对不存在工作表返回错误

## 2. 各 Excel 变换/校验技能支持多工作表

- [x] 2.1 excel_filter 支持 sheetName/sheetIndex + 不存在校验
- [x] 2.2 excel_sort 支持 sheetName/sheetIndex + 不存在校验
- [x] 2.3 excel_aggregate 支持 sheetName/sheetIndex + 不存在校验
- [x] 2.4 excel_pivot 支持 sheetName/sheetIndex + 不存在校验
- [x] 2.5 excel_calculate 支持 sheetName/sheetIndex + 不存在校验
- [x] 2.6 excel_select_columns 支持 sheetName/sheetIndex + 不存在校验
- [x] 2.7 excel_clean 支持 sheetName/sheetIndex + 不存在校验
- [x] 2.8 excel_validate 支持 sheetName/sheetIndex + 不存在校验
- [x] 2.9 excel_convert_format 转 CSV 时按 sheetName/sheetIndex 导出指定工作表

## 3. excel_write 多工作表写入修复

- [x] 3.1 excel_write 支持 sheetName 指定工作表名（默认 Sheet1）
- [x] 3.2 传 fileId 时打开原工作簿追加/替换指定 sheet（同名覆盖、其余保留），不再整体覆盖
- [x] 3.3 不传 fileId 时维持创建全新文件并返回 fileId

## 4. FileToolSeeder 技能描述与参数 schema

- [x] 4.1 各 Excel 技能 schema 增加 sheetName/sheetIndex 参数（excel_write 增加 sheetName）
- [x] 4.2 精简各 Excel 技能 description 并补充 sheet 相关说明
- [x] 4.3 excel_write description 补充多工作表构建正确流程（首次不传 fileId 建首个 sheet，后续同 fileId 追加）

## 5. 验证

- [x] 5.1 skill-gateway 无编译诊断错误
