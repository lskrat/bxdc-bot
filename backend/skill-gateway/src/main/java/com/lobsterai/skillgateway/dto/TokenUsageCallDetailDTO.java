package com.lobsterai.skillgateway.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDateTime;
import java.util.List;

/**
 * open spec: add-conversation-token-usage-tab
 * 单轮 LLM 调用明细 DTO（详情 Tab 的一行）。
 */
public class TokenUsageCallDetailDTO {

    private String traceId;
    private String sessionId;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private LocalDateTime calledAt;

    private String llmModel;
    private Integer promptTokens;
    private Integer completionTokens;
    private Integer totalTokens;
    private Integer promptEstimatedTokens;
    private Integer completionEstimatedTokens;
    private Integer estimatedTokens;
    /** 该 round 送给大模型的多轮消息条数（history.length） */
    private Integer messageCount;
    private Integer roundIndex;
    private Double durationSeconds;

    /** 该 round 调用的 skill 名称列表（去重） */
    private List<String> skillNames;

    private Integer toolCallRounds;
    private Boolean isSuccess;
    private String status;
    private String finishReason;
    private String errorMessage;

    public TokenUsageCallDetailDTO() {
    }

    public String getTraceId() {
        return traceId;
    }

    public void setTraceId(String traceId) {
        this.traceId = traceId;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public LocalDateTime getCalledAt() {
        return calledAt;
    }

    public void setCalledAt(LocalDateTime calledAt) {
        this.calledAt = calledAt;
    }

    public String getLlmModel() {
        return llmModel;
    }

    public void setLlmModel(String llmModel) {
        this.llmModel = llmModel;
    }

    public Integer getPromptTokens() {
        return promptTokens;
    }

    public void setPromptTokens(Integer promptTokens) {
        this.promptTokens = promptTokens;
    }

    public Integer getCompletionTokens() {
        return completionTokens;
    }

    public void setCompletionTokens(Integer completionTokens) {
        this.completionTokens = completionTokens;
    }

    public Integer getTotalTokens() {
        return totalTokens;
    }

    public void setTotalTokens(Integer totalTokens) {
        this.totalTokens = totalTokens;
    }

    public Integer getPromptEstimatedTokens() {
        return promptEstimatedTokens;
    }

    public void setPromptEstimatedTokens(Integer promptEstimatedTokens) {
        this.promptEstimatedTokens = promptEstimatedTokens;
    }

    public Integer getCompletionEstimatedTokens() {
        return completionEstimatedTokens;
    }

    public void setCompletionEstimatedTokens(Integer completionEstimatedTokens) {
        this.completionEstimatedTokens = completionEstimatedTokens;
    }

    public Integer getEstimatedTokens() {
        return estimatedTokens;
    }

    public void setEstimatedTokens(Integer estimatedTokens) {
        this.estimatedTokens = estimatedTokens;
    }

    public Integer getMessageCount() {
        return messageCount;
    }

    public void setMessageCount(Integer messageCount) {
        this.messageCount = messageCount;
    }

    public Integer getRoundIndex() {
        return roundIndex;
    }

    public void setRoundIndex(Integer roundIndex) {
        this.roundIndex = roundIndex;
    }

    public Double getDurationSeconds() {
        return durationSeconds;
    }

    public void setDurationSeconds(Double durationSeconds) {
        this.durationSeconds = durationSeconds;
    }

    public List<String> getSkillNames() {
        return skillNames;
    }

    public void setSkillNames(List<String> skillNames) {
        this.skillNames = skillNames;
    }

    public Integer getToolCallRounds() {
        return toolCallRounds;
    }

    public void setToolCallRounds(Integer toolCallRounds) {
        this.toolCallRounds = toolCallRounds;
    }

    public Boolean getIsSuccess() {
        return isSuccess;
    }

    public void setIsSuccess(Boolean isSuccess) {
        this.isSuccess = isSuccess;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getFinishReason() {
        return finishReason;
    }

    public void setFinishReason(String finishReason) {
        this.finishReason = finishReason;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }
}