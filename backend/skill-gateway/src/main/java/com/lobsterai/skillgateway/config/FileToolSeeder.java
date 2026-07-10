package com.lobsterai.skillgateway.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.entity.SkillVisibility;
import com.lobsterai.skillgateway.entity.SystemSkill;
import com.lobsterai.skillgateway.mapper.SkillMapper;
import com.lobsterai.skillgateway.mapper.SystemSkillMapper;
import java.util.Collections;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 文件工具种子数据初始化器。
 * <p>
 * 启动时将文件工具同时注册到：
 * <ul>
 *   <li>{@code system_skills} 表 — 供 {@code POST /api/system-skills/execute} 直连调用</li>
 *   <li>{@code skills} 表 — 供 agent-core 通过 {@code GET /api/skills} 动态发现
 *       （type=EXTENSION），执行走 {@code POST /api/skills/execute} 统一入口</li>
 * </ul>
 * </p>
 */
@Component
@Order(1)
public class FileToolSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(FileToolSeeder.class);

    private static final String KIND = "FILE_TOOL";
    private static final String SKILL_TYPE = "EXTENSION";
    private static final String CREATED_BY = "public";

    private final SystemSkillMapper systemSkillMapper;
    private final SkillMapper skillMapper;
    private final ObjectMapper objectMapper;

    public FileToolSeeder(SystemSkillMapper systemSkillMapper,
                          SkillMapper skillMapper,
                          ObjectMapper objectMapper) {
        this.systemSkillMapper = systemSkillMapper;
        this.skillMapper = skillMapper;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        // ===== 文件管理 =====
        seedFileManage("file_list", "功能说明：列出/搜索会话内已上传文件，按类型/关键词/上传时间/大小排序分页。用于回答\"我上传了哪些文件\"\"帮我找下报告\"，或为后续文件操作（读/改/删）提供候选 fileId。\n触发关键词：列出、查询、搜索、筛选、找文件、查看文件\n注意事项：只查文件列表不返回内容（读内容用 file_read）；不删不改。",
                fileListSchema());
        seedFileManage("file_delete", "功能说明：按 fileId 或文件名删除指定文件，需二次确认。用于删除误传/不再使用的单个文件，回应用户\"这个不要了\"\"帮我删掉\"\"撤回刚才那个\"。\n触发关键词：删除、删文件、移除、删除文件\n注意事项：只删单个文件；批量清空用 file_clear_all；需 confirm=true 二次确认。",
                fileDeleteSchema());
        seedFileManage("file_clear_all", "功能说明：清空当前会话内所有文件，需二次确认。用于彻底重开会话、换一批文件、清理工作区，回应用户\"全部清空\"\"重置一下\"\"把刚才的删了重来\"。\n触发关键词：清空、全部删除、批量删除、清理文件\n注意事项：清空不可恢复；单文件删除用 file_delete。",
                confirmedOnlySchema());
        seedFileManage("file_detail", "功能说明：查看指定文件名称、大小、类型、上传时间、downloadUrl、fileId。用于核对文件状态、获取下载链接、确认 fileId，回应用户\"这个文件多大\"\"给我下载链接\"\"这个 fileId 是多少\"。\n触发关键词：详情、查看信息、获取链接、文件信息、属性\n注意事项：只查元数据不读内容（用 file_read）。",
                fileDetailSchema());
        seedFileManage("file_init_temp", "功能说明：为 Word/Excel/Markdown/文本源文件创建可编辑临时副本。所有修改类操作（excel_filter/excel_clean/word_replace_text/md_filter_section 等）调用前必须先执行，回应用户\"改一下这个 Excel\"\"我想编辑这份文档\"\"修改后再给我\"。\n触发关键词：初始化、临时副本、创建副本、init、可编辑副本\n注意事项：只支持这几类；做修改类操作前先调用；excel_init_temp/md_init_temp/txt_init_temp 已废。",
                fileRefSchema());
        seedFileOperate("file_read", "功能说明：自动按文件类型读取 txt/md/log/html/doc/docx/xls/xlsx/csv 内容。用于打开/预览文件、读取表格分页、查看文档全文，回应用户\"打开看看\"\"读一下内容\"\"看下文件说了什么\"\"把表格数据给我\"。\n触发关键词：读取、打开、查看全文、读文件、读内容、查看内容\n注意事项：只读不改；不返回元数据（用 file_detail）。",
                fileReadSchema());
        seedFileOperate("file_write", "功能说明：创建或覆盖/追加文本/Markdown/Word/Excel/CSV 文件。用于生成新报告、导出分析结果、保存结论、创建 Word 文档或 Excel 表格，回应用户\"生成一份报告\"\"导出统计结果\"\"创建新 Excel\"\"把分析写到文件里\"。\n触发关键词：写入、生成、创建文件、导出、输出、新建\n注意事项：默认 in-place 覆盖；改文件先 file_init_temp。",
                fileWriteSchema());

        // 删除旧的初始化方法（已合并为 file_init_temp）
        deleteLegacyInitTempSkills();

        // 删除旧的读写工具（已合并为 file_read/file_write）
        deleteLegacyReadWriteSkills();

        // ===== Word 操作（5.3）=====
        // 回退方案 B：恢复 6 个细粒度 word_* 工具，删除 word_ops 整合行。
        // 启动时：1) 删除 skills 表里的 word_ops 行（如果存在）；
        //         2) 把 6 个老 word_* 重新 enable（之前 disable 了）；
        //         3) 重新 seed 6 个 word_*（缺哪个补哪个）。
        rollbackWordOpsIntegration();

        // ===== TXT/MD/LOG/HTML 操作 =====
        seedFileOperate("txt_keyword_lines", "功能说明：从 txt/log/html/md 文件搜索包含关键词的行并返回前后几行上下文。\n触发关键词：grep、查日志、ERROR 前后、日志查找、搜索行、关键字行\n注意事项：按行精确匹配；正则用 txt_regex。", txtKeywordLinesSchema());
        seedFileOperate("txt_regex", "功能说明：用正则表达式搜索文本行并提取捕获组。\n触发关键词：正则、regex、匹配、提取捕获组\n注意事项：需写正则；按行匹配（多行用 multiline flag）。", txtRegexSchema());
        seedFileOperate("txt_line_range", "功能说明：按起止行号提取 txt/log/md/html 行内容。\n触发关键词：行范围、截取片段、指定行、起止行号\n注意事项：按行号取，不搜关键词（用 txt_keyword_lines）。", txtLineRangeSchema());
        seedFileOperate("txt_section", "功能说明：按标题提取 Markdown 指定章节，可含子标题。\n触发关键词：章节、Section、提取章节、读某节\n注意事项：仅 Markdown；生成目录用 md_toc。", txtSectionSchema());
        seedFileOperate("txt_stats", "功能说明：统计字符/词/行/字节数。\n触发关键词：统计、字数、行数、字节、规模\n注意事项：仅统计；词频分析用 txt_keyword_freq。");
        seedFileOperate("txt_distinct_lines", "功能说明：对 txt/log/md 行去重，可控大小写与空行。\n触发关键词：去重、删除重复、整理\n注意事项：只去重不排序（用 txt_sort_lines）。", txtDistinctLinesSchema());
        seedFileOperate("txt_sort_lines", "功能说明：按字典序/数字升序或降序排序行。\n触发关键词：排序、整理列表、按字段排序、升降序\n注意事项：只排序不去重（用 txt_distinct_lines）。", txtSortLinesSchema());
        seedFileOperate("txt_keyword_freq", "功能说明：统计多个关键词出现次数。\n触发关键词：词频、频次、出现次数、统计次数\n注意事项：只计数不提取上下文行（用 txt_keyword_lines）。", txtKeywordFreqSchema());

        // ===== MD 扩展操作 =====
        seedFileOperate("md_images", "功能说明：提取 Markdown 所有图片链接和 alt 文本。\n触发关键词：图片、images、提取图片、图片引用\n注意事项：只列链接不下载。");
        seedFileOperate("md_headings", "功能说明：提取全层级标题结构。\n触发关键词：标题、大纲、headings、目录结构\n注意事项：仅结构不生成 TOC（用 md_toc）。");
        seedFileOperate("md_table", "功能说明：解析 GFM 表格内容。\n触发关键词：表格、table、解析表格、表格数据\n注意事项：仅 Markdown 表格。");
        seedFileOperate("md_list_items", "功能说明：提取有序/无序列表内容。\n触发关键词：列表、清单、列表项\n注意事项：仅 list 项不含表格。");
        seedFileOperate("md_tasks", "功能说明：提取 - [ ] / - [x] 任务项及完成状态。\n触发关键词：任务、todo、待办、任务清单\n注意事项：仅 GFM task list。");
        seedFileOperate("md_emphasis", "功能说明：提取加粗/斜体/删除线/行内代码。\n触发关键词：强调、emphasis、加粗、斜体、删除线\n注意事项：仅格式标记不含链接。");
        seedFileOperate("md_toc", "功能说明：根据 #/##/### 标题生成 TOC 目录大纲。\n触发关键词：目录、TOC、大纲、标题导航\n注意事项：只生成目录不提取正文章节（用 md_section/txt_section）。");
        seedFileOperate("md_filter_section",
                "功能说明：按标题删除或保留整节内容。\n触发关键词：裁剪、过滤章节、删除章节、保留章节\n注意事项：按节操作不做行级别过滤（用 txt_keyword_lines）。",
                mdFilterSectionSchema());
        seedFileOperate("md_merge", "功能说明：合并多个 Markdown 文件为新文件。\n触发关键词：合并、拼接、汇总\n注意事项：仅 Markdown，输出新文件不覆盖。",
                mdMergeSchema());

        // ===== Excel 操作（支持 xlsx/xls/csv）=====
        seedFileOperate("excel_filter", "功能说明：按列条件筛选 xlsx/xls/csv 数据行，支持比较运算符（大于/小于/等于/包含等）。\n触发关键词：筛选、过滤、查询、查找、保留行、条件\n注意事项：只行筛选不排序/汇总/透视（用 excel_sort/aggregate/pivot）。", excelFilterSchema());
        seedFileOperate("excel_sort", "功能说明：按指定列升序/降序排序 xlsx/xls/csv 数据。\n触发关键词：排序、整理、升降序、按列排序\n注意事项：只调整行顺序不筛选/统计（用 excel_filter/aggregate）。", excelSortSchema());
        seedFileOperate("excel_aggregate", "功能说明：按字段 group by 计算 sum/avg/count/min/max。\n触发关键词：统计、汇总、分组、聚合、合计、平均值\n注意事项：单层 group by 不是透视表（用 excel_pivot）；不新增列（用 excel_calculate）。", excelAggregateSchema());
        seedFileOperate("excel_pivot", "功能说明：按行字段和列字段生成二维交叉汇总表。\n触发关键词：透视表、交叉统计、行列汇总、多维分析\n注意事项：二维交叉不是普通 group by（用 excel_aggregate）。", excelPivotSchema());
        seedFileOperate("excel_calculate", "功能说明：基于已有列生成新计算列。\n触发关键词：计算、派生列、公式、比例\n注意事项：新增计算列不统计汇总（用 excel_aggregate）。", excelCalculateSchema());
        seedFileOperate("excel_select_columns", "功能说明：保留指定列并删除其余列。\n触发关键词：列选择、裁剪字段、导出部分列\n注意事项：列裁剪不是行筛选（用 excel_filter）。", excelSelectColumnsSchema());
        seedFileOperate("excel_clean", "功能说明：去空格、去重、删除空行。\n触发关键词：清洗、去重、去空、清理\n注意事项：只清洗不做业务计算（用 excel_calculate）。", excelCleanSchema());
        seedFileOperate("excel_convert_format", "功能说明：在 xlsx/xls/csv 之间转换并生成文件。\n触发关键词：格式转换、导出 CSV、导出 Excel\n注意事项：仅格式转换不改数据。", excelConvertFormatSchema());
        seedFileOperate("excel_validate", "功能说明：按规则检查数据合规性并返回校验结果。\n触发关键词：校验、检查、合规性、格式校验\n注意事项：只检查不修改（修用 excel_clean）。", excelValidateSchema());
    }

    // ========== 整合方案 B：word_ops 单一入口 ==========

    /** 旧的 word_* 工具，word_read/word_write 已合并到 file_read/file_write */
    private static final java.util.Set<String> LEGACY_WORD_TOOLS;
    static {
        // JDK 1.8 兼容：不能使用 Set.of（Java 9+），用 HashSet + Collections.addAll
        java.util.Set<String> s = new java.util.HashSet<String>();
        java.util.Collections.addAll(s,
                "word_read", "word_write");
        LEGACY_WORD_TOOLS = java.util.Collections.unmodifiableSet(s);
    }

    // ===== add-skill-tags-and-intent-filtering：技能三维度标签 =====
    /**
     * 工具的 file_type / operation_intent / business_scenario 标签三元组。
     * </p>
     * 单一权威源：此表必须在 PR 中与 agent-core prompts/zh.ts 的
     * INTENT_RECOGNITION_SYSTEM_PROMPT 同步；任何分歧在 PR review 阶段拒绝合入。
     */
    private static class ToolTag {
        final String fileType;
        final java.util.List<String> operationIntent;   // 多值，序列化到 DB 用 "," 分隔（对应 SQL FIND_IN_SET）
        final String businessScenario;
        ToolTag(String f, java.util.List<String> o, String b) {
            this.fileType = f;
            this.operationIntent = o;
            this.businessScenario = b;
        }
        // 单值快捷构造（大多数工具的 operationIntent 只有 1 个）
        ToolTag(String f, String o, String b) {
            this(f, java.util.Collections.singletonList(o), b);
        }
    }

    /**
     * 标签权威源：覆盖本次需求图示的 38 个工具。
     *
     * 词表经本次重构收紧：
     * - file_type(5): 通用 / Word / 文本 / Markdown / Excel
     * - operation_intent(4 合并): 读取查看 / 编辑修改 / 创建写入 / 分析计算
     * - business_scenario(6): 文件管理 / 检索查看 / 生成导出 / 提取解析 / 编辑整理 / 计算分析
     * 合计 15。operation_intent 多值（"编辑修改、创建写入"）以 "," 分隔存储，SQL 用 FIND_IN_SET 命中任一。
     *
     * 唯一权威源；agent-core execute-skill.ts 的 INTENT_TAG_WHITELIST 与 tool schema describe 必须镜像此表。
     */
    private static final java.util.Map<String, ToolTag> TOOL_TAGS = new LinkedHashMap<>();
    static {
        // 多值快捷构造
        java.util.List<String> editWrite = java.util.Arrays.asList("编辑修改", "创建写入");
        java.util.List<String> writeRead = java.util.Arrays.asList("创建写入", "读取查看");

        // file_manage 族（7）
        TOOL_TAGS.put("file_list",             new ToolTag("通用",     "读取查看", "文件管理"));
        TOOL_TAGS.put("file_delete",           new ToolTag("通用",     "编辑修改", "文件管理"));
        TOOL_TAGS.put("file_clear_all",        new ToolTag("通用",     "编辑修改", "文件管理"));
        TOOL_TAGS.put("file_detail",           new ToolTag("通用",     "读取查看", "检索查看"));
        TOOL_TAGS.put("file_read",             new ToolTag("通用",     "读取查看", "检索查看"));
        TOOL_TAGS.put("file_write",            new ToolTag("通用",     "创建写入", "生成导出"));
        TOOL_TAGS.put("file_init_temp",        new ToolTag("通用",     "创建写入", "文件管理"));
        // word_operate 族（4）
        TOOL_TAGS.put("word_extract_content",  new ToolTag("Word",     "读取查看", "提取解析"));
        TOOL_TAGS.put("word_search_keyword",   new ToolTag("Word",     "读取查看", "检索查看"));
        TOOL_TAGS.put("word_replace_text",     new ToolTag("Word",     "编辑修改", "编辑整理"));
        TOOL_TAGS.put("word_template_fill",    new ToolTag("Word",     "创建写入", "生成导出"));
        // txt_operate 族（8）
        TOOL_TAGS.put("txt_keyword_lines",     new ToolTag("文本",     "读取查看", "检索查看"));
        TOOL_TAGS.put("txt_regex",             new ToolTag("文本",     "读取查看", "检索查看"));
        TOOL_TAGS.put("txt_line_range",        new ToolTag("文本",     "读取查看", "检索查看"));
        TOOL_TAGS.put("txt_section",           new ToolTag("文本",     "读取查看", "检索查看"));
        TOOL_TAGS.put("txt_stats",             new ToolTag("文本",     "分析计算", "检索查看"));
        TOOL_TAGS.put("txt_distinct_lines",    new ToolTag("文本",     editWrite,   "编辑整理"));
        TOOL_TAGS.put("txt_sort_lines",        new ToolTag("文本",     editWrite,   "编辑整理"));
        TOOL_TAGS.put("txt_keyword_freq",      new ToolTag("文本",     "分析计算", "检索查看"));
        // md_operate 族（9）
        TOOL_TAGS.put("md_images",             new ToolTag("Markdown", "读取查看", "提取解析"));
        TOOL_TAGS.put("md_headings",           new ToolTag("Markdown", "读取查看", "提取解析"));
        TOOL_TAGS.put("md_table",              new ToolTag("Markdown", "读取查看", "提取解析"));
        TOOL_TAGS.put("md_list_items",         new ToolTag("Markdown", "读取查看", "提取解析"));
        TOOL_TAGS.put("md_tasks",              new ToolTag("Markdown", "读取查看", "提取解析"));
        TOOL_TAGS.put("md_emphasis",           new ToolTag("Markdown", "读取查看", "提取解析"));
        TOOL_TAGS.put("md_toc",                new ToolTag("Markdown", writeRead,   "检索查看"));
        TOOL_TAGS.put("md_filter_section",     new ToolTag("Markdown", "编辑修改", "编辑整理"));
        TOOL_TAGS.put("md_merge",              new ToolTag("Markdown", editWrite,   "编辑整理"));
        // excel_operate 族（10）—— excel_init_temp 当前被 deleteLegacyInitTempSkills 删除；
        // TOOL_TAGS 保留条目，未来如需重新启用只需在 run() 里补一行 seedFileOperate("excel_init_temp", ...)。
        TOOL_TAGS.put("excel_init_temp",       new ToolTag("Excel",    "创建写入", "文件管理"));
        TOOL_TAGS.put("excel_filter",          new ToolTag("Excel",    "编辑修改", "编辑整理"));
        TOOL_TAGS.put("excel_sort",            new ToolTag("Excel",    "编辑修改", "编辑整理"));
        TOOL_TAGS.put("excel_aggregate",       new ToolTag("Excel",    "分析计算", "计算分析"));
        TOOL_TAGS.put("excel_pivot",           new ToolTag("Excel",    "分析计算", "计算分析"));
        TOOL_TAGS.put("excel_calculate",       new ToolTag("Excel",    "分析计算", "计算分析"));
        TOOL_TAGS.put("excel_select_columns",  new ToolTag("Excel",    "编辑修改", "编辑整理"));
        TOOL_TAGS.put("excel_clean",           new ToolTag("Excel",    "编辑修改", "编辑整理"));
        TOOL_TAGS.put("excel_convert_format",  new ToolTag("Excel",    editWrite,   "生成导出"));
        TOOL_TAGS.put("excel_validate",        new ToolTag("Excel",    "分析计算", "计算分析"));
    }

    /** 查表；不在表里返回 null（未知工具不加标签，匹配走全量向量池即可）。 */
    private static ToolTag tagOf(String toolName) {
        return TOOL_TAGS.get(toolName);
    }

    /** word_ops 工具的 description（agent-core 透给 LLM） */
    private static final String WORD_OPS_DESCRIPTION =
            "Word 文档操作一体化工具（合并 word_read/word_write/word_extract_content/" +
            "word_search_keyword/word_replace_text/word_template_fill 六个细粒度功能）。\n" +
            "调用时必须先用 action 指定具体子操作：\n" +
            "  • action=read              读取 Word 文档全文（段落 + 全文文本）\n" +
            "  • action=write             创建一个新的 Word 文档（需 title + content）\n" +
            "  • action=extract_content   提取结构化内容（标题大纲 / 表格 / 图片）\n" +
            "  • action=search_keyword    搜索关键字（带上下文匹配结果）\n" +
            "  • action=replace_text      替换文档中的文本（支持全部/首个），需 oldText + newText\n" +
            "  • action=template_fill     用 values 填充 {{placeholder}} 占位符\n" +
            "支持的 fileRef 形式：文件名（如 'report.docx'）或文件 ID（数字）。\n" +
            "写操作（write/replace_text/template_fill）会自动 in-place 覆盖原文件，fileId 不变。\n" +
            "返回的 downloadUrl 请以 Markdown 链接或下载按钮形式展示，不要直接输出原始 URL。\n" +
            "**严禁**使用 'replace' / 'template' / 'fill' / 'search' / 'extract' 等简写 — 必须是上表的完整字符串。";

    /**
     * 把一组老的细粒度 skill 行禁用（enabled=0）。
     * <p>
     * 为什么 disable 而不是删除：用户可能手工编辑过那些行（description/schema），
     * 直接 delete 会丢用户数据；disable 让 LLM 看不到，DB 行保留以便回滚/审计。
     * </p>
     */
    private void disableLegacyFileToolSkills(java.util.Set<String> legacyToolNames) {
        for (String name : legacyToolNames) {
            Skill existing = skillMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Skill>()
                            .eq(Skill::getName, name));
            if (existing == null) {
                continue;  // 首次启动还没建过
            }
            // Skill.enabled 是 primitive boolean，手写 getter 是 isEnabled() 而非 getEnabled()
            if (!existing.isEnabled()) {
                continue;  // 已经是 disabled 状态
            }
            existing.setEnabled(false);
            skillMapper.updateById(existing);
            log.info("Disabled legacy file tool skill: {} (id={})", name, existing.getId());
        }
    }

    /**
     * 回退 word_ops 整合：删除 word_ops 行 + 恢复 6 个细粒度 word_* 工具。
     * <p>
     * 启动时自动执行，可重入。流程：
     * </p>
     * <ol>
     *   <li>删除 skills 表里的 word_ops 行（如果存在）</li>
     *   <li>6 个老 word_* 工具（如果 skills 表里行存在但 enabled=false）→ 重新 enable</li>
     *   <li>调用 {@link #seedFileOperate} 重新 seed 6 个老 word_*（缺哪个补哪个）</li>
     *   <li>对应的 system_skills 行通过 seedSystem 自动 re-seed</li>
     * </ol>
     */
    private void rollbackWordOpsIntegration() {
        // 1. 删除 word_ops 行
        Skill wordOps = skillMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Skill>()
                        .eq(Skill::getName, "word_ops"));
        if (wordOps != null) {
            skillMapper.deleteById(wordOps.getId());
            log.info("Deleted integrated word_ops skill (id={})", wordOps.getId());
        }

        // 2. 6 个老 word_* 重新 enable
        for (String name : LEGACY_WORD_TOOLS) {
            Skill existing = skillMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Skill>()
                            .eq(Skill::getName, name));
            if (existing != null && !existing.isEnabled()) {
                existing.setEnabled(true);
                skillMapper.updateById(existing);
                log.info("Re-enabled legacy word skill: {} (id={})", name, existing.getId());
            }
        }

        // 3. 重新 seed 4 个老 word_*（word_read/word_write 已合并到 file_read/file_write）
        seedFileOperate("word_extract_content", "功能说明：从 doc/docx 提取标题大纲、段落、表格、图片。\n触发关键词：提取内容、抽取、解析 Word、读结构\n注意事项：只读不改；不替换文字（用 word_replace_text）。");
        seedFileOperate("word_search_keyword", "功能说明：在 doc/docx 搜索关键词返回上下文。\n触发关键词：搜索关键字、查找、检索、搜索词\n注意事项：只读不改；替换用 word_replace_text。",
                keywordSearchSchema());
        seedFileOperate("word_replace_text", "功能说明：把 oldText 替换为 newText，支持首个/全部。\n触发关键词：替换、修改文字、改文字、批量替换\n注意事项：只改文字不处理 {{placeholder}}（用 word_template_fill）。",
                replaceTextSchema());
        seedFileOperate("word_template_fill", "功能说明：用 values 填充 {{placeholder}} 占位符。\n触发关键词：模板、占位符、填充、生成合同、生成报告\n注意事项：只填占位符不做普通文本替换（用 word_replace_text）。",
                templateFillSchema());
    }

    /**
     * 删除旧的读写工具（已合并为 file_read/file_write）。
     * <p>
     * 启动时自动执行，可重入。删除 skills 表和 system_skills 表中
     * txt_read、txt_write、md_read、md_write、word_read、word_write、excel_read、excel_write 记录。
     * </p>
     */
    private void deleteLegacyReadWriteSkills() {
        for (String name : new String[]{"txt_read", "txt_write", "md_read", "md_write", "word_read", "word_write", "excel_read", "excel_write"}) {
            Skill existing = skillMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Skill>()
                            .eq(Skill::getName, name)
                            .eq(Skill::getSkillOwnerType, 2));
            if (existing != null) {
                skillMapper.deleteById(existing.getId());
                log.info("Deleted legacy read/write skill: {} (id={})", name, existing.getId());
            }
            SystemSkill existingSys = systemSkillMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SystemSkill>()
                            .eq(SystemSkill::getToolName, name)
                            .eq(SystemSkill::getKind, KIND));
            if (existingSys != null) {
                systemSkillMapper.deleteById(existingSys.getId());
                log.info("Deleted legacy read/write system skill: {} (id={})", name, existingSys.getId());
            }
        }
    }

    /**
     * 删除旧的初始化方法（已合并为 file_init_temp）。
     * <p>
     * 启动时自动执行，可重入。删除 skills 表和 system_skills 表中
     * excel_init_temp、md_init_temp、txt_init_temp 三条记录。
     * </p>
     */
    private void deleteLegacyInitTempSkills() {
        for (String name : new String[]{"excel_init_temp", "md_init_temp", "txt_init_temp"}) {
            Skill existing = skillMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Skill>()
                            .eq(Skill::getName, name)
                            .eq(Skill::getSkillOwnerType, 2));
            if (existing != null) {
                skillMapper.deleteById(existing.getId());
                log.info("Deleted legacy init_temp skill: {} (id={})", name, existing.getId());
            }
            SystemSkill existingSys = systemSkillMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SystemSkill>()
                            .eq(SystemSkill::getToolName, name)
                            .eq(SystemSkill::getKind, KIND));
            if (existingSys != null) {
                systemSkillMapper.deleteById(existingSys.getId());
                log.info("Deleted legacy init_temp system skill: {} (id={})", name, existingSys.getId());
            }
        }
    }

    /**
     * 种子 family 整合型 skill：单一对外 name，内部走 family+action 路由。
     * <p>
     * 与 {@link #seedSkill} 的区别：configuration 是 {@code {kind: "file_tool", family: "word"}}
     * 而不是 {@code {kind: "file_tool", toolName: "word_read"}}。
     * </p>
     * <p>
     * 下游由 {@code SkillExecutionService.executeFileToolSkill} 读 configuration.family
     * 与 parameters.action 拼成内部 toolName（{@code <family>_<action>）委托给现有
     * {@code FileToolService} 调度。
     * </p>
     */
    private void seedFamily(String familyName, String description,
                            Map<String, Map<String, Object>> schema) {
        try {
            String schemaJson = objectMapper.writeValueAsString(schema);

            Skill existing = skillMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Skill>()
                            .eq(Skill::getName, familyName)
                            .eq(Skill::getSkillOwnerType, 2));
            if (existing != null) {
                // 已存在系统技能：直接更新 schema/description/ownerType，不再依据内容是否变化判断。
                existing.setSchemaPropertiesJson(schemaJson);
                existing.setDescription(description);
                existing.setSkillOwnerType(2); // 确保已存在的系统技能标记为 2
                skillMapper.updateById(existing);
                log.info("Updated family skill: {} (id={})", familyName, existing.getId());
                return;
            }

            // configuration 关键变化：family（不是 toolName）
            // 决定 SkillExecutionService 走 family+action 路由
            Map<String, Object> config = new LinkedHashMap<>();
            config.put("kind", "file_tool");
            config.put("family", deriveFamily(familyName));  // "word_ops" -> "word"
            String configJson = objectMapper.writeValueAsString(config);

            Skill skill = new Skill();
            skill.setName(familyName);
            skill.setDescription(description);
            skill.setType(SKILL_TYPE);
            skill.setSkillOwnerType(2); // 系统技能
            skill.setConfiguration(configJson);
            skill.setExecutionMode("CONFIG");
            skill.setEnabled(true);
            skill.setRequiresConfirmation(false);
            skill.setVisibility(SkillVisibility.PUBLIC);
            skill.setCreatedBy(CREATED_BY);
            skill.setSchemaPropertiesJson(schemaJson);

            skillMapper.insert(skill);
            log.info("Seeded family skill: {} (id={}, family={})",
                    familyName, skill.getId(), deriveFamily(familyName));
        } catch (Exception e) {
            log.error("Failed to seed family skill '{}': {}", familyName, e.getMessage());
        }
    }

    /** "word_ops" -> "word"，"txt_ops" -> "txt"，"file_ops" -> "file" */
    private static String deriveFamily(String familySkillName) {
        int idx = familySkillName.indexOf("_ops");
        return idx > 0 ? familySkillName.substring(0, idx) : familySkillName;
    }

    // ========== 种子方法 ==========

    /** 种子 system_skills 表 */
    private void seedSystem(String toolName, String description) {
        try {
            if (systemSkillMapper.findByToolName(toolName).isPresent()) {
                log.debug("System skill already exists: {}", toolName);
                return;
            }
            SystemSkill skill = new SystemSkill();
            skill.setToolName(toolName);
            skill.setDescription(description);
            skill.setKind(KIND);
            skill.setEnabled(true);
            skill.setSchemaVersion(1);
            systemSkillMapper.insert(skill);
            log.info("Seeded system skill: {} (kind={})", toolName, KIND);
        } catch (Exception e) {
            log.error("Failed to seed system skill '{}': {}", toolName, e.getMessage());
        }
    }

    /** 种子 skills 表 + system_skills 表：文件管理类（file_list / file_delete / file_clear_all / file_detail） */
    private void seedFileManage(String toolName, String description,
                                Map<String, Map<String, Object>> schema) {
        seedSystem(toolName, description);
        seedSkill(toolName, description, schema);
    }

    /** 种子 skills 表 + system_skills 表：文件操作类（word_* / txt_* / md_*） */
    private void seedFileOperate(String toolName, String description) {
        seedFileOperate(toolName, description, fileRefSchema());
    }

    private void seedFileOperate(String toolName, String description,
                                 Map<String, Map<String, Object>> schema) {
        seedSystem(toolName, description);
        seedSkill(toolName, description, schema);
    }

    /** 将一条文件工具注册到 skills 表 */
    @SuppressWarnings("unchecked")
    private void seedSkill(String toolName, String description,
                           Map<String, Map<String, Object>> schema) {
        try {
            // 构建 schema_properties JSON（每次启动都用最新版）
            String schemaJson = objectMapper.writeValueAsString(schema);

            // add-skill-tags-and-intent-filtering：从 TOOL_TAGS 读取三维度标签（未命中不影响写入）
            ToolTag tag = tagOf(toolName);

            // 检查是否已存在同名 skill — 已存在则更新 schema（description 和 schema 跟随代码升级）
            // 必须限定 skill_owner_type=2（系统技能），避免误匹配到用户自建的同名技能（ownerType=1）后被当系统技能覆盖。
            // 仅存在用户同名技能时此查询返回 null，走下方 insert 新建一条 ownerType=2 的系统技能行。
            Skill existing = skillMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Skill>()
                            .eq(Skill::getName, toolName)
                            .eq(Skill::getSkillOwnerType, 2));
            if (existing != null) {
                // 已存在系统技能：直接更新 schema/description/ownerType/三标签（add-skill-tags-and-intent-filtering），
                // 不再依据内容是否变化判断；标签值在 TOOL_TAGS 里改了什么 seed 就在 DB 写什么。
                existing.setSchemaPropertiesJson(schemaJson);
                existing.setDescription(description);
                existing.setSkillOwnerType(2); // 确保已存在的系统技能标记为 2
                if (tag != null) {
                    existing.setFileType(tag.fileType);
                    // operationIntent 多值用 "," 分隔存储；SQL 用 FIND_IN_SET 命中任一
                    existing.setOperationIntent(joinOperationIntent(tag.operationIntent));
                    existing.setBusinessScenario(tag.businessScenario);
                }
                skillMapper.updateById(existing);
                log.info("Updated existing skill: {} (id={})", toolName, existing.getId());
                return;
            }

            // 构建 configuration JSON
            Map<String, Object> config = new LinkedHashMap<>();
            config.put("kind", "file_tool");
            config.put("toolName", toolName);
            String configJson = objectMapper.writeValueAsString(config);

            Skill skill = new Skill();
            skill.setName(toolName);
            skill.setDescription(description);
            skill.setType(SKILL_TYPE);
            skill.setSkillOwnerType(2); // 系统技能
            skill.setConfiguration(configJson);
            skill.setExecutionMode("CONFIG");
            skill.setEnabled(true);
            skill.setRequiresConfirmation(false);
            skill.setVisibility(SkillVisibility.PUBLIC);
            skill.setCreatedBy(CREATED_BY);
            skill.setSchemaPropertiesJson(schemaJson);
            if (tag != null) {
                skill.setFileType(tag.fileType);
                // operationIntent 多值用 "," 分隔存储；SQL 用 FIND_IN_SET 命中任一
                skill.setOperationIntent(joinOperationIntent(tag.operationIntent));
                skill.setBusinessScenario(tag.businessScenario);
            }

            skillMapper.insert(skill);
            log.info("Seeded skill: {} (id={}, type={}, kind=file_tool)", toolName, skill.getId(), SKILL_TYPE);
        } catch (Exception e) {
            log.error("Failed to seed skill '{}': {}", toolName, e.getMessage());
        }
    }

    /** 把 ToolTag.operationIntent 列表拼成 "," 分隔字符串写入 DB 列（对应 SQL FIND_IN_SET）。 */
    private static String joinOperationIntent(java.util.List<String> list) {
        if (list == null || list.isEmpty()) return null;
        return String.join(",", list);
    }

    // ========== Schema 定义 ==========

    private static Map<String, Map<String, Object>> fileListSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        s.put("fileType", stringProp("按文件类型过滤（如 docx/xlsx/md），不区分大小写", false));
        s.put("keyword", stringProp("按文件名模糊匹配，不区分大小写", false));
        s.put("sortBy", stringProp("排序字段：uploadTime/size/name，默认 uploadTime", false));
        s.put("order", stringProp("排序方向：asc/desc，默认 desc", false));
        Map<String, Object> page = new LinkedHashMap<>();
        page.put("type", "integer");
        page.put("description", "页码（1-based），默认 1");
        s.put("page", page);
        Map<String, Object> pageSize = new LinkedHashMap<>();
        pageSize.put("type", "integer");
        pageSize.put("description", "每页数量，默认 50，最大 200");
        s.put("pageSize", pageSize);
        return s;
    }

    private static Map<String, Map<String, Object>> fileRefSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息进行下载等操作");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选，当 fileId 无法获取时使用）", false));
        return s;
    }

    private static Map<String, Map<String, Object>> fileDetailSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（优先使用），通过 file_list 获取到的文件 ID");
        s.put("fileId", fileId);
        Map<String, Object> fileName = new LinkedHashMap<>();
        fileName.put("type", "string");
        fileName.put("description", "原始文件名（如 \"report.docx\"），当不知道 fileId 时使用。优先使用 fileId");
        s.put("fileName", fileName);
        Map<String, Object> fileRef = new LinkedHashMap<>();
        fileRef.put("type", "string");
        fileRef.put("description", "文件名引用（与 fileName 等价，择一使用）");
        s.put("fileRef", fileRef);
        return s;
    }

    private static Map<String, Map<String, Object>> fileDeleteSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），要删除的文件 ID");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("要删除的文件名（可选）", false));
        Map<String, Object> confirmed = new LinkedHashMap<>();
        confirmed.put("type", "boolean");
        confirmed.put("description", "二次确认标志。LLM 应先在对话中引导用户确认，用户确认后再次调用设置 confirmed=true");
        s.put("confirmed", confirmed);
        return s;
    }

    private static Map<String, Map<String, Object>> confirmedOnlySchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> confirmed = new LinkedHashMap<>();
        confirmed.put("type", "boolean");
        confirmed.put("description", "二次确认标志。首次调用不传，LLM 引导用户确认文件名后再次调用时设置 confirmed=true");
        s.put("confirmed", confirmed);
        return s;
    }

    private static Map<String, Map<String, Object>> fileReadSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（优先使用），通过 file_list 获取到的文件 ID");
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名或文件 ID（fileId 优先）", false));
        s.put("encoding", stringProp("文件编码（如 UTF-8/GBK），仅对文本文件有效，默认 UTF-8", false));
        s.put("startLine", intProp("起始行号（1-based），仅对文本文件有效，默认 1", false));
        s.put("endLine", intProp("结束行号（1-based），仅对文本文件有效，默认文件末尾", false));
        s.put("maxChars", intProp("最大返回字符数（截断保护），仅对文本文件有效，默认不限制", false));
        s.put("page", intProp("页码，从 1 开始，仅对 Excel 文件有效，默认 1", false));
        s.put("pageSize", intProp("每页行数，仅对 Excel 文件有效，默认 50", false));
        s.put("sheetIndex", intProp("工作表索引，从 0 开始，仅对 Excel 文件有效，默认 0", false));
        s.put("sheetName", stringProp("工作表名称，仅对 Excel 文件有效", false));
        return s;
    }

    private static Map<String, Map<String, Object>> fileWriteSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（可选）。传入时在临时文件基础上操作；不传时创建新文件");
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名或文件 ID（与 fileId 二选一）", false));
        s.put("content", stringProp("要写入的文本内容（必填，文本/Markdown 文件）", true));
        s.put("title", stringProp("Word 文档标题（仅 Word 文件）", false));
        s.put("headers", stringProp("Excel 列头列表，如 [\"姓名\", \"年龄\"]（仅 Excel 文件）", false));
        s.put("rows", stringProp("Excel 数据行列表，如 [[\"张三\", 25]]（仅 Excel 文件）", false));
        s.put("encoding", stringProp("文件编码（如 UTF-8/GBK），仅对文本文件有效，默认 UTF-8", false));
        s.put("append", boolProp("是否追加模式，仅对文本文件有效，默认 false（覆盖）", false));
        s.put("sheetName", stringProp("工作表名称，仅对 Excel 文件有效，默认 Sheet1", false));
        return s;
    }

    private static Map<String, Map<String, Object>> wordWriteSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        s.put("title", stringProp("Word 文档标题", true));
        s.put("content", stringProp("Word 文档正文内容（多行文本）", true));
        return s;
    }

    private static Map<String, Map<String, Object>> keywordSearchSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("keyword", stringProp("搜索关键字", true));
        return s;
    }

    private static Map<String, Map<String, Object>> replaceTextSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        // 描述中显式包含字段名，避免 LLM 只看语义忽略 key 时漏传
        s.put("oldText", stringProp("oldText：要替换的原文本（必填）", true));
        s.put("newText", stringProp("newText：替换后的新文本（必填）", true));
        Map<String, Object> replaceAll = new LinkedHashMap<>();
        replaceAll.put("type", "boolean");
        replaceAll.put("description", "replaceAll：是否全部替换（默认仅替换第一个）");
        s.put("replaceAll", replaceAll);
        return s;
    }

    private static Map<String, Map<String, Object>> templateFillSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("type", "object");
        values.put("description", "占位符键值对，如 {\"name\": \"张三\", \"date\": \"2026-01-01\"}");
        s.put("values", values);
        return s;
    }

    private static Map<String, Map<String, Object>> txtReadSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（优先使用），通过文件 ID 直接查询文件信息");
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名或文件 ID（fileId 优先）", false));
        s.put("encoding", stringProp("文件编码（如 UTF-8/GBK），默认 UTF-8", false));
        s.put("startLine", intProp("起始行号（1-based），默认 1", false));
        s.put("endLine", intProp("结束行号（1-based），默认文件末尾", false));
        return s;
    }

    private static Map<String, Map<String, Object>> txtWriteSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "源文件 ID（已有文件时使用，新建文件时不传），用于生成 _temp 临时副本；源文件本身不会被修改");
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("源文件名或文件 ID（与 fileId 二选一）", false));
        s.put("content", stringProp("要写入/追加的文本内容（必填）", true));
        s.put("encoding", stringProp("文件编码（如 UTF-8/GBK），默认 UTF-8", false));
        Map<String, Object> append = new LinkedHashMap<>();
        append.put("type", "boolean");
        append.put("description", "true=把 content 追加到临时文件（单层 _temp，同一会话内复用）尾部；false=用 content 覆盖临时文件内容（默认 false）。后续调用 txt_write 都自动复用同一个临时文件。");
        s.put("append", append);
        Map<String, Object> originalFileName = new LinkedHashMap<>();
        originalFileName.put("type", "string");
        originalFileName.put("description", "自定义文件名（如 \"报告.txt\"）。新建文件时必须提供——决定生成的文件名（会自动加 _temp 后缀，如 报告_temp.txt）；已有文件时可选，缺省=源文件名");
        s.put("originalFileName", originalFileName);
        return s;
    }

    private static Map<String, Map<String, Object>> txtKeywordLinesSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（优先使用），通过文件 ID 直接查询文件信息");
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名或文件 ID（fileId 优先）", false));
        s.put("keyword", stringProp("要搜索的关键词", true));
        s.put("contextLines", intProp("上下文行数（匹配行前后各 N 行），默认 0", false));
        return s;
    }

    private static Map<String, Map<String, Object>> txtRegexSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（优先使用），通过文件 ID 直接查询文件信息");
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名或文件 ID（fileId 优先）", false));
        s.put("pattern", stringProp("正则表达式", true));
        s.put("groupIndex", intProp("捕获组索引（0=完整匹配），默认 0", false));
        return s;
    }

    private static Map<String, Map<String, Object>> txtLineRangeSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（优先使用），通过文件 ID 直接查询文件信息");
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名或文件 ID（fileId 优先）", false));
        s.put("startLine", intProp("起始行号（1-based），默认 1", false));
        s.put("endLine", intProp("结束行号（1-based），默认文件末尾", false));
        return s;
    }

    private static Map<String, Map<String, Object>> txtSectionSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("heading", stringProp("Markdown 标题文本（如 \"## 概述\"）", true));
        Map<String, Object> nested = new LinkedHashMap<>();
        nested.put("type", "boolean");
        nested.put("description", "是否包含子标题");
        s.put("nested", nested);
        return s;
    }

    // ========== 整合方案 B：word_ops 单一 schema ==========

    /**
     * word_ops 工具的参数 schema。
     * <p>
     * 设计要点：
     * </p>
     * <ol>
     *   <li>action 是 string enum —— 严格拼写 6 个允许值（read/write/extract_content/...）</li>
     *   <li>所有其它参数标记 optional —— 不同 action 用到的参数子集不同，
     *       gateway 端 executeFileToolSkill 按 action 路由到对应 handler，handler 自己校验必填</li>
     *   <li>description 写明"哪个 action 需要哪个参数"，LLM 一次看到全图</li>
     * </ol>
     * <p>
     * 为什么不使用 discriminated union / oneOf：
     * AGENTS.md 5.4 禁止高版本 JS 语法；TypeScript 端用普通 object + zod describe 也行得通。
     * </p>
     */
    private static Map<String, Map<String, Object>> wordOpsSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();

        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("description",
                "**必填**。Word 子操作类型，必须是下列之一：\n" +
                "  • read              读取文档全文\n" +
                "  • write             创建一个新文档（需 title + content）\n" +
                "  • extract_content   提取结构化内容（标题/表格/图片）\n" +
                "  • search_keyword    搜索关键字（需 keyword）\n" +
                "  • replace_text      替换文本（需 oldText + newText，可选 replaceAll）\n" +
                "  • template_fill     填充 {{占位符}}（需 values JSON 字符串）\n" +
                "**严禁**简写 — 必须严格使用以上 6 个完整字符串。");
        s.put("action", action);

        s.put("fileRef", stringProp("文件名或文件 ID。除 action=write 外都必填。", false));
        s.put("title", stringProp("[action=write] 文档标题", false));
        s.put("content", stringProp("[action=write] 文档正文（多行字符串）", false));
        s.put("keyword", stringProp("[action=search_keyword] 要搜索的关键字", false));
        s.put("contextChars",
                intProp("[action=search_keyword] 匹配关键字前后各取多少字符作为上下文，默认 50", false));
        s.put("oldText", stringProp("[action=replace_text] 要替换的原文本（**严格 spelling**）", false));
        s.put("newText", stringProp("[action=replace_text] 替换后的新文本", false));

        Map<String, Object> replaceAll = new LinkedHashMap<>();
        replaceAll.put("type", "boolean");
        replaceAll.put("description", "[action=replace_text] 是否替换所有匹配项，默认 true（全部替换）");
        s.put("replaceAll", replaceAll);

        s.put("values", stringProp(
                "[action=template_fill] JSON 字符串，key=占位符名（如 {\"name\":\"张三\",\"date\":\"2026-06-11\"}）", false));

        Map<String, Object> confirmed = new LinkedHashMap<>();
        confirmed.put("type", "boolean");
        confirmed.put("description", "二次确认标志，写操作类 action 无需手动设置（gateway 自动注入）");
        s.put("confirmed", confirmed);

        return s;
    }

    private static Map<String, Map<String, Object>> txtDistinctLinesSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("caseSensitive", boolProp("是否大小写敏感，默认 true", false));
        s.put("keepEmpty", boolProp("是否保留空行，默认 true", false));
        return s;
    }

    private static Map<String, Map<String, Object>> txtSortLinesSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("order", stringProp("排序方向：asc/desc，默认 asc", false));
        s.put("numeric", boolProp("是否按数字排序（默认 false 字典序）", false));
        s.put("caseSensitive", boolProp("字典序时是否大小写敏感，默认 false", false));
        return s;
    }

    private static Map<String, Map<String, Object>> txtKeywordFreqSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        Map<String, Object> keywords = new LinkedHashMap<>();
        keywords.put("type", "array");
        keywords.put("description", "要统计的关键词列表，例如 [\"Java\",\"Python\"]");
        keywords.put("items", Collections.singletonMap("type", "string"));
        s.put("keywords", keywords);
        return s;
    }

    // ===== MD 扩展操作 Schema =====

    private static Map<String, Map<String, Object>> mdReadSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        s.put("fileRef", stringProp("文件名或文件 ID（必填）", true));
        s.put("maxChars", intProp("最大返回字符数（截断保护），默认不限制", false));
        return s;
    }

    private static Map<String, Map<String, Object>> mdWriteSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        s.put("fileRef", stringProp("临时文件 ID（可选）。两种场景：1) 传入 fileRef 时在临时文件上覆盖写入（结果就地覆盖，fileId 不变）；2) 不传 fileRef 时创建全新 Markdown 文件，自动上传到 FTP 并插入 userfile 表，返回新 fileId。", false));
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("type", "string");
        content.put("description", "Markdown 文本内容（必填）。覆盖写入到目标文件，或作为新文件内容。");
        content.put("required", true);
        s.put("content", content);
        return s;
    }

    private static Map<String, Map<String, Object>> mdFilterSectionSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        s.put("fileRef", stringProp("临时文件 ID（必填，先调 file_init_temp 获得）。结果覆盖写入此文件。", true));
        Map<String, Object> keep = new LinkedHashMap<>();
        keep.put("type", "array");
        keep.put("description",
                "要保留的标题文本列表。文档将只保留这些标题及其下属内容，其余全部删除。"
                        + "如 [\"第三章\"] 只保留 # 第三章 下的全部内容。"
                        + "注意：keep 和 remove 二选一，不要同时传入。");
        keep.put("items", stringProp("Markdown 标题文本（精确匹配，区分大小写）", true));
        s.put("keep", keep);
        Map<String, Object> remove = new LinkedHashMap<>();
        remove.put("type", "array");
        remove.put("description",
                "要删除的标题文本列表。这些标题及其下属内容将从文档中删除，其余内容保留。"
                        + "如 [\"第二章\"] 删除 # 第二章 下的全部内容。"
                        + "注意：keep 和 remove 二选一，不要同时传入。");
        remove.put("items", stringProp("Markdown 标题文本（精确匹配，区分大小写）", true));
        s.put("remove", remove);
        return s;
    }

    private static Map<String, Map<String, Object>> mdMergeSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        s.put("fileRef", stringProp("临时文件 ID（必填，先调 file_init_temp 获得）。合并结果覆盖写入此文件。", true));
        Map<String, Object> sourceFileIds = new LinkedHashMap<>();
        sourceFileIds.put("type", "array");
        sourceFileIds.put("description", "要合并的源文件 ID 列表（至少 2 个）。合并后生成新文件，返回 fileId 和 downloadUrl。");
        Map<String, Object> idItem = new LinkedHashMap<>();
        idItem.put("type", "integer");
        idItem.put("description", "user_files 表中的文件 ID");
        sourceFileIds.put("items", idItem);
        s.put("sourceFileIds", sourceFileIds);
        s.put("frontmatterConflict", stringProp("多文件有 frontmatter 时的冲突处理策略：error（报错）/ first（保留第一个）/ last（保留最后一个），默认 error", false));
        Map<String, Object> prefixHeaders = new LinkedHashMap<>();
        prefixHeaders.put("type", "boolean");
        prefixHeaders.put("description", "是否在每个源文件内容前添加 `# 文件名` 标题，默认 true");
        s.put("prefixHeaders", prefixHeaders);
        return s;
    }

    // ========== Excel 工具 Schema 定义 ==========

    private static Map<String, Map<String, Object>> excelReadSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("page", intProp("页码，从 1 开始，默认 1", false));
        s.put("pageSize", intProp("每页行数，默认 50，建议 20~100 之间", false));
        s.put("sheetIndex", intProp("工作表索引，从 0 开始，默认 0（第一个工作表）。与 sheetName 互斥，sheetName 优先", false));
        s.put("sheetName", stringProp("工作表名称。与 sheetIndex 互斥，优先使用 sheetName 指定工作表", false));
        return s;
    }

    private static Map<String, Map<String, Object>> excelWriteSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（可选）。两种场景：1) 传入 fileId 时在临时文件基础上操作；2) 不传 fileId 时创建新文件并插入 userfile 表");
        fileId.put("required", false);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("sheetName", stringProp("新建工作表名称，默认 \"Sheet1\"", false));
        Map<String, Object> headers = new LinkedHashMap<>();
        headers.put("type", "array");
        headers.put("description", "列头列表（必填），如 [\"姓名\", \"年龄\", \"部门\"]");
        headers.put("required", true);
        s.put("headers", headers);
        
        Map<String, Object> rows = new LinkedHashMap<>();
        rows.put("type", "array");
        rows.put("description", "数据行列表，如 [[\"张三\", 25, \"研发部\"], [\"李四\", 30, \"销售部\"]]");
        s.put("rows", rows);
        
        return s;
    }

    private static Map<String, Map<String, Object>> excelFilterSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("sheetIndex", intProp("工作表索引，从 0 开始，默认 0（第一个工作表）。与 sheetName 互斥，sheetName 优先", false));
        s.put("sheetName", stringProp("工作表名称。与 sheetIndex 互斥，优先使用 sheetName 指定工作表", false));
        s.put("column", stringProp("列名（必填）", true));
        s.put("operator", stringProp("操作符：equals/contains/gt/lt/gte/lte/notEquals，默认 equals", false));
        s.put("value", stringProp("筛选值（必填）", true));
        s.put("inPlace", boolProp("是否原地覆盖当前 sheet（true=覆盖原数据，便于后续操作；false=新建 sheet），默认 true", false));
        return s;
    }

    private static Map<String, Map<String, Object>> excelSortSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("sheetIndex", intProp("工作表索引，从 0 开始，默认 0（第一个工作表）。与 sheetName 互斥，sheetName 优先", false));
        s.put("sheetName", stringProp("工作表名称。与 sheetIndex 互斥，优先使用 sheetName 指定工作表", false));
        s.put("column", stringProp("排序列名（必填）", true));
        s.put("order", stringProp("排序方向：asc/desc，默认 asc", false));
        s.put("inPlace", boolProp("是否原地覆盖当前 sheet（true=覆盖原数据，便于后续操作；false=新建 sheet），默认 true", false));
        return s;
    }

    private static Map<String, Map<String, Object>> excelAggregateSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("sheetIndex", intProp("工作表索引，从 0 开始，默认 0（第一个工作表）。与 sheetName 互斥，sheetName 优先", false));
        s.put("sheetName", stringProp("工作表名称。与 sheetIndex 互斥，优先使用 sheetName 指定工作表", false));
        s.put("groupBy", stringProp("分组列名（必填）", true));
        s.put("aggColumn", stringProp("聚合列名（必填）", true));
        s.put("aggType", stringProp("聚合类型：sum/avg/count/min/max，默认 sum", false));
        return s;
    }

    private static Map<String, Map<String, Object>> excelPivotSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("sheetIndex", intProp("工作表索引，从 0 开始，默认 0（第一个工作表）。与 sheetName 互斥，sheetName 优先", false));
        s.put("sheetName", stringProp("工作表名称。与 sheetIndex 互斥，优先使用 sheetName 指定工作表", false));
        s.put("rowDimension", stringProp("行维度（必填）", true));
        s.put("colDimension", stringProp("列维度（必填）", true));
        s.put("valueColumn", stringProp("值列（必填）", true));
        s.put("inPlace", boolProp("是否原地覆盖当前 sheet（true=覆盖原数据，便于后续操作；false=新建 sheet），默认 true", false));
        return s;
    }

    private static Map<String, Map<String, Object>> excelCalculateSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("sheetIndex", intProp("工作表索引，从 0 开始，默认 0（第一个工作表）。与 sheetName 互斥，sheetName 优先", false));
        s.put("sheetName", stringProp("工作表名称。与 sheetIndex 互斥，优先使用 sheetName 指定工作表", false));
        s.put("newColumn", stringProp("新列名（必填）", true));
        s.put("formula", stringProp("计算公式，支持引用列名，如 {col1} + {col2} * 1.1", true));
        s.put("inPlace", boolProp("是否原地覆盖当前 sheet（true=覆盖原数据，便于后续操作；false=新建 sheet），默认 true", false));
        return s;
    }

    private static Map<String, Map<String, Object>> excelSelectColumnsSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("sheetIndex", intProp("工作表索引，从 0 开始，默认 0（第一个工作表）。与 sheetName 互斥，sheetName 优先", false));
        s.put("sheetName", stringProp("工作表名称。与 sheetIndex 互斥，优先使用 sheetName 指定工作表", false));
        
        Map<String, Object> columns = new LinkedHashMap<>();
        columns.put("type", "array");
        columns.put("description", "要选择的列名列表（必填），如 [\"姓名\", \"年龄\"]");
        columns.put("required", true);
        s.put("columns", columns);
        
        s.put("inPlace", boolProp("是否原地覆盖当前 sheet（true=覆盖原数据，便于后续操作；false=新建 sheet），默认 true", false));
        return s;
    }

    private static Map<String, Map<String, Object>> excelCleanSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("sheetIndex", intProp("工作表索引，从 0 开始，默认 0（第一个工作表）。与 sheetName 互斥，sheetName 优先", false));
        s.put("sheetName", stringProp("工作表名称。与 sheetIndex 互斥，优先使用 sheetName 指定工作表", false));
        s.put("cleanType", stringProp("清洗类型：trim（去除首尾空格）/deduplicate（去重）/removeEmpty（移除空行）", true));
        s.put("inPlace", boolProp("是否原地覆盖当前 sheet（true=覆盖原数据，便于后续操作；false=新建 sheet），默认 true", false));
        return s;
    }

    private static Map<String, Map<String, Object>> excelConvertFormatSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("sheetIndex", intProp("工作表索引，从 0 开始，默认 0（第一个工作表）。与 sheetName 互斥，sheetName 优先。转换为 CSV 时仅导出指定工作表", false));
        s.put("sheetName", stringProp("工作表名称。与 sheetIndex 互斥，优先使用 sheetName 指定工作表。转换为 CSV 时仅导出指定工作表", false));
        s.put("targetFormat", stringProp("目标格式：xlsx/xls/csv", true));
        return s;
    }

    private static Map<String, Map<String, Object>> excelValidateSchema() {
        Map<String, Map<String, Object>> s = new LinkedHashMap<>();
        Map<String, Object> fileId = new LinkedHashMap<>();
        fileId.put("type", "integer");
        fileId.put("description", "文件 ID（必填），通过文件 ID 直接查询文件信息");
        fileId.put("required", true);
        s.put("fileId", fileId);
        s.put("fileRef", stringProp("文件名（可选）", false));
        s.put("sheetIndex", intProp("工作表索引，从 0 开始，默认 0（第一个工作表）。与 sheetName 互斥，sheetName 优先", false));
        s.put("sheetName", stringProp("工作表名称。与 sheetIndex 互斥，优先使用 sheetName 指定工作表", false));
        
        Map<String, Object> rules = new LinkedHashMap<>();
        rules.put("type", "array");
        rules.put("description", "校验规则列表，如 [{\"column\": \"年龄\", \"rule\": \"min\", \"value\": 18}]");
        s.put("rules", rules);

        return s;
    }

    // ========== Schema 构建工具方法 ==========

    private static Map<String, Object> stringProp(String description, boolean required) {
        Map<String, Object> prop = new LinkedHashMap<>();
        prop.put("type", "string");
        prop.put("description", description);
        if (required) {
            prop.put("required", true);
        }
        return prop;
    }

    private static Map<String, Object> boolProp(String description, boolean required) {
        Map<String, Object> prop = new LinkedHashMap<>();
        prop.put("type", "boolean");
        prop.put("description", description);
        if (required) {
            prop.put("required", true);
        }
        return prop;
    }

    private static Map<String, Object> intProp(String description, boolean required) {
        Map<String, Object> prop = new LinkedHashMap<>();
        prop.put("type", "integer");
        prop.put("description", description);
        if (required) {
            prop.put("required", true);
        }
        return prop;
    }
}
