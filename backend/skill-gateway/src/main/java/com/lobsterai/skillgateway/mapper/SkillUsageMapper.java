package com.lobsterai.skillgateway.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lobsterai.skillgateway.dto.SkillUsageOverviewDTO;
import com.lobsterai.skillgateway.entity.ToolCallLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface SkillUsageMapper extends BaseMapper<ToolCallLog> {

    @Select({"<script>",
            "SELECT t.tool_name AS toolName,",
            "       t.skill_name AS skillName,",
            "       COUNT(*) AS totalCalls,",
            "       SUM(CASE WHEN t.status = 'completed' AND t.response_result NOT LIKE 'Error%' AND t.response_result NOT LIKE '{%\"error\":%' THEN 1 ELSE 0 END) AS successCalls,",
            "       SUM(CASE WHEN t.status = 'failed' OR t.response_result LIKE 'Error%' OR (t.status = 'completed' AND t.response_result LIKE '{%\"error\":%') THEN 1 ELSE 0 END) AS failCalls,",
            "       COUNT(DISTINCT t.user_id) AS uniqueUsers,",
            // sql_mode=only_full_group_by 下，s.created_by / u.nickname 不在 GROUP BY 里会报错。
            // 用 ANY_VALUE() 显式声明：取任意值（一个 tool+skill 组合理论上只会对应一个 skill + 创建者）。
            "       COALESCE(ANY_VALUE(s.created_by), '') AS createdBy,",
            "       COALESCE(ANY_VALUE(u.nickname), '') AS createdByName,",
            "       MIN(t.start_time) AS firstCallTime,",
            "       MAX(t.start_time) AS lastCallTime,",
            "       COALESCE(ROUND(AVG(t.duration_ms)), 0) AS avgDurationMs",
            "FROM tool_call_logs t",
            // 显式 COLLATE：tool_call_logs.skill_name (utf8mb4_unicode_ci) vs skills.name (utf8mb4_0900_ai_ci)
            // 排序规则不一致会导致 Illegal mix of collations 报错。统一用 utf8mb4_unicode_ci 兼容历史数据。
            "LEFT JOIN skills s ON s.name COLLATE utf8mb4_unicode_ci = t.skill_name AND s.skill_owner_type = 1",
            "LEFT JOIN users u ON u.id = s.created_by",
            "WHERE 1 = 1",
            "<if test='startDate != null and startDate != \"\"'>",
            "  AND t.start_time &gt;= #{startDate}",
            "</if>",
            "<if test='endDate != null and endDate != \"\"'>",
            "  AND t.start_time &lt;= CONCAT(#{endDate}, ' 23:59:59')",
            "</if>",
            "<if test='keyword != null and keyword != \"\"'>",
            "  AND t.skill_name LIKE CONCAT('%', #{keyword}, '%')",
            "</if>",
            "GROUP BY t.tool_name, t.skill_name",
            "ORDER BY totalCalls DESC",
            "</script>"})
    List<SkillUsageOverviewDTO> getOverview(
            @Param("startDate") String startDate,
            @Param("endDate") String endDate,
            @Param("keyword") String keyword);

    @Select({"<script>",
            "SELECT t.*, COALESCE(u.nickname, '') AS userName",
            "FROM tool_call_logs t",
            "LEFT JOIN users u ON u.id = t.user_id",
            "WHERE t.skill_name = #{skillName}",
            "<if test='startDate != null and startDate != \"\"'>",
            "  AND t.start_time &gt;= #{startDate}",
            "</if>",
            "<if test='endDate != null and endDate != \"\"'>",
            "  AND t.start_time &lt;= CONCAT(#{endDate}, ' 23:59:59')",
            "</if>",
            "ORDER BY t.start_time DESC",
            "</script>"})
    List<ToolCallLog> getDetails(
            @Param("skillName") String skillName,
            @Param("startDate") String startDate,
            @Param("endDate") String endDate);
}
