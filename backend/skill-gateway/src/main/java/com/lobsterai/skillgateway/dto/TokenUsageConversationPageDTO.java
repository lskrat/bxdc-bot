package com.lobsterai.skillgateway.dto;

import java.util.List;

/**
 * open spec: add-conversation-token-usage-tab
 * 会话列表分页响应（overview + 会话列表 + 分页元数据）。
 */
public class TokenUsageConversationPageDTO {

    private TokenUsageOverviewDTO overview;
    private List<TokenUsageConversationSummaryDTO> conversations;
    private Long total;
    private Integer page;
    private Integer size;

    public TokenUsageConversationPageDTO() {
    }

    public TokenUsageOverviewDTO getOverview() {
        return overview;
    }

    public void setOverview(TokenUsageOverviewDTO overview) {
        this.overview = overview;
    }

    public List<TokenUsageConversationSummaryDTO> getConversations() {
        return conversations;
    }

    public void setConversations(List<TokenUsageConversationSummaryDTO> conversations) {
        this.conversations = conversations;
    }

    public Long getTotal() {
        return total;
    }

    public void setTotal(Long total) {
        this.total = total;
    }

    public Integer getPage() {
        return page;
    }

    public void setPage(Integer page) {
        this.page = page;
    }

    public Integer getSize() {
        return size;
    }

    public void setSize(Integer size) {
        this.size = size;
    }
}