package com.lobsterai.skillgateway.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDateTime;

/**
 * open spec: add-conversation-token-usage-tab
 * 会话级 token 用量聚合 DTO（列表 Tab 的一行）。
 */
public class TokenUsageConversationSummaryDTO {

    private String sessionId;
    private String conversationName;
    private String userId;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private LocalDateTime startedAt;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private LocalDateTime endedAt;

    private Long totalPromptTokens;
    private Long totalCompletionTokens;
    private Long totalTokens;
    private Long totalPromptEstimatedTokens;
    private Long totalCompletionEstimatedTokens;
    private Long totalEstimatedTokens;
    private Long totalRounds;
    private Long totalToolRounds;
    private Long totalMessageCount;
    private Long uniqueSkillsCount;
    private Long failedCalls;

    /** SUCCESS 或 FAILED（任一 round 失败 → FAILED） */
    private String status;

    public TokenUsageConversationSummaryDTO() {
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

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public LocalDateTime getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(LocalDateTime startedAt) {
        this.startedAt = startedAt;
    }

    public LocalDateTime getEndedAt() {
        return endedAt;
    }

    public void setEndedAt(LocalDateTime endedAt) {
        this.endedAt = endedAt;
    }

    public Long getTotalPromptTokens() {
        return totalPromptTokens;
    }

    public void setTotalPromptTokens(Long totalPromptTokens) {
        this.totalPromptTokens = totalPromptTokens;
    }

    public Long getTotalCompletionTokens() {
        return totalCompletionTokens;
    }

    public void setTotalCompletionTokens(Long totalCompletionTokens) {
        this.totalCompletionTokens = totalCompletionTokens;
    }

    public Long getTotalTokens() {
        return totalTokens;
    }

    public void setTotalTokens(Long totalTokens) {
        this.totalTokens = totalTokens;
    }

    public Long getTotalPromptEstimatedTokens() {
        return totalPromptEstimatedTokens;
    }

    public void setTotalPromptEstimatedTokens(Long totalPromptEstimatedTokens) {
        this.totalPromptEstimatedTokens = totalPromptEstimatedTokens;
    }

    public Long getTotalCompletionEstimatedTokens() {
        return totalCompletionEstimatedTokens;
    }

    public void setTotalCompletionEstimatedTokens(Long totalCompletionEstimatedTokens) {
        this.totalCompletionEstimatedTokens = totalCompletionEstimatedTokens;
    }

    public Long getTotalEstimatedTokens() {
        return totalEstimatedTokens;
    }

    public void setTotalEstimatedTokens(Long totalEstimatedTokens) {
        this.totalEstimatedTokens = totalEstimatedTokens;
    }

    public Long getTotalRounds() {
        return totalRounds;
    }

    public void setTotalRounds(Long totalRounds) {
        this.totalRounds = totalRounds;
    }

    public Long getTotalToolRounds() {
        return totalToolRounds;
    }

    public void setTotalToolRounds(Long totalToolRounds) {
        this.totalToolRounds = totalToolRounds;
    }

    public Long getTotalMessageCount() {
        return totalMessageCount;
    }

    public void setTotalMessageCount(Long totalMessageCount) {
        this.totalMessageCount = totalMessageCount;
    }

    public Long getUniqueSkillsCount() {
        return uniqueSkillsCount;
    }

    public void setUniqueSkillsCount(Long uniqueSkillsCount) {
        this.uniqueSkillsCount = uniqueSkillsCount;
    }

    public Long getFailedCalls() {
        return failedCalls;
    }

    public void setFailedCalls(Long failedCalls) {
        this.failedCalls = failedCalls;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}