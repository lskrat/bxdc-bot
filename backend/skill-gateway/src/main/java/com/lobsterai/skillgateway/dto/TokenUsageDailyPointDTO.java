package com.lobsterai.skillgateway.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDate;

/**
 * open spec: add-conversation-token-usage-tab
 * 按天聚合的一个数据点（柱状图 X 轴一行）。
 */
public class TokenUsageDailyPointDTO {

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate date;

    private Long totalTokens;
    private Long promptTokens;
    private Long completionTokens;
    private Long estimatedTokens;
    private Long promptEstimatedTokens;
    private Long completionEstimatedTokens;
    /** 该日累计多轮消息条数（history.length 求和） */
    private Long messageCount;

    /** 该日 LLM 调用总次数（含失败） */
    private Integer callCount;

    /** 该日失败 LLM 调用次数 */
    private Integer failedCount;

    public TokenUsageDailyPointDTO() {
    }

    public TokenUsageDailyPointDTO(LocalDate date, Long totalTokens, Long promptTokens,
                                   Long completionTokens, Integer callCount, Integer failedCount) {
        this.date = date;
        this.totalTokens = totalTokens;
        this.promptTokens = promptTokens;
        this.completionTokens = completionTokens;
        this.callCount = callCount;
        this.failedCount = failedCount;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public Long getTotalTokens() {
        return totalTokens;
    }

    public void setTotalTokens(Long totalTokens) {
        this.totalTokens = totalTokens;
    }

    public Long getPromptTokens() {
        return promptTokens;
    }

    public void setPromptTokens(Long promptTokens) {
        this.promptTokens = promptTokens;
    }

    public Long getCompletionTokens() {
        return completionTokens;
    }

    public void setCompletionTokens(Long completionTokens) {
        this.completionTokens = completionTokens;
    }

    public Long getEstimatedTokens() {
        return estimatedTokens;
    }

    public void setEstimatedTokens(Long estimatedTokens) {
        this.estimatedTokens = estimatedTokens;
    }

    public Long getPromptEstimatedTokens() {
        return promptEstimatedTokens;
    }

    public void setPromptEstimatedTokens(Long promptEstimatedTokens) {
        this.promptEstimatedTokens = promptEstimatedTokens;
    }

    public Long getCompletionEstimatedTokens() {
        return completionEstimatedTokens;
    }

    public void setCompletionEstimatedTokens(Long completionEstimatedTokens) {
        this.completionEstimatedTokens = completionEstimatedTokens;
    }

    public Long getMessageCount() {
        return messageCount;
    }

    public void setMessageCount(Long messageCount) {
        this.messageCount = messageCount;
    }

    public Integer getCallCount() {
        return callCount;
    }

    public void setCallCount(Integer callCount) {
        this.callCount = callCount;
    }

    public Integer getFailedCount() {
        return failedCount;
    }

    public void setFailedCount(Integer failedCount) {
        this.failedCount = failedCount;
    }
}