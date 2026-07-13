package com.lobsterai.skillgateway.dto;

import java.util.List;

/**
 * open spec: add-conversation-token-usage-tab
 * 会话详情聚合 DTO：含每轮调用 + totals。
 */
public class TokenUsageSessionDetailDTO {

    private String sessionId;
    private String conversationName;
    private List<TokenUsageCallDetailDTO> calls;
    private TokenUsageOverviewDTO totals;
    private List<String> uniqueSkillNames;

    public TokenUsageSessionDetailDTO() {
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getConversationName() {
        return conversationName;
    }

    public void setConversationName(String conversationName) {
        this.conversationName = conversationName;
    }

    public List<TokenUsageCallDetailDTO> getCalls() {
        return calls;
    }

    public void setCalls(List<TokenUsageCallDetailDTO> calls) {
        this.calls = calls;
    }

    public TokenUsageOverviewDTO getTotals() {
        return totals;
    }

    public void setTotals(TokenUsageOverviewDTO totals) {
        this.totals = totals;
    }

    public List<String> getUniqueSkillNames() {
        return uniqueSkillNames;
    }

    public void setUniqueSkillNames(List<String> uniqueSkillNames) {
        this.uniqueSkillNames = uniqueSkillNames;
    }
}