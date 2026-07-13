package com.lobsterai.skillgateway.dto;

/**
 * open spec: add-conversation-token-usage-tab
 * Token 用量总览统计 DTO（顶部 5 张卡片 + 概览对象）。
 */
public class TokenUsageOverviewDTO {

    /** 累计 prompt tokens（成功 round 的 sum） */
    private Long totalPromptTokens;

    /** 累计 completion tokens（成功 round 的 sum） */
    private Long totalCompletionTokens;

    /** 累计 total tokens */
    private Long totalTokens;

    /**
     * 估算 token 数（prompt / completion / total）。
     * 公式：CEIL(chars / 2)，1 token ≈ 2 字符。仅供参考，误差 ±3x。
     * open spec: add-conversation-token-usage-tab — 不引入 BPE 库，纯 SQL 算。
     */
    private Long totalPromptEstimatedTokens;
    private Long totalCompletionEstimatedTokens;
    private Long totalEstimatedTokens;

    /** 累计 LLM 调用次数（含失败） */
    private Long totalCalls;

    /** 累计会话数（有 LLM 调用的会话） */
    private Long totalSessions;

    /** 累计失败 LLM 调用次数（is_success = 0） */
    private Long failedCalls;

    /** 累计多轮对话消息条数（history.length 总和） */
    private Long totalMessageCount;

    public TokenUsageOverviewDTO() {
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

    public Long getTotalCalls() {
        return totalCalls;
    }

    public void setTotalCalls(Long totalCalls) {
        this.totalCalls = totalCalls;
    }

    public Long getTotalSessions() {
        return totalSessions;
    }

    public void setTotalSessions(Long totalSessions) {
        this.totalSessions = totalSessions;
    }

    public Long getFailedCalls() {
        return failedCalls;
    }

    public void setFailedCalls(Long failedCalls) {
        this.failedCalls = failedCalls;
    }

    public Long getTotalMessageCount() {
        return totalMessageCount;
    }

    public void setTotalMessageCount(Long totalMessageCount) {
        this.totalMessageCount = totalMessageCount;
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
}