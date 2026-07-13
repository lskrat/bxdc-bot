package com.lobsterai.skillgateway.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lobsterai.skillgateway.dto.TokenUsageCallDetailDTO;
import com.lobsterai.skillgateway.dto.TokenUsageConversationSummaryDTO;
import com.lobsterai.skillgateway.dto.TokenUsageDailyPointDTO;
import com.lobsterai.skillgateway.dto.TokenUsageOverviewDTO;
import com.lobsterai.skillgateway.entity.ConversationLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * open spec: add-conversation-token-usage-tab
 *
 * Token 统计逻辑（基于 agent-core 写入的原始 LLM 流量）：
 * <ul>
 *   <li>prompt（送给大模型的所有内容）= CHAR_LENGTH(request_data)
 *     <br>request_data 结构（新格式）：{modelName, params:{options:{tools:[{type,function:{name,description,parameters}}, ...]}}, messages:[...], context:{...}}
 *     <br>request_data 结构（旧格式）：{instruction, context:{...}, history:[...]}
 *     <br>无论新旧格式，CHAR_LENGTH(request_data) 都等于"实际送给大模型的全部字符"
 *     <br>open spec: fix-llm-request-full-payload — agent-core 从 2026-07-10 起改用新格式（含完整 tools）</li>
 *   <li>completion（大模型的返回）= CHAR_LENGTH(response_data.response)
 *     <br>response_data 结构：{response: "<assistant 完整文本>"}</li>
 *   <li>total = prompt + completion</li>
 * </ul>
 *
 * 用法：每条 conversation_log 同时存了 request_data + response_data + conversation_content。
 * 我们直接用 SQL 算 CHAR_LENGTH，不解析 JSON 内部结构，避开 GROUP_CONCAT 长度限制。
 *
 * 若 request_data / response_data 为 NULL（旧数据）→ 该字段贡献 0，total 仅来自 conversation_content。
 */
@Mapper
public interface ConversationLogMapper extends BaseMapper<ConversationLog> {

    /** prompt 字符数 = 完整 request body 的字符数（含 modelName + tools + messages + context） */
    String PROMPT_CHARS =
            "COALESCE(CHAR_LENGTH(cl.request_data), 0)";

    /** completion 字符数 = response_data.response 字符串的字符数（LLM 返回的纯文本） */
    String COMPLETION_CHARS =
            "COALESCE(CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(cl.response_data, '$.response'))), 0)";

    /** total 字符数 = request + response */
    String TOTAL_CHARS =
            "(" + PROMPT_CHARS + " + " + COMPLETION_CHARS + ")";

    /**
     * 估算 token 数：1 token ≈ 2 字符（中文 1 字 ≈ 1 token，英文 4 字符 ≈ 1 token 的平均值）。
     * 仅供参考，最多 ±3x 误差（取决于中英文比例）。不引入 BPE 库，纯 SQL 算。
     */
    String ESTIMATED_TOKENS =
            "CAST(CEIL((" + PROMPT_CHARS + " + " + COMPLETION_CHARS + ") / 2.0) AS UNSIGNED)";

    String PROMPT_ESTIMATED_TOKENS =
            "CAST(CEIL(" + PROMPT_CHARS + " / 2.0) AS UNSIGNED)";

    String COMPLETION_ESTIMATED_TOKENS =
            "CAST(CEIL(" + COMPLETION_CHARS + " / 2.0) AS UNSIGNED)";

    /**
     * 多轮消息条数：兼容两种格式
     * - 新格式：JSON_LENGTH(request_data, '$.messages')
     * - 旧格式：JSON_LENGTH(request_data, '$.history')
     * 用 GREATEST 取较大值（实际只会命中其中一个，另一个为 NULL → 0）。
     */
    String MESSAGE_COUNT =
            "GREATEST(IFNULL(JSON_LENGTH(cl.request_data, '$.messages'), 0), IFNULL(JSON_LENGTH(cl.request_data, '$.history'), 0))";

    // open spec: add-conversation-token-usage-tab — 会话列表
    @Select({"<script>",
            "SELECT",
            "    cl.session_id AS sessionId,",
            "    COALESCE(c.name, '') AS conversationName,",
            "    cl.user_id AS userId,",
            "    MIN(cl.created_at) AS startedAt,",
            "    MAX(cl.updated_at) AS endedAt,",
            "    COALESCE(SUM(" + PROMPT_CHARS + "), 0) AS totalPromptTokens,",
            "    COALESCE(SUM(" + COMPLETION_CHARS + "), 0) AS totalCompletionTokens,",
            "    COALESCE(SUM(" + TOTAL_CHARS + "), 0) AS totalTokens,",
            "    COALESCE(SUM(" + PROMPT_ESTIMATED_TOKENS + "), 0) AS totalPromptEstimatedTokens,",
            "    COALESCE(SUM(" + COMPLETION_ESTIMATED_TOKENS + "), 0) AS totalCompletionEstimatedTokens,",
            "    COALESCE(SUM(" + ESTIMATED_TOKENS + "), 0) AS totalEstimatedTokens,",
            "    COALESCE(SUM(cl.llm_rounds), 0) AS totalRounds,",
            "    COALESCE(SUM(cl.tool_call_rounds), 0) AS totalToolRounds,",
            "    COALESCE(SUM(" + MESSAGE_COUNT + "), 0) AS totalMessageCount,",
            "    COUNT(DISTINCT CASE WHEN cl.skill_name IS NOT NULL AND cl.skill_name &lt;&gt; '' THEN cl.skill_name END) AS uniqueSkillsCount,",
            "    SUM(CASE WHEN cl.is_success = 0 THEN 1 ELSE 0 END) AS failedCalls,",
            "    CASE WHEN SUM(CASE WHEN cl.is_success = 0 THEN 1 ELSE 0 END) &gt; 0 THEN 'FAILED' ELSE 'SUCCESS' END AS status",
            "FROM conversation_logs cl",
            "LEFT JOIN conversations c ON c.conversation_id = cl.session_id COLLATE utf8mb4_unicode_ci",
            "WHERE cl.user_id = #{userId}",
            "<if test='startDate != null and startDate != \"\"'>",
            "  AND cl.updated_at &gt;= CONCAT(#{startDate}, ' 00:00:00')",
            "</if>",
            "<if test='endDate != null and endDate != \"\"'>",
            "  AND cl.updated_at &lt; DATE_ADD(CONCAT(#{endDate}, ' 00:00:00'), INTERVAL 1 DAY)",
            "</if>",
            "<if test='keyword != null and keyword != \"\"'>",
            "  AND COALESCE(c.name, '') LIKE CONCAT('%', #{keyword}, '%')",
            "</if>",
            "GROUP BY cl.session_id, c.name, cl.user_id",
            "HAVING COUNT(*) &gt; 0",
            "ORDER BY MAX(cl.updated_at) DESC",
            "LIMIT #{size} OFFSET #{offset}",
            "</script>"})
    List<TokenUsageConversationSummaryDTO> findSummariesByUserId(
            @Param("userId") String userId,
            @Param("startDate") String startDate,
            @Param("endDate") String endDate,
            @Param("keyword") String keyword,
            @Param("offset") int offset,
            @Param("size") int size);

    // open spec: add-conversation-token-usage-tab — 列表总数
    @Select({"<script>",
            "SELECT COUNT(*) FROM (",
            "    SELECT cl.session_id",
            "    FROM conversation_logs cl",
            "    LEFT JOIN conversations c ON c.conversation_id = cl.session_id COLLATE utf8mb4_unicode_ci",
            "    WHERE cl.user_id = #{userId}",
            "<if test='startDate != null and startDate != \"\"'>",
            "      AND cl.updated_at &gt;= CONCAT(#{startDate}, ' 00:00:00')",
            "</if>",
            "<if test='endDate != null and endDate != \"\"'>",
            "      AND cl.updated_at &lt; DATE_ADD(CONCAT(#{endDate}, ' 00:00:00'), INTERVAL 1 DAY)",
            "</if>",
            "<if test='keyword != null and keyword != \"\"'>",
            "      AND COALESCE(c.name, '') LIKE CONCAT('%', #{keyword}, '%')",
            "</if>",
            "    GROUP BY cl.session_id",
            "    HAVING COUNT(*) &gt; 0",
            ") t",
            "</script>"})
    Long countSummariesByUserId(
            @Param("userId") String userId,
            @Param("startDate") String startDate,
            @Param("endDate") String endDate,
            @Param("keyword") String keyword);

    // open spec: add-conversation-token-usage-tab — 概览
    @Select({"<script>",
            "SELECT",
            "    COALESCE(SUM(" + PROMPT_CHARS + "), 0) AS totalPromptTokens,",
            "    COALESCE(SUM(" + COMPLETION_CHARS + "), 0) AS totalCompletionTokens,",
            "    COALESCE(SUM(" + TOTAL_CHARS + "), 0) AS totalTokens,",
            "    COALESCE(SUM(" + PROMPT_ESTIMATED_TOKENS + "), 0) AS totalPromptEstimatedTokens,",
            "    COALESCE(SUM(" + COMPLETION_ESTIMATED_TOKENS + "), 0) AS totalCompletionEstimatedTokens,",
            "    COALESCE(SUM(" + ESTIMATED_TOKENS + "), 0) AS totalEstimatedTokens,",
            "    COALESCE(SUM(" + MESSAGE_COUNT + "), 0) AS totalMessageCount,",
            "    COUNT(*) AS totalCalls,",
            "    (SELECT COUNT(*) FROM (",
            "        SELECT 1 FROM conversation_logs",
            "        WHERE user_id = #{userId}",
            "        <if test='startDate != null and startDate != \"\"'>",
            "          AND updated_at &gt;= CONCAT(#{startDate}, ' 00:00:00')",
            "</if>",
            "        <if test='endDate != null and endDate != \"\"'>",
            "          AND updated_at &lt; DATE_ADD(CONCAT(#{endDate}, ' 00:00:00'), INTERVAL 1 DAY)",
            "</if>",
            "        GROUP BY session_id HAVING COUNT(*) &gt; 0",
            "    ) s) AS totalSessions,",
            "    SUM(CASE WHEN cl.is_success = 0 THEN 1 ELSE 0 END) AS failedCalls",
            "FROM conversation_logs cl",
            "WHERE cl.user_id = #{userId}",
            "<if test='startDate != null and startDate != \"\"'>",
            "  AND cl.updated_at &gt;= CONCAT(#{startDate}, ' 00:00:00')",
            "</if>",
            "<if test='endDate != null and endDate != \"\"'>",
            "  AND cl.updated_at &lt; DATE_ADD(CONCAT(#{endDate}, ' 00:00:00'), INTERVAL 1 DAY)",
            "</if>",
            "</script>"})
    TokenUsageOverviewDTO getOverviewByUserId(
            @Param("userId") String userId,
            @Param("startDate") String startDate,
            @Param("endDate") String endDate);

    // open spec: add-conversation-token-usage-tab — 会话详情（每轮 LLM 调用）
    @Select({"<script>",
            "SELECT",
            "    cl.trace_id AS traceId,",
            "    cl.session_id AS sessionId,",
            "    cl.created_at AS calledAt,",
            "    cl.llm_model AS llmModel,",
            "    " + PROMPT_CHARS + " AS promptTokens,",
            "    " + COMPLETION_CHARS + " AS completionTokens,",
            "    " + TOTAL_CHARS + " AS totalTokens,",
            "    " + PROMPT_ESTIMATED_TOKENS + " AS promptEstimatedTokens,",
            "    " + COMPLETION_ESTIMATED_TOKENS + " AS completionEstimatedTokens,",
            "    " + ESTIMATED_TOKENS + " AS estimatedTokens,",
            "    " + MESSAGE_COUNT + " AS messageCount,",
            "    cl.llm_rounds AS roundIndex,",
            "    cl.response_duration_seconds AS durationSeconds,",
            "    cl.tool_call_rounds AS toolCallRounds,",
            "    cl.is_success AS isSuccess,",
            "    CASE WHEN cl.is_success = 0 THEN 'FAILED' ELSE 'SUCCESS' END AS status,",
            "    cl.finish_reason AS finishReason,",
            "    cl.error_message AS errorMessage",
            "FROM conversation_logs cl",
            "WHERE cl.user_id = #{userId} AND cl.session_id = #{sessionId}",
            "ORDER BY cl.created_at DESC",
            "LIMIT 1000",
            "</script>"})
    List<TokenUsageCallDetailDTO> findCallDetailsBySessionIdDesc(
            @Param("userId") String userId,
            @Param("sessionId") String sessionId);

    // open spec: add-conversation-token-usage-tab — 按天聚合
    @Select({"<script>",
            "SELECT",
            "    DATE(cl.created_at) AS date,",
            "    COALESCE(SUM(" + PROMPT_CHARS + "), 0) AS promptTokens,",
            "    COALESCE(SUM(" + COMPLETION_CHARS + "), 0) AS completionTokens,",
            "    COALESCE(SUM(" + TOTAL_CHARS + "), 0) AS totalTokens,",
            "    COALESCE(SUM(" + PROMPT_ESTIMATED_TOKENS + "), 0) AS promptEstimatedTokens,",
            "    COALESCE(SUM(" + COMPLETION_ESTIMATED_TOKENS + "), 0) AS completionEstimatedTokens,",
            "    COALESCE(SUM(" + ESTIMATED_TOKENS + "), 0) AS estimatedTokens,",
            "    COALESCE(SUM(" + MESSAGE_COUNT + "), 0) AS messageCount,",
            "    COUNT(*) AS callCount,",
            "    SUM(CASE WHEN cl.is_success = 0 THEN 1 ELSE 0 END) AS failedCount",
            "FROM conversation_logs cl",
            "WHERE cl.user_id = #{userId}",
            "<if test='startDate != null and startDate != \"\"'>",
            "  AND cl.created_at &gt;= CONCAT(#{startDate}, ' 00:00:00')",
            "</if>",
            "<if test='endDate != null and endDate != \"\"'>",
            "  AND cl.created_at &lt; DATE_ADD(CONCAT(#{endDate}, ' 00:00:00'), INTERVAL 1 DAY)",
            "</if>",
            "GROUP BY DATE(cl.created_at)",
            "ORDER BY DATE(cl.created_at) ASC",
            "</script>"})
    List<TokenUsageDailyPointDTO> findDailyByUserId(
            @Param("userId") String userId,
            @Param("startDate") String startDate,
            @Param("endDate") String endDate);

    @Select("SELECT COALESCE(name, '') FROM conversations WHERE conversation_id = #{sessionId}")
    String findConversationNameById(@Param("sessionId") String sessionId);
}
