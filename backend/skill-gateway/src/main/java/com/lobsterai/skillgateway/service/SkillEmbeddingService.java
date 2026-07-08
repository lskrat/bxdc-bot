package com.lobsterai.skillgateway.service;

import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.mapper.SkillMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * 技能向量检索服务。
 *
 * <p>
 * 在应用启动时将 skill_owner_type=2 的已启用系统技能加载到内存，
 * 对每个技能的 name + description 生成 embedding 向量，
 * 查询时计算余弦相似度并按权重（search_weight）排序返回 top-K。
 * </p>
 *
 * <p>
 * 设计原则：
 * - 纯内存向量索引，无外部向量数据库依赖
 * - 系统技能数量通常 < 200，全量内存加载足够
 * - 每个向量 1536 维（text-embedding-3-small），200 个技能约 1.2MB
 * - 查询 O(N) 线性遍历 + cosine 计算，200 个技能 < 1ms
 * - embedding API 不可用时降级为空结果（不阻塞启动）
 * </p>
 */
@Service
public class SkillEmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(SkillEmbeddingService.class);

    /** 向量检索默认返回数量 */
    private static final int DEFAULT_MATCH_LIMIT = 8;

    /** 最小相似度阈值（低于此分数不返回） */
    private static final double MIN_SIMILARITY = 0.25;

    /** add-skill-tags-and-intent-filtering：SQL 硬筛结果候选数 < 此阈值时降级全量向量池。
     *  设为 1：23 个标签里每标签通常只命中 1-3 个工具，5 太高会让安全阀几乎总是触发，
     *  导致 tag 路径形同虚设。1 = 信任白名单过滤结果，仅在 SQL 真返回 0（hallucination）
     *  时才回退。 */
    private static final int MIN_CANDIDATE_SIZE = 1;

    /** 关键词匹配权重（与向量相似度混合时的权重） */
    private static final double KEYWORD_WEIGHT = 0.4;

    /** 语义相似度权重 */
    private static final double SEMANTIC_WEIGHT = 0.6;

    /** 文件类型关键词映射（用于增强匹配） */
    private static final java.util.Map<String, java.util.Set<String>> FILE_TYPE_KEYWORDS = new java.util.HashMap<>();
    static {
        FILE_TYPE_KEYWORDS.put("word", new java.util.HashSet<>(java.util.Arrays.asList("word", "文档", "报告")));
        FILE_TYPE_KEYWORDS.put("excel", new java.util.HashSet<>(java.util.Arrays.asList("excel", "表格", "数据")));
        FILE_TYPE_KEYWORDS.put("md", new java.util.HashSet<>(java.util.Arrays.asList("md", "markdown", "笔记")));
        FILE_TYPE_KEYWORDS.put("txt", new java.util.HashSet<>(java.util.Arrays.asList("txt", "文本", "日志")));
        FILE_TYPE_KEYWORDS.put("log", new java.util.HashSet<>(java.util.Arrays.asList("log", "日志")));
        FILE_TYPE_KEYWORDS.put("html", new java.util.HashSet<>(java.util.Arrays.asList("html", "网页")));
    }

    /** 操作动词同义词映射 */
    private static final java.util.Map<String, java.util.Set<String>> ACTION_SYNONYMS = new java.util.HashMap<>();
    static {
        ACTION_SYNONYMS.put("统计", new java.util.HashSet<>(java.util.Arrays.asList("统计", "分析", "汇总", "计算", "聚合")));
        ACTION_SYNONYMS.put("生成", new java.util.HashSet<>(java.util.Arrays.asList("生成", "创建", "制作", "输出")));
        ACTION_SYNONYMS.put("筛选", new java.util.HashSet<>(java.util.Arrays.asList("筛选", "过滤", "查找", "搜索", "查询")));
        ACTION_SYNONYMS.put("排序", new java.util.HashSet<>(java.util.Arrays.asList("排序", "排列", "整理")));
        ACTION_SYNONYMS.put("读取", new java.util.HashSet<>(java.util.Arrays.asList("读取", "查看", "获取", "打开")));
        ACTION_SYNONYMS.put("写入", new java.util.HashSet<>(java.util.Arrays.asList("写入", "保存", "导出", "写入")));
        ACTION_SYNONYMS.put("修改", new java.util.HashSet<>(java.util.Arrays.asList("修改", "编辑", "更新")));
        ACTION_SYNONYMS.put("删除", new java.util.HashSet<>(java.util.Arrays.asList("删除", "移除")));
        ACTION_SYNONYMS.put("转换", new java.util.HashSet<>(java.util.Arrays.asList("转换", "格式转换")));
    }

    /** 技能类型映射 */
    private static final java.util.Map<String, java.util.Set<String>> SKILL_TYPE_MAP = new java.util.HashMap<>();
    static {
        SKILL_TYPE_MAP.put("word", new java.util.HashSet<>(java.util.Arrays.asList("word_read", "word_write")));
        SKILL_TYPE_MAP.put("excel", new java.util.HashSet<>(java.util.Arrays.asList("excel_read", "excel_write", "excel_filter", "excel_sort", "excel_aggregate")));
        SKILL_TYPE_MAP.put("md", new java.util.HashSet<>(java.util.Arrays.asList("md_read", "md_write")));
        SKILL_TYPE_MAP.put("txt", new java.util.HashSet<>(java.util.Arrays.asList("txt_read", "txt_write")));
    }

    private final SkillMapper skillMapper;
    private final EmbeddingService embeddingService;

    /** 内存向量索引：skillId → SkillVector */
    private volatile Map<Long, SkillVector> index = Collections.emptyMap();

    /** 是否已初始化 */
    private volatile boolean initialized = false;

    @Autowired
    public SkillEmbeddingService(SkillMapper skillMapper, EmbeddingService embeddingService) {
        this.skillMapper = skillMapper;
        this.embeddingService = embeddingService;
    }

    /**
     * 技能向量条目。
     */
    public static class SkillVector {
        public final long skillId;
        public final String name;
        public final String description;
        public final String type;
        public final String executionMode;
        public final boolean requiresConfirmation;
        public final String avatar;
        public final double searchWeight;
        public final float[] embedding;
        public final String embeddingText;

        SkillVector(Skill skill, float[] embedding, String embeddingText) {
            this.skillId = skill.getId();
            this.name = skill.getName();
            this.description = skill.getDescription();
            this.type = skill.getType();
            this.executionMode = skill.getExecutionMode();
            this.requiresConfirmation = skill.isRequiresConfirmation();
            this.avatar = skill.getAvatar();
            Double w = skill.getSearchWeight();
            this.searchWeight = (w != null && w > 0) ? w : 1.0;
            this.embedding = embedding;
            this.embeddingText = embeddingText;
        }
    }

    /**
     * 检索匹配结果。
     */
    public static class MatchResult {
        public long skillId;
        public String name;
        public String description;
        public String type;
        public String executionMode;
        public boolean requiresConfirmation;
        public String avatar;
        public double score;
    }

    /**
     * 应用启动完成后加载所有系统技能的 embedding。
     */
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        log.info("[SkillEmbedding] Starting to load system skill embeddings...");
        try {
            loadIndex();
            log.info("[SkillEmbedding] Loaded {} system skills into vector index", index.size());
        } catch (Exception e) {
            log.error("[SkillEmbedding] Failed to load skill embeddings: {}", e.getMessage(), e);
        }
    }

    /**
     * 加载/重新加载向量索引。
     */
    public synchronized void loadIndex() {
        List<Skill> skills = skillMapper.findBySkillOwnerTypeAndEnabledIsTrue(2);
        if (skills.isEmpty()) {
            log.warn("[SkillEmbedding] No enabled system skills (skill_owner_type=2) found");
            index = Collections.emptyMap();
            initialized = true;
            return;
        }

        log.info("[SkillEmbedding] Found {} system skills, generating embeddings...", skills.size());
        ConcurrentHashMap<Long, SkillVector> newIndex = new ConcurrentHashMap<>();
        int successCount = 0;

        for (Skill skill : skills) {
            // 搜索权重为 0 的技能不参与检索
            Double w = skill.getSearchWeight();
            if (w != null && w <= 0) {
                log.debug("[SkillEmbedding] Skipping skill id={} (search_weight=0)", skill.getId());
                continue;
            }

            // 拼接 name + description 作为 embedding 文本
            String text = buildEmbeddingText(skill);
            float[] embedding = embeddingService.embedWithDefault(text);
            if (embedding != null) {
                newIndex.put(skill.getId(), new SkillVector(skill, embedding, text));
                successCount++;
            } else {
                log.warn("[SkillEmbedding] Failed to generate embedding for skill id={}, name={}",
                        skill.getId(), skill.getName());
            }
        }

        this.index = newIndex;
        this.initialized = true;
        log.info("[SkillEmbedding] Successfully loaded {}/{} skill embeddings", successCount, skills.size());
    }

    /**
     * 向量检索：根据 query 查找最匹配的技能。
     *
     * @param query 检索文本（LLM 提炼的关键词或简短描述）
     * @param limit 返回数量上限
     * @return 按分数降序排列的匹配结果列表；embedding 不可用时返回空列表
     */
    public List<MatchResult> match(String query, int limit) {
        // 保持向后兼容：旧调用方不传 tags 时完全等价 e2ac8ce
        return match(query, null, limit);
    }

    /**
     * 向量检索（使用默认 limit）。
     */
    public List<MatchResult> match(String query) {
        return match(query, null, DEFAULT_MATCH_LIMIT);
    }

    /**
     * 三阶段管线：根据 query + 可选 tags 查找最匹配的技能。
     * <p>
     * 阶段 1（add-skill-tags-and-intent-filtering）：SQL 硬筛。
     *   tags 非空时按 file_type/operation_intent/business_scenario 三列 OR IN 匹配
     *   skill_owner_type=2 的技能 ID，候选集 < MIN_CANDIDATE_SIZE 时降级全量向量池。
     * </p>
     * <p>
     * 阶段 2：保留 e2ac8ce 的 cosine + 关键词 hybrid 打分。
     *   阶段 1 命中时仅对候选集打分，候选集为 null 时全量打分。
     * </p>
     * <p>
     * 阶段 3：按 search_weight 加权排序取 top-K。
     * </p>
     *
     * @param query 检索文本
     * @param tags 可选标签（null/空 = 阶段 1 完全跳过 = 等价 e2ac8ce）
     * @param limit 返回数量上限
     */
    public List<MatchResult> match(String query, List<String> tags, int limit) {
        if (!initialized || index.isEmpty()) {
            log.warn("[SkillEmbedding] Index not initialized or empty, returning empty result");
            return Collections.emptyList();
        }
        if (query == null || query.trim().isEmpty()) {
            return Collections.emptyList();
        }

        int actualLimit = limit > 0 ? limit : DEFAULT_MATCH_LIMIT;

        // 阶段 1：SQL 硬筛（add-skill-tags-and-intent-filtering）
        Set<Long> candidates = null;
        if (tags != null && !tags.isEmpty()) {
            try {
                List<Long> ids = skillMapper.findIdsByTags(tags, 2);
                candidates = new HashSet<>(ids);
                log.info("[SkillEmbedding] SQL hard filter returned {} candidates for tags={}, ids={}",
                        candidates.size(), tags,
                        candidates.stream().limit(20).collect(Collectors.toList()));

                // 安全阀：候选过窄时降级全量向量池
                if (candidates.size() < MIN_CANDIDATE_SIZE) {
                    log.warn("[SkillEmbedding] SQL filter returned only {} candidates (below MIN_CANDIDATE_SIZE={}) "
                            + "for tags={}, fallback to full vector pool",
                            candidates.size(), MIN_CANDIDATE_SIZE, tags);
                    candidates = null;
                }
            } catch (Exception e) {
                // SQL 异常：降级全量向量（与未传 tags 等价）
                log.warn("[SkillEmbedding] findIdsByTags failed: {}, fallback to full vector pool", e.getMessage());
                candidates = null;
            }
        }

        // 1. 生成 query embedding
        float[] queryEmbedding = embeddingService.embedWithDefault(query.trim());
        if (queryEmbedding == null) {
            log.warn("[SkillEmbedding] Failed to embed query, returning empty result");
            return Collections.emptyList();
        }

        // 2. 计算所有（或候选集内的）技能的混合分数（语义相似度 + 关键词匹配）
        List<MatchResult> results = new ArrayList<>();
        for (SkillVector sv : index.values()) {
            // 阶段 1 命中时跳过非候选集；tags==null 时对全量打分（兼容 e2ac8ce）
            if (candidates != null && !candidates.contains(sv.skillId)) {
                continue;
            }
            if (sv.embedding == null) continue;
            double semanticScore = embeddingService.cosineSimilarity(queryEmbedding, sv.embedding);
            if (semanticScore < MIN_SIMILARITY) continue;

            // 计算关键词匹配分数
            double keywordScore = calculateKeywordScore(query, sv);

            // 混合分数 = 语义相似度 × 语义权重 + 关键词匹配分数 × 关键词权重
            double hybridScore = (semanticScore * SEMANTIC_WEIGHT) + (keywordScore * KEYWORD_WEIGHT);

            // 最终分数 = 混合分数 × 搜索权重
            double finalScore = hybridScore * sv.searchWeight;

            MatchResult mr = new MatchResult();
            mr.skillId = sv.skillId;
            mr.name = sv.name;
            mr.description = sv.description;
            mr.type = sv.type;
            mr.executionMode = sv.executionMode;
            mr.requiresConfirmation = sv.requiresConfirmation;
            mr.avatar = sv.avatar;
            mr.score = finalScore;
            results.add(mr);
        }

        // 3. 按分数降序排序，取 top-K
        results.sort(Comparator.comparingDouble((MatchResult r) -> r.score).reversed());

        // 4. 过滤 score<=0 的噪声结果（hybridScore=0 或 searchWeight=0 的工具）
        // 保留 0.25 阈值放行的真正相关工具，去掉 BGE 判为完全不相关却被 searchWeight 拉进来的死阳性。
        // 不加锚定/-0.15 之类的二次门槛，避免误伤边综 case（如补充工具 0.35）。
        int beforeFilter = results.size();
        List<MatchResult> filtered = results.stream()
                .filter(r -> r.score > 0.0)
                .limit(actualLimit)
                .collect(Collectors.toList());

        log.info("[SkillEmbedding] Query '{}' matched {}/{} skills (top-{}, after score>0 filter {}=>{} )",
                query.length() > 60 ? query.substring(0, 60) + "..." : query,
                filtered.size(), beforeFilter, actualLimit, beforeFilter, filtered.size());

        return filtered;
    }

    /**
     * 索引是否已初始化。
     */
    public boolean isInitialized() {
        return initialized;
    }

    /**
     * 当前索引大小。
     */
    public int getIndexSize() {
        return index.size();
    }

    /**
     * 计算关键词匹配分数。
     * 检查技能名称/描述中是否包含查询中的关键术语（如文件类型、操作动词等）。
     *
     * @param query 用户查询文本
     * @param sv 技能向量
     * @return 关键词匹配分数（0-1）
     */
    private double calculateKeywordScore(String query, SkillVector sv) {
        if (query == null || query.trim().isEmpty()) {
            return 0.0;
        }

        String lowerQuery = query.toLowerCase();
        String lowerSkillText = (sv.name + " " + sv.description).toLowerCase();

        double score = 0.0;
        int matchedCount = 0;
        int totalWeight = 0;

        // 1. 检查文件类型关键词匹配（权重最高）
        for (java.util.Map.Entry<String, java.util.Set<String>> entry : FILE_TYPE_KEYWORDS.entrySet()) {
            String fileType = entry.getKey();
            java.util.Set<String> aliases = entry.getValue();

            boolean queryHasType = lowerQuery.contains(fileType);
            for (String alias : aliases) {
                if (lowerQuery.contains(alias)) {
                    queryHasType = true;
                    break;
                }
            }

            if (queryHasType) {
                boolean skillHasType = lowerSkillText.contains(fileType);
                for (String alias : aliases) {
                    if (lowerSkillText.contains(alias)) {
                        skillHasType = true;
                        break;
                    }
                }

                if (skillHasType) {
                    score += 0.5;
                    matchedCount++;
                    totalWeight++;
                }
            }
        }

        // 2. 检查操作动词同义词匹配（权重较高）
        for (java.util.Map.Entry<String, java.util.Set<String>> entry : ACTION_SYNONYMS.entrySet()) {
            String action = entry.getKey();
            java.util.Set<String> synonyms = entry.getValue();

            boolean queryHasAction = false;
            for (String synonym : synonyms) {
                if (lowerQuery.contains(synonym.toLowerCase())) {
                    queryHasAction = true;
                    break;
                }
            }

            if (queryHasAction) {
                boolean skillHasAction = false;
                for (String synonym : synonyms) {
                    if (lowerSkillText.contains(synonym.toLowerCase())) {
                        skillHasAction = true;
                        break;
                    }
                }

                if (skillHasAction) {
                    score += 0.4;
                    matchedCount++;
                    totalWeight++;
                }
            }
        }

        // 3. 检查技能名称精确匹配
        String[] queryTokens = lowerQuery.split("[\\s,，、。.!！?？]+");
        for (String token : queryTokens) {
            token = token.trim();
            if (token.length() < 2) continue;

            if (sv.name.toLowerCase().contains(token)) {
                score += 0.25;
                matchedCount++;
                totalWeight++;
            } else if (sv.description.toLowerCase().contains(token)) {
                score += 0.1;
                matchedCount++;
                totalWeight++;
            }
        }

        // 4. 检查技能类型映射匹配（技能名称前缀匹配）
        for (java.util.Map.Entry<String, java.util.Set<String>> entry : SKILL_TYPE_MAP.entrySet()) {
            String fileType = entry.getKey();
            java.util.Set<String> skillNames = entry.getValue();

            boolean queryHasType = lowerQuery.contains(fileType);
            for (String alias : FILE_TYPE_KEYWORDS.getOrDefault(fileType, java.util.Collections.emptySet())) {
                if (lowerQuery.contains(alias)) {
                    queryHasType = true;
                    break;
                }
            }

            if (queryHasType) {
                if (skillNames.contains(sv.name)) {
                    score += 0.3;
                    matchedCount++;
                    totalWeight++;
                }
            }
        }

        // 归一化分数到 0-1 范围
        if (totalWeight > 0) {
            score = score / (0.5 + totalWeight * 0.3);
        }

        return Math.min(score, 1.0);
    }

    /**
     * 构建 embedding 文本：name + description。
     * 不包含 configuration JSON（太长且干扰语义）。
     */
    private String buildEmbeddingText(Skill skill) {
        StringBuilder sb = new StringBuilder();
        if (skill.getName() != null && !skill.getName().isEmpty()) {
            sb.append(skill.getName());
        }
        if (skill.getDescription() != null && !skill.getDescription().isEmpty()) {
            if (sb.length() > 0) sb.append("：");
            sb.append(skill.getDescription());
        }
        return sb.toString();
    }
}
