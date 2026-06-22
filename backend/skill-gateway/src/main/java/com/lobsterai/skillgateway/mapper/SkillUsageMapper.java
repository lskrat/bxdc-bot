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
            "       COALESCE(s.created_by, '') AS createdBy,",
            "       MIN(t.start_time) AS firstCallTime,",
            "       MAX(t.start_time) AS lastCallTime,",
            "       COALESCE(ROUND(AVG(t.duration_ms)), 0) AS avgDurationMs",
            "FROM tool_call_logs t",
            "LEFT JOIN skills s ON s.name = t.skill_name AND s.skill_owner_type = 1",
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
            "SELECT * FROM tool_call_logs",
            "WHERE skill_name = #{skillName}",
            "<if test='startDate != null and startDate != \"\"'>",
            "  AND start_time &gt;= #{startDate}",
            "</if>",
            "<if test='endDate != null and endDate != \"\"'>",
            "  AND start_time &lt;= CONCAT(#{endDate}, ' 23:59:59')",
            "</if>",
            "ORDER BY start_time DESC",
            "</script>"})
    List<ToolCallLog> getDetails(
            @Param("skillName") String skillName,
            @Param("startDate") String startDate,
            @Param("endDate") String endDate);
}
