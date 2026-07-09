## 1. 替换 FileToolSeeder.run() 中 33 个 description

- [ ] 1.1 `file_list` → "文件列表查询工具：列出/搜索/筛选用户已上传文件，支持按文件类型、文件名关键词、上传时间、大小排序和分页；用于找文件、查看有哪些文件、获取候选文件 ID。"
- [ ] 1.2 `file_delete` → "文件删除工具：按 fileId 或文件名删除指定文件，需要二次确认；用于删除、移除、清理单个文件。"
- [ ] 1.3 `file_clear_all` → "批量清空文件工具：清空当前会话内所有文件，需要二次确认；用于批量删除、清理会话文件。"
- [ ] 1.4 `file_detail` → "文件详情查看工具：查看指定文件的名称、大小、类型、上传时间、解析摘要、downloadUrl 和 fileId；用于确认文件信息、获取下载链接。"
- [ ] 1.5 `file_init_temp` → "文件临时副本初始化工具：为 Word/Excel/Markdown/文本等源文件创建可编辑临时副本，供后续替换、筛选、排序、清洗、合并等修改操作使用。"
- [ ] 1.6 `file_read` → "通用文件读取查看工具：按文件类型自动读取 txt/md/log/html/doc/docx/xls/xlsx/csv 内容；用于打开文件、查看全文、读取表格分页、预览文档内容。"
- [ ] 1.7 `file_write` → "通用文件生成写入工具：创建或覆盖/追加文本、Markdown、Word、Excel、CSV 文件；用于生成报告、导出统计结果、写入分析结论、创建 Word 文档或 Excel 表格。"
- [ ] 1.8 `txt_keyword_lines` → "文本关键词行提取工具：从 txt/log/html/md 等文本文件中搜索包含关键词的行，并可返回上下文；用于日志检索、文本查找。"
- [ ] 1.9 `txt_regex` → "文本正则匹配工具：用正则表达式搜索文本行并提取捕获组；用于提取编号、日期、邮箱、日志字段等结构化片段。"
- [ ] 1.10 `txt_line_range` → "文本行范围读取工具：按起止行号提取 txt/log/md/html 内容；用于查看指定行、截取片段、读取文件局部内容。"
- [ ] 1.11 `txt_section` → "Markdown 章节提取工具：按标题提取 Markdown 指定章节，可包含子标题；用于读取某一节、抽取文档章节内容。"
- [ ] 1.12 `txt_stats` → "文本统计分析工具：统计文本文件字符数、词数、行数、字节数；用于文本长度分析、日志规模统计。"
- [ ] 1.13 `txt_distinct_lines` → "文本行去重工具：对 txt/log/md 行内容去重，可控制大小写和空行；用于清洗重复行、整理名单或日志。"
- [ ] 1.14 `txt_sort_lines` → "文本行排序工具：对文本行按字典序或数字排序，支持升序/降序；用于整理列表、排序日志或数据行。"
- [ ] 1.15 `txt_keyword_freq` → "文本关键词频率统计工具：统计多个关键词在文本中的出现次数；用于词频分析、日志关键字统计。"
- [ ] 1.16 `md_images` → "Markdown 图片引用提取工具：提取 Markdown 中所有图片链接和 alt 文本；用于检查文档图片、整理图片资源。"
- [ ] 1.17 `md_headings` → "Markdown 标题大纲提取工具：提取全层级标题结构；用于生成文档结构、查看目录层级。"
- [ ] 1.18 `md_table` → "Markdown 表格提取工具：解析 GFM 表格内容；用于读取 Markdown 表格、抽取表格数据。"
- [ ] 1.19 `md_list_items` → "Markdown 列表项提取工具：提取有序/无序列表内容；用于整理清单、抽取列表。"
- [ ] 1.20 `md_tasks` → "Markdown 任务清单提取工具：提取 - [ ] / - [x] 任务项及完成状态；用于检查 todo、任务列表。"
- [ ] 1.21 `md_emphasis` → "Markdown 强调标记提取工具：提取加粗、斜体、删除线和行内代码；用于分析重点文本和代码片段。"
- [ ] 1.22 `md_toc` → "Markdown 目录生成工具：根据 #/##/### 标题生成 TOC 目录大纲；关键词：目录、TOC、大纲、标题导航。只生成目录，不提取正文章节。"
- [ ] 1.23 `md_filter_section` → "Markdown 章节过滤工具：按标题删除或保留整节内容；用于裁剪文档、保留指定章节、移除无关章节。"
- [ ] 1.24 `md_merge` → "Markdown 合并工具：合并多个 Markdown 文件为一个新文件；用于拼接文档、汇总多篇笔记。"
- [ ] 1.25 `excel_filter` → "Excel/xlsx/xls/csv 表格行筛选工具：按列条件查询、过滤并保留符合条件的数据行，支持大于/小于/等于/包含等比较；关键词：筛选、过滤、查询、查找、条件、保留行。只做行筛选，不做排序、汇总、透视。"
- [ ] 1.26 `excel_sort` → "Excel/xlsx/xls/csv 表格排序工具：按指定列对数据升序或降序排序；关键词：排序、整理、升降序、按字段排序。只调整行顺序，不做筛选/统计。"
- [ ] 1.27 `excel_aggregate` → "Excel/xlsx/xls/csv 分组聚合统计工具：按一个或多个字段 group by，计算 sum/avg/count/min/max；关键词：统计、汇总、分组、聚合、合计、平均值、数量。用于普通分组汇总，不做行列交叉透视。"
- [ ] 1.28 `excel_pivot` → "Excel/xlsx/xls/csv 透视交叉分析工具：按行字段和列字段生成二维交叉汇总表；关键词：透视表、交叉统计、行列汇总、多维分析。用于 pivot，不是普通 group by 聚合。"
- [ ] 1.29 `excel_calculate` → "Excel/xlsx/xls/csv 列计算工具：基于已有列生成新计算列；关键词：计算、派生列、公式、金额计算、比例计算。是新增计算列，不是统计汇总。"
- [ ] 1.30 `excel_select_columns` → "Excel/xlsx/xls/csv 列选择工具：保留指定列并删除其余列；用于裁剪字段、导出部分列。是列裁剪，不是行筛选。"
- [ ] 1.31 `excel_clean` → "Excel/xlsx/xls/csv 数据清洗工具：去空格、去重、删除空行等；用于清理脏数据、整理表格。是去重/去空/去空格，不做业务计算。"
- [ ] 1.32 `excel_convert_format` → "Excel 格式转换工具：在 xlsx/xls/csv 之间转换并生成文件；用于表格格式转换、导出 CSV 或 Excel。"
- [ ] 1.33 `excel_validate` → "Excel 数据校验工具：按规则检查表格数据合规性并返回校验结果；用于空值、格式、范围、重复数据检查。是检查问题，不修改数据。"

## 2. 替换 rollbackWordOpsIntegration() 中 4 个 word_* description

- [ ] 2.1 `word_extract_content` → "Word/doc/docx 内容提取工具：从 doc/docx 提取标题大纲、段落文本、表格和图片信息；用于解析 Word 结构、抽取文档内容。"
- [ ] 2.2 `word_search_keyword` → "Word/doc/docx 关键词搜索工具：在 doc/docx 中查找关键词并返回上下文；用于检索合同、报告、文档中的指定文字。"
- [ ] 2.3 `word_replace_text` → "Word/doc/docx 文档文本替换工具：把 oldText 替换成 newText，支持替换首个或全部匹配；关键词：替换、修改、更新、改文字、批量替换。只做已有文档内容修改，不用于模板占位符填充。"
- [ ] 2.4 `word_template_fill` → "Word/doc/docx 模板占位符填充工具：用 values 填充 {{placeholder}} 占位符生成/更新文档；关键词：模板、占位符、填充、生成合同、生成报告。只处理占位符，不做普通文本查找替换。"

## 3. 验证

- [ ] 3.1 `cd backend/skill-gateway && ./apache-maven-3.8.5/bin/mvn -s ./settings.xml -DskipTests compile` 静默通过
- [ ] 3.2 `git diff --stat` 仅包含：`openspec/changes/optimize-file-tool-descriptions/*` + `backend/skill-gateway/src/main/java/.../FileToolSeeder.java`
- [ ] 3.3 `git diff backend/skill-gateway/.../FileToolSeeder.java` 中：TOOL_TAGS 段、ToolTag class、joinOperationIntent、seedSkill 主逻辑 0 改动
- [ ] 3.4 单条 description 长度 ≤ 100 字（人工 review）

## 4. 归档

- [ ] 4.1 PR review 通过后：`openspec archive optimize-file-tool-descriptions --yes`
- [ ] 4.2 归档后 `git status` 确认无 dist/.m2/node_modules 污染
