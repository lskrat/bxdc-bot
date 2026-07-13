package com.lobsterai.skillgateway.dto;

import java.util.Collections;
import java.util.List;

/**
 * 技能向量检索请求。
 */
public class SkillMatchRequest {
    /** 检索文本（LLM 提炼的任务关键词/描述） */
    private String query;
    /** 返回数量上限（默认 8） */
    private int limit = 8;
    /**
     * add-skill-tags-and-intent-filtering：1-3 个标签，agent-core 意图识别结果。
     * 可选——不传 = tags = null，走 e2ac8ce 原路径。
     */
    private List<String> tags;
    /** 需要排除的技能名称列表（如 file_list/file_read/file_write），不占用向量检索的 top-K 槽位 */
    private List<String> excludeNames;

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

    /**
     * 标签列表（向后兼容：null = 用不上 = 走 e2ac8ce 原路径）。
     * 空集合也按 null 处理，避免 IN () SQL 语法错误。
     */
    public List<String> getTags() {
        if (tags == null || tags.isEmpty()) {
            return null;
        }
        return Collections.unmodifiableList(tags);
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }

    public List<String> getExcludeNames() {
        return excludeNames;
    }

    public void setExcludeNames(List<String> excludeNames) {
        this.excludeNames = excludeNames;
    }
}
