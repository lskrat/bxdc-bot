package com.lobsterai.skillgateway.dto;

import java.util.List;

/**
 * 技能向量检索响应。
 */
public class SkillMatchResponse {
    /** 匹配的技能 ID 列表（按分数降序） */
    private List<MatchItem> matches;
    /** 匹配总数（before limit） */
    private int total;
    /** 检索文本 */
    private String query;

    public static class MatchItem {
        private long skillId;
        private String name;
        private String description;
        private String type;
        private String executionMode;
        private boolean requiresConfirmation;
        private String avatar;
        /** 最终分数 = 语义相似度 × search_weight */
        private double score;

        public long getSkillId() { return skillId; }
        public void setSkillId(long skillId) { this.skillId = skillId; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public String getExecutionMode() { return executionMode; }
        public void setExecutionMode(String executionMode) { this.executionMode = executionMode; }
        public boolean isRequiresConfirmation() { return requiresConfirmation; }
        public void setRequiresConfirmation(boolean requiresConfirmation) { this.requiresConfirmation = requiresConfirmation; }
        public String getAvatar() { return avatar; }
        public void setAvatar(String avatar) { this.avatar = avatar; }
        public double getScore() { return score; }
        public void setScore(double score) { this.score = score; }
    }

    public List<MatchItem> getMatches() { return matches; }
    public void setMatches(List<MatchItem> matches) { this.matches = matches; }
    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }
    public String getQuery() { return query; }
    public void setQuery(String query) { this.query = query; }
}
