package com.lobsterai.skillgateway.entity;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "gateway_outbound_audit_logs", indexes = {
        @Index(name = "idx_gw_out_audit_corr", columnList = "correlation_id"),
        @Index(name = "idx_gw_out_audit_user_time", columnList = "user_id,recorded_at")
})
public class GatewayOutboundAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "correlation_id", nullable = false, length = 64)
    private String correlationId;

    @Column(name = "user_id", length = 128)
    private String userId;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    /** HTTP or SSH */
    @Column(name = "outbound_kind", nullable = false, length = 16)
    private String outboundKind;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String destination;

    @Column(name = "http_method", length = 16)
    private String httpMethod;

    @Column(name = "origin_incomplete", nullable = false)
    private boolean originIncomplete;

    @Column(name = "origin_headers_json", columnDefinition = "LONGTEXT")
    private String originHeadersJson;

    @Lob
    @Column(name = "origin_body")
    private byte[] originBody;

    @Column(name = "origin_truncated", nullable = false)
    private boolean originTruncated;

    @Column(name = "origin_sha256", length = 64)
    private String originSha256;

    @Column(name = "outbound_headers_json", columnDefinition = "LONGTEXT")
    private String outboundHeadersJson;

    @Lob
    @Column(name = "outbound_body")
    private byte[] outboundBody;

    @Column(name = "outbound_truncated", nullable = false)
    private boolean outboundTruncated;

    @Column(name = "outbound_sha256", length = 64)
    private String outboundSha256;

    @Column(name = "ssh_command", columnDefinition = "TEXT")
    private String sshCommand;

    @Column(name = "skill_context", length = 256)
    private String skillContext;

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

    public Instant getRecordedAt() {
        return recordedAt;
    }

    public void setRecordedAt(Instant recordedAt) {
        this.recordedAt = recordedAt;
    }

    public String getOutboundKind() {
        return outboundKind;
    }

    public void setOutboundKind(String outboundKind) {
        this.outboundKind = outboundKind;
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

    public String getDestination() {
        return destination;
    }

    public void setDestination(String destination) {
        this.destination = destination;
    }

    public String getHttpMethod() {
        return httpMethod;
    }

    public void setHttpMethod(String httpMethod) {
        this.httpMethod = httpMethod;
    }

    public boolean isOriginIncomplete() {
        return originIncomplete;
    }

    public void setOriginIncomplete(boolean originIncomplete) {
        this.originIncomplete = originIncomplete;
    }

    public String getOriginHeadersJson() {
        return originHeadersJson;
    }

    public void setOriginHeadersJson(String originHeadersJson) {
        this.originHeadersJson = originHeadersJson;
    }

    public byte[] getOriginBody() {
        return originBody;
    }

    public void setOriginBody(byte[] originBody) {
        this.originBody = originBody;
    }

    public boolean isOriginTruncated() {
        return originTruncated;
    }

    public void setOriginTruncated(boolean originTruncated) {
        this.originTruncated = originTruncated;
    }

    public String getOriginSha256() {
        return originSha256;
    }

    public void setOriginSha256(String originSha256) {
        this.originSha256 = originSha256;
    }

    public String getOutboundHeadersJson() {
        return outboundHeadersJson;
    }

    public void setOutboundHeadersJson(String outboundHeadersJson) {
        this.outboundHeadersJson = outboundHeadersJson;
    }

    public byte[] getOutboundBody() {
        return outboundBody;
    }

    public void setOutboundBody(byte[] outboundBody) {
        this.outboundBody = outboundBody;
    }

    public boolean isOutboundTruncated() {
        return outboundTruncated;
    }

    public void setOutboundTruncated(boolean outboundTruncated) {
        this.outboundTruncated = outboundTruncated;
    }

    public String getOutboundSha256() {
        return outboundSha256;
    }

    public void setOutboundSha256(String outboundSha256) {
        this.outboundSha256 = outboundSha256;
    }

    public String getSshCommand() {
        return sshCommand;
    }

    public void setSshCommand(String sshCommand) {
        this.sshCommand = sshCommand;
    }

    public String getSkillContext() {
        return skillContext;
    }

    public void setSkillContext(String skillContext) {
        this.skillContext = skillContext;
    }
}
