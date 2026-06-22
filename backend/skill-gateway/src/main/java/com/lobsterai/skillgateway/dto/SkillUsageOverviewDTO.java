package com.lobsterai.skillgateway.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDateTime;

public class SkillUsageOverviewDTO {

    private String toolName;
    private String skillName;
    private Long totalCalls;
    private Long successCalls;
    private Long failCalls;
    private Long uniqueUsers;
    private String createdBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private LocalDateTime firstCallTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private LocalDateTime lastCallTime;

    private Long avgDurationMs;

    public String getToolName() { return toolName; }
    public void setToolName(String toolName) { this.toolName = toolName; }

    public String getSkillName() { return skillName; }
    public void setSkillName(String skillName) { this.skillName = skillName; }

    public Long getTotalCalls() { return totalCalls; }
    public void setTotalCalls(Long totalCalls) { this.totalCalls = totalCalls; }

    public Long getSuccessCalls() { return successCalls; }
    public void setSuccessCalls(Long successCalls) { this.successCalls = successCalls; }

    public Long getFailCalls() { return failCalls; }
    public void setFailCalls(Long failCalls) { this.failCalls = failCalls; }

    public Long getUniqueUsers() { return uniqueUsers; }
    public void setUniqueUsers(Long uniqueUsers) { this.uniqueUsers = uniqueUsers; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getFirstCallTime() { return firstCallTime; }
    public void setFirstCallTime(LocalDateTime firstCallTime) { this.firstCallTime = firstCallTime; }

    public LocalDateTime getLastCallTime() { return lastCallTime; }
    public void setLastCallTime(LocalDateTime lastCallTime) { this.lastCallTime = lastCallTime; }

    public Long getAvgDurationMs() { return avgDurationMs; }
    public void setAvgDurationMs(Long avgDurationMs) { this.avgDurationMs = avgDurationMs; }
}
