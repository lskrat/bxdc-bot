## Context

skill-gateway 的 `ExcelFileToolService` 是一组以工具形式暴露给 LLM 的 Excel 操作能力（读取、筛选、排序、聚合、透视、计算、选列、清洗、格式转换、校验、写入）。这些方法历史上均硬编码 `wb.getSheetAt(0)`，只能操作第一个工作表；excel_write 在传 fileId 时用 `new XSSFWorkbook()` 整体覆盖原文件，无法在已有文件上追加工作表。Apache POI（项目已有依赖）原生支持按名称/索引访问工作表，无需引入新依赖。

## Goals / Non-Goals

**Goals:**
- 让所有 Excel 技能可按 `sheetName`（优先）或 `sheetIndex`（默认 0）选择目标工作表。
- excel_read 返回工作表元信息（名称、索引、总数、全部名称），便于 LLM 决策。
- excel_write 在传 fileId 时支持追加/替换指定工作表而不破坏已有工作表，从而能正确构建多工作表文件。
- 通过精简且补充 sheet 说明的 description + schema，引导 LLM 正确使用。

**Non-Goals:**
- 不改 agent-core（NestJS）调度层（遵循 AGENTS.md 5.5）。
- 不新增第三方依赖、环境变量或数据库 schema。
- 不实现跨工作表公式引用、不实现工作表删除/重命名独立工具。

## Decisions

- **统一辅助方法 `getSheet(wb, sheetName, sheetIndex)`**：sheetName 非空优先按名取，否则按索引取；配套 `getSheetIndex`/`getSheetName` 返回实际元信息。理由：集中一处选 sheet 逻辑，各方法复用，避免重复的 if/else 散落。替代方案（每个方法各自写选 sheet 分支）被否决——重复且易漏改。
- **sheetName 优先于 sheetIndex**：两者互斥时以名称为准。理由：名称对 LLM 更直观、对插入/删除工作表更稳定。
- **指定工作表不存在时返回明确错误**（`Sheet not found: <name|index>`）而非静默回退到第 0 个。理由：避免操作错工作表产生隐性数据错误。
- **excel_write 传 fileId 时打开原工作簿追加 sheet**：`createWorkbook(downloadBytes(...))` 后，若同名 sheet 存在先 `removeSheetAt` 再 `createSheet`（即按名覆盖该 sheet），其余 sheet 原样保留；不传 fileId 仍 `new XSSFWorkbook()` 建新文件。理由：直接修复"后写 sheet 覆盖前面全部"的根因。
- **多 sheet 构建流程写入 description**：首次不传 fileId 建首个 sheet 拿 fileId，后续同 fileId + 不同 sheetName 追加。理由：让 LLM 按正确顺序操作，避免每次新建独立单 sheet 文件。

## Risks / Trade-offs

- [excel_write 追加需先下载原文件，IO 成本高于纯新建] → 仅在传 fileId 路径触发；多 sheet 构建本就需读写原文件，成本可接受。
- [同名 sheet 按覆盖处理，可能误删用户已有同名 sheet] → 通过 description 明确"同名会覆盖"，由 LLM/用户用不同 sheetName 规避。
- [description/schema 变更需重启 skill-gateway 才经 seedSkill 刷新] → 属部署既有约定，归档说明中标注。
- [指定 sheet 不存在返回错误而非回退] → 更安全，但要求 LLM 先用 excel_read 的 sheetNames 确认存在；已在 description 引导。
