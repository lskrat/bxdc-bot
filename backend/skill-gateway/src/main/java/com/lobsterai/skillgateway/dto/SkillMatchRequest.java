package com.lobsterai.skillgateway.dto;

import java.util.List;

/**
 * 技能向量检索请求。
 */
public class SkillMatchRequest {
    /** 检索文本（LLM 提炼的任务关键词/描述） */
    private String query;
    /** 返回数量上限（默认 8） */
    private int limit = 8;

    public String getQuery() {
        return query;
    }

    public void setQuery(String query) {
        this.query = query;
    }

    public int getLimit() {
        return limit > 0 ? limit : 8;
    }

    public void setLimit(int limit) {
        this.limit = limit;
    }
}
