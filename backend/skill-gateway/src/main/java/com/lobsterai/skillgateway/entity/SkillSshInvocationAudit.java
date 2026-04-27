package com.lobsterai.skillgateway.entity;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * Dedicated audit for SSH / linux-script style skill invocations (dual-written with legacy {@code gateway_outbound_audit_logs} SSH rows during transition).
 */
@Entity
@Table(name = "skill_ssh_invocation_audit_logs", indexes = {
        @Index(name = "idx_ssh_inv_audit_user_time", columnList = "user_id,recorded_at"),
        @Index(name = "idx_ssh_inv_audit_skill", columnList = "skill_id")
})
public class SkillSshInvocationAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "correlation_id", nullable = false, length = 64)
    private String correlationId;

    @Column(name = "user_id", length = 128)
    private String userId;

    @Column(name = "skill_id")
    private Long skillId;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    @Column(name = "skill_context", length = 256)
    private String skillContext;

    /** Raw agent request body JSON (sanitized: no private key/password plaintext). */
    @Column(name = "agent_request_json", columnDefinition = "LONGTEXT")
    private String agentRequestJson;

    @Column(name = "resolved_host", columnDefinition = "TEXT")
    private String resolvedHost;

    @Column(name = "resolved_port")
    private Integer resolvedPort;

    @Column(name = "executed_command", columnDefinition = "TEXT")
    private String executedCommand;

    @Column(name = "server_ledger_id")
    private Long serverLedgerId;

    @Column(name = "status", nullable = false, length = 32)
    private String status;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "result_body", columnDefinition = "LONGTEXT")
    private String resultBody;

    @Column(name = "result_truncated", nullable = false)
    private boolean resultTruncated;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public void setCorrelationId(String correlationId) {
        this.correlationId = correlationId;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public Long getSkillId() {
        return skillId;
    }

    public void setSkillId(Long skillId) {
        this.skillId = skillId;
    }

    public Instant getRecordedAt() {
        return recordedAt;
    }

    public void setRecordedAt(Instant recordedAt) {
        this.recordedAt = recordedAt;
    }

    public String getSkillContext() {
        return skillContext;
    }

    public void setSkillContext(String skillContext) {
        this.skillContext = skillContext;
    }

    public String getAgentRequestJson() {
        return agentRequestJson;
    }

    public void setAgentRequestJson(String agentRequestJson) {
        this.agentRequestJson = agentRequestJson;
    }

    public String getResolvedHost() {
        return resolvedHost;
    }

    public void setResolvedHost(String resolvedHost) {
        this.resolvedHost = resolvedHost;
    }

    public Integer getResolvedPort() {
        return resolvedPort;
    }

    public void setResolvedPort(Integer resolvedPort) {
        this.resolvedPort = resolvedPort;
    }

    public String getExecutedCommand() {
        return executedCommand;
    }

    public void setExecutedCommand(String executedCommand) {
        this.executedCommand = executedCommand;
    }

    public Long getServerLedgerId() {
        return serverLedgerId;
    }

    public void setServerLedgerId(Long serverLedgerId) {
        this.serverLedgerId = serverLedgerId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public String getResultBody() {
        return resultBody;
    }

    public void setResultBody(String resultBody) {
        this.resultBody = resultBody;
    }

    public boolean isResultTruncated() {
        return resultTruncated;
    }

    public void setResultTruncated(boolean resultTruncated) {
        this.resultTruncated = resultTruncated;
    }
}
