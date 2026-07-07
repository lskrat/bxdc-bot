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
        seedFileManage("file_list", "列出用户已上传的文件，支持类型过滤、关键词搜索、排序和分页",
                fileListSchema());
        seedFileManage("file_delete", "删除指定文件，支持文件ID或文件名引用，需要二次确认",
                fileDeleteSchema());
        seedFileManage("file_clear_all", "清空当前会话内的所有文件，需要二次确认",
                confirmedOnlySchema());
        seedFileManage("file_detail", "查看文件详情，包括名称、大小、类型、上传时间、下载链接",
                fileDetailSchema());
        seedFileManage("file_init_temp", "初始化文件临时副本，复制源文件供后续修改操作使用，支持所有文件类型",
                fileRefSchema());
        seedFileOperate("file_read", "通用文件读取工具，根据文件类型自动路由到对应处理器，支持 txt/md/log/html/docx/doc/xlsx/xls/csv",
                fileReadSchema());
        seedFileOperate("file_write", "通用文件写入工具，根据文件类型自动路由到对应处理器。支持 txt/md/log/html/docx/xlsx/csv 格式。用于生成数据分析报告、统计结果报告、文本内容输出、创建 Word 文档、创建 Excel 表格等场景。Word 文档支持 Markdown 格式输入（标题、列表、表格、加粗），Excel 支持多工作表操作",
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
        seedFileOperate("txt_keyword_lines", "提取文本文件中包含指定关键词的行，支持上下文展示", txtKeywordLinesSchema());
        seedFileOperate("txt_regex", "用正则表达式匹配文本行并提取捕获组", txtRegexSchema());
        seedFileOperate("txt_line_range", "提取文本文件中指定行范围的内容", txtLineRangeSchema());
        seedFileOperate("txt_section", "提取 Markdown 文件的标题章节内容", txtSectionSchema());
        seedFileOperate("txt_stats", "统计文本文件的字符数、词数、行数、字节数");
        seedFileOperate("txt_distinct_lines", "对文本文件的行进行去重操作", txtDistinctLinesSchema());
        seedFileOperate("txt_sort_lines", "对文本文件的行进行排序操作", txtSortLinesSchema());
        seedFileOperate("txt_keyword_freq", "统计关键词在文本文件中的出现频率", txtKeywordFreqSchema());

        // ===== MD 扩展操作 =====
        seedFileOperate("md_images", "提取 Markdown 文件中的所有图片引用");
        seedFileOperate("md_headings", "提取 Markdown 文件的全层级标题结构");
        seedFileOperate("md_table", "提取 Markdown 文件中的 GFM 表格数据");
        seedFileOperate("md_list_items", "提取 Markdown 文件中的所有列表项");
        seedFileOperate("md_tasks", "提取 Markdown 文件中的任务清单项");
        seedFileOperate("md_emphasis", "提取 Markdown 文件中的加粗、斜体、删除线和行内代码");
        seedFileOperate("md_toc", "生成 Markdown 文档的目录大纲");
        seedFileOperate("md_filter_section",
                "删除或保留 Markdown 文件中指定标题的整节内容，支持 remove 或 keep 参数",
                mdFilterSectionSchema());
        seedFileOperate("md_merge", "合并多个 Markdown 文件到一个文件",
                mdMergeSchema());

        // ===== Excel 操作（支持 xlsx/xls/csv）=====
        seedFileOperate("excel_filter", "按条件筛选 Excel 数据行，支持多种比较操作符，用于筛选特定条件的数据、过滤数据、按字段条件查询等场景", excelFilterSchema());
        seedFileOperate("excel_sort", "按指定列对 Excel 数据进行排序，支持升序和降序，用于数据排序、按字段排序输出等场景", excelSortSchema());
        seedFileOperate("excel_aggregate", "按列分组聚合 Excel 数据，支持 sum/avg/count/min/max，用于数据统计分析、多维统计、数据分布分析等场景", excelAggregateSchema());
        seedFileOperate("excel_pivot", "对 Excel 数据进行透视分析，交叉汇总行列数据", excelPivotSchema());
        seedFileOperate("excel_calculate", "在 Excel 中进行列运算，支持引用其他列生成新计算列", excelCalculateSchema());
        seedFileOperate("excel_select_columns", "选择并保留 Excel 中指定的列，删除其余列", excelSelectColumnsSchema());
        seedFileOperate("excel_clean", "对 Excel 数据进行清洗，支持去空格、去重、删空行", excelCleanSchema());
        seedFileOperate("excel_convert_format", "转换 Excel 文件格式，支持 xlsx/xls/csv 互转", excelConvertFormatSchema());
        seedFileOperate("excel_validate", "按规则校验 Excel 数据合规性，返回校验结果", excelValidateSchema());
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
        seedFileOperate("word_extract_content", "提取 Word 文档的结构化内容，包括标题大纲、表格、图片");
        seedFileOperate("word_search_keyword", "在 Word 文档中搜索关键字，返回匹配结果及上下文",
                keywordSearchSchema());
        seedFileOperate("word_replace_text", "替换 Word 文档中的文本内容，支持全部替换或仅替换第一个",
                replaceTextSchema());
        seedFileOperate("word_template_fill", "用数据填充 Word 文档中的占位符（{{placeholder}} 格式）",
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

            // 检查是否已存在同名 skill — 已存在则更新 schema（description 和 schema 跟随代码升级）
            // 必须限定 skill_owner_type=2（系统技能），避免误匹配到用户自建的同名技能（ownerType=1）后被当系统技能覆盖。
            // 仅存在用户同名技能时此查询返回 null，走下方 insert 新建一条 ownerType=2 的系统技能行。
            Skill existing = skillMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Skill>()
                            .eq(Skill::getName, toolName)
                            .eq(Skill::getSkillOwnerType, 2));
            if (existing != null) {
                // 已存在系统技能：直接更新 schema/description/ownerType，不再依据内容是否变化判断。
                existing.setSchemaPropertiesJson(schemaJson);
                existing.setDescription(description);
                existing.setSkillOwnerType(2); // 确保已存在的系统技能标记为 2
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

            skillMapper.insert(skill);
            log.info("Seeded skill: {} (id={}, type={}, kind=file_tool)", toolName, skill.getId(), SKILL_TYPE);
        } catch (Exception e) {
            log.error("Failed to seed skill '{}': {}", toolName, e.getMessage());
        }
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
