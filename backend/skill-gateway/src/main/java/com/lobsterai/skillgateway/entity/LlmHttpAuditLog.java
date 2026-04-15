package com.lobsterai.skillgateway.entity;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * LLM 出站 HTTP 原始审计（由 agent-core 经本网关落库，agent-core 不直连数据库）。
 */
@Entity
@Table(
        name = "llm_http_audit_logs",
        indexes = {
                @Index(name = "idx_llm_http_audit_user_recorded", columnList = "user_id,recorded_at")
        }
)
public class LlmHttpAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 业务用户 ID（来自 agent 上报；可为空） */
    @Column(name = "user_id", length = 128)
    private String userId;

    @Column(name = "session_id", length = 128)
    private String sessionId;

    @Column(name = "correlation_id", nullable = false, length = 64)
    private String correlationId;

    @Column(nullable = false, length = 32)
    private String direction;

    /** 服务端落库时间（权威） */
    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    /** 完整事件 JSON（与 agent 侧 llmOrg 记录结构一致，便于对照） */
    @Column(name = "payload_json", nullable = false, columnDefinition = "LONGTEXT")
    private String payloadJson;

    public LlmHttpAuditLog() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public void setCorrelationId(String correlationId) {
        this.correlationId = correlationId;
    }

    public String getDirection() {
        return direction;
    }

    public void setDirection(String direction) {
        this.direction = direction;
    }

    public Instant getRecordedAt() {
        return recordedAt;
    }

    public void setRecordedAt(Instant recordedAt) {
        this.recordedAt = recordedAt;
    }

    public String getPayloadJson() {
        return payloadJson;
    }

    public void setPayloadJson(String payloadJson) {
        this.payloadJson = payloadJson;
    }
}
