package com.lobsterai.skillgateway.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.lobsterai.skillgateway.entity.ToolCallLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface ToolCallLogMapper extends BaseMapper<ToolCallLog> {

    // open spec: add-conversation-token-usage-tab
    // 按 traceId 集合拉取每个 round 调用过的 skill 名称（去重）
    @Select({"<script>",
            "SELECT trace_id AS traceId, skill_name AS skillName",
            "FROM tool_call_logs",
            "WHERE session_id = #{sessionId}",
            "  AND skill_name IS NOT NULL AND skill_name &lt;&gt; ''",
            "<if test='traceIds != null and traceIds.size() &gt; 0'>",
            "  AND trace_id IN",
            "  <foreach collection='traceIds' item='tid' open='(' separator=',' close=')'>",
            "    #{tid}",
            "  </foreach>",
            "</if>",
            "GROUP BY trace_id, skill_name",
            "</script>"})
    List<ToolCallSkillNameRow> findDistinctSkillNamesBySessionAndTraceIds(
            @Param("sessionId") String sessionId,
            @Param("traceIds") List<String> traceIds);

    /** 投影类：trace_id + skill_name（去重） */
    class ToolCallSkillNameRow {
        private String traceId;
        private String skillName;

        public String getTraceId() { return traceId; }
        public void setTraceId(String traceId) { this.traceId = traceId; }
        public String getSkillName() { return skillName; }
        public void setSkillName(String skillName) { this.skillName = skillName; }
    }
}