## 1. 替换 FileToolSeeder.run() 中 33 个 description

每条 description 严格按 3 段式模板（`功能说明：... \n 触发关键词：... \n 注意事项：...`），总长 32-91 中文字（远低于 BGE-large-zh-v1.5 的 512 token 上限）。

### 1.1 file_manage 族（run() 内 7 条，**功能说明含用户场景**）

- [x] 1.1.1 `file_list` → "功能说明：列出/搜索会话内已上传文件，按类型/关键词/上传时间/大小排序分页。用于回答"我上传了哪些文件""帮我找下报告"，或为后续文件操作（读/改/删）提供候选 fileId。\n触发关键词：列出、查询、搜索、筛选、找文件、查看文件\n注意事项：只查文件列表不返回内容（读内容用 file_read）；不删不改。"
- [x] 1.1.2 `file_delete` → "功能说明：按 fileId 或文件名删除指定文件，需二次确认。用于删除误传/不再使用的单个文件，回应用户"这个不要了""帮我删掉""撤回刚才那个"。\n触发关键词：删除、删文件、移除、删除文件\n注意事项：只删单个文件；批量清空用 file_clear_all；需 confirm=true 二次确认。"
- [x] 1.1.3 `file_clear_all` → "功能说明：清空当前会话内所有文件，需二次确认。用于彻底重开会话、换一批文件、清理工作区，回应用户"全部清空""重置一下""把刚才的删了重来"。\n触发关键词：清空、全部删除、批量删除、清理文件\n注意事项：清空不可恢复；单文件删除用 file_delete。"
- [x] 1.1.4 `file_detail` → "功能说明：查看指定文件名称、大小、类型、上传时间、downloadUrl、fileId。用于核对文件状态、获取下载链接、确认 fileId，回应用户"这个文件多大""给我下载链接""这个 fileId 是多少"。\n触发关键词：详情、查看信息、获取链接、文件信息、属性\n注意事项：只查元数据不读内容（用 file_read）。"
- [x] 1.1.5 `file_init_temp` → "功能说明：为 Word/Excel/Markdown/文本源文件创建可编辑临时副本。所有修改类操作（excel_filter/excel_clean/word_replace_text/md_filter_section 等）调用前必须先执行，回应用户"改一下这个 Excel""我想编辑这份文档""修改后再给我"。\n触发关键词：初始化、临时副本、创建副本、init、可编辑副本\n注意事项：只支持这几类；做修改类操作前先调用；excel_init_temp/md_init_temp/txt_init_temp 已废。"
- [x] 1.1.6 `file_read` → "功能说明：自动按文件类型读取 txt/md/log/html/doc/docx/xls/xlsx/csv 内容。用于打开/预览文件、读取表格分页、查看文档全文，回应用户"打开看看""读一下内容""看下文件说了什么""把表格数据给我"。\n触发关键词：读取、打开、查看全文、读文件、读内容、查看内容\n注意事项：只读不改；不返回元数据（用 file_detail）。"
- [x] 1.1.7 `file_write` → "功能说明：创建或覆盖/追加文本/Markdown/Word/Excel/CSV 文件。用于生成新报告、导出分析结果、保存结论、创建 Word 文档或 Excel 表格，回应用户"生成一份报告""导出统计结果""创建新 Excel""把分析写到文件里"。\n触发关键词：写入、生成、创建文件、导出、输出、新建\n注意事项：默认 in-place 覆盖；改文件先 file_init_temp。"

### 1.2 txt_operate 族（run() 内 8 条）

- [x] 1.2.1 `txt_keyword_lines` → "功能说明：从 txt/log/html/md 文件搜索包含关键词的行并返回前后几行上下文。\n触发关键词：grep、查日志、ERROR 前后、日志查找、搜索行、关键字行\n注意事项：按行精确匹配；正则用 txt_regex。"
- [x] 1.2.2 `txt_regex` → "功能说明：用正则表达式搜索文本行并提取捕获组。\n触发关键词：正则、regex、匹配、提取捕获组\n注意事项：需写正则；按行匹配（多行用 multiline flag）。"
- [x] 1.2.3 `txt_line_range` → "功能说明：按起止行号提取 txt/log/md/html 行内容。\n触发关键词：行范围、截取片段、指定行、起止行号\n注意事项：按行号取，不搜关键词（用 txt_keyword_lines）。"
- [x] 1.2.4 `txt_section` → "功能说明：按标题提取 Markdown 指定章节，可含子标题。\n触发关键词：章节、Section、提取章节、读某节\n注意事项：仅 Markdown；生成目录用 md_toc。"
- [x] 1.2.5 `txt_stats` → "功能说明：统计字符/词/行/字节数。\n触发关键词：统计、字数、行数、字节、规模\n注意事项：仅统计；词频分析用 txt_keyword_freq。"
- [x] 1.2.6 `txt_distinct_lines` → "功能说明：对 txt/log/md 行去重，可控大小写与空行。\n触发关键词：去重、删除重复、整理\n注意事项：只去重不排序（用 txt_sort_lines）。"
- [x] 1.2.7 `txt_sort_lines` → "功能说明：按字典序/数字升序或降序排序行。\n触发关键词：排序、整理列表、按字段排序、升降序\n注意事项：只排序不去重（用 txt_distinct_lines）。"
- [x] 1.2.8 `txt_keyword_freq` → "功能说明：统计多个关键词出现次数。\n触发关键词：词频、频次、出现次数、统计次数\n注意事项：只计数不提取上下文行（用 txt_keyword_lines）。"

### 1.3 md_operate 族（run() 内 9 条）

- [x] 1.3.1 `md_images` → "功能说明：提取 Markdown 所有图片链接和 alt 文本。\n触发关键词：图片、images、提取图片、图片引用\n注意事项：只列链接不下载。"
- [x] 1.3.2 `md_headings` → "功能说明：提取全层级标题结构。\n触发关键词：标题、大纲、headings、目录结构\n注意事项：仅结构不生成 TOC（用 md_toc）。"
- [x] 1.3.3 `md_table` → "功能说明：解析 GFM 表格内容。\n触发关键词：表格、table、解析表格、表格数据\n注意事项：仅 Markdown 表格。"
- [x] 1.3.4 `md_list_items` → "功能说明：提取有序/无序列表内容。\n触发关键词：列表、清单、列表项\n注意事项：仅 list 项不含表格。"
- [x] 1.3.5 `md_tasks` → "功能说明：提取 - [ ] / - [x] 任务项及完成状态。\n触发关键词：任务、todo、待办、任务清单\n注意事项：仅 GFM task list。"
- [x] 1.3.6 `md_emphasis` → "功能说明：提取加粗/斜体/删除线/行内代码。\n触发关键词：强调、emphasis、加粗、斜体、删除线\n注意事项：仅格式标记不含链接。"
- [x] 1.3.7 `md_toc` → "功能说明：根据 #/##/### 标题生成 TOC 目录大纲。\n触发关键词：目录、TOC、大纲、标题导航\n注意事项：只生成目录不提取正文章节（用 md_section/txt_section）。"
- [x] 1.3.8 `md_filter_section` → "功能说明：按标题删除或保留整节内容。\n触发关键词：裁剪、过滤章节、删除章节、保留章节\n注意事项：按节操作不做行级别过滤（用 txt_keyword_lines）。"
- [x] 1.3.9 `md_merge` → "功能说明：合并多个 Markdown 文件为新文件。\n触发关键词：合并、拼接、汇总\n注意事项：仅 Markdown，输出新文件不覆盖。"

### 1.4 excel_operate 族（run() 内 9 条）

- [x] 1.4.1 `excel_filter` → "功能说明：按列条件筛选 xlsx/xls/csv 数据行，支持比较运算符（大于/小于/等于/包含等）。\n触发关键词：筛选、过滤、查询、查找、保留行、条件\n注意事项：只行筛选不排序/汇总/透视（用 excel_sort/aggregate/pivot）。"
- [x] 1.4.2 `excel_sort` → "功能说明：按指定列升序/降序排序 xlsx/xls/csv 数据。\n触发关键词：排序、整理、升降序、按列排序\n注意事项：只调整行顺序不筛选/统计（用 excel_filter/aggregate）。"
- [x] 1.4.3 `excel_aggregate` → "功能说明：按字段 group by 计算 sum/avg/count/min/max。\n触发关键词：统计、汇总、分组、聚合、合计、平均值\n注意事项：单层 group by 不是透视表（用 excel_pivot）；不新增列（用 excel_calculate）。"
- [x] 1.4.4 `excel_pivot` → "功能说明：按行字段和列字段生成二维交叉汇总表。\n触发关键词：透视表、交叉统计、行列汇总、多维分析\n注意事项：二维交叉不是普通 group by（用 excel_aggregate）。"
- [x] 1.4.5 `excel_calculate` → "功能说明：基于已有列生成新计算列。\n触发关键词：计算、派生列、公式、比例\n注意事项：新增计算列不统计汇总（用 excel_aggregate）。"
- [x] 1.4.6 `excel_select_columns` → "功能说明：保留指定列并删除其余列。\n触发关键词：列选择、裁剪字段、导出部分列\n注意事项：列裁剪不是行筛选（用 excel_filter）。"
- [x] 1.4.7 `excel_clean` → "功能说明：去空格、去重、删除空行。\n触发关键词：清洗、去重、去空、清理\n注意事项：只清洗不做业务计算（用 excel_calculate）。"
- [x] 1.4.8 `excel_convert_format` → "功能说明：在 xlsx/xls/csv 之间转换并生成文件。\n触发关键词：格式转换、导出 CSV、导出 Excel\n注意事项：仅格式转换不改数据。"
- [x] 1.4.9 `excel_validate` → "功能说明：按规则检查数据合规性并返回校验结果。\n触发关键词：校验、检查、合规性、格式校验\n注意事项：只检查不修改（修用 excel_clean）。"

## 2. 替换 rollbackWordOpsIntegration() 中 4 个 word_* description

- [x] 2.1 `word_extract_content` → "功能说明：从 doc/docx 提取标题大纲、段落、表格、图片。\n触发关键词：提取内容、抽取、解析 Word、读结构\n注意事项：只读不改；不替换文字（用 word_replace_text）。"
- [x] 2.2 `word_search_keyword` → "功能说明：在 doc/docx 搜索关键词返回上下文。\n触发关键词：搜索关键字、查找、检索、搜索词\n注意事项：只读不改；替换用 word_replace_text。"
- [x] 2.3 `word_replace_text` → "功能说明：把 oldText 替换为 newText，支持首个/全部。\n触发关键词：替换、修改文字、改文字、批量替换\n注意事项：只改文字不处理 {{placeholder}}（用 word_template_fill）。"
- [x] 2.4 `word_template_fill` → "功能说明：用 values 填充 {{placeholder}} 占位符。\n触发关键词：模板、占位符、填充、生成合同、生成报告\n注意事项：只填占位符不做普通文本替换（用 word_replace_text）。"

## 3. 验证

- [x] 3.1 `mvn -DskipTests -o clean compile` 静默通过
- [x] 3.2 `git diff --stat` 仅包含：`openspec/changes/optimize-file-tool-descriptions/*` + `FileToolSeeder.java`
- [x] 3.3 `git diff FileToolSeeder.java` 中：TOOL_TAGS 段、ToolTag class、joinOperationIntent、seedSkill 主逻辑 0 改动
- [x] 3.4 单条 description 长度 ≤ 100 中文字（实测 32-91，均远低于 BGE 512 token 上限）
- [x] 3.5 重启 gateway，DB `skills.description` 自动重写为新文案
- [x] 3.6 跑 8 条 plan query 验 top-1（应 8/8 命中）：

| # | query | 期望 top-1 |
|---|-------|------------|
| 1 | Excel 销售额按地区汇总统计 | excel_aggregate |
| 2 | Excel 做行列交叉透视表 | excel_pivot |
| 3 | Excel 只保留金额大于 1000 的行 | excel_filter |
| 4 | Excel 按日期降序排列 | excel_sort |
| 5 | Word 把甲方替换为乙方 | word_replace_text |
| 6 | Word 根据模板填充姓名日期 | word_template_fill |
| 7 | Markdown 生成目录 | md_toc |
| 8 | 日志里找 ERROR 前后几行 | txt_keyword_lines |

## 4. 归档

- [x] 4.1 PR review 通过后：`openspec archive optimize-file-tool-descriptions --yes`
- [x] 4.2 归档后 `git status` 确认无 dist/.m2/node_modules 污染
