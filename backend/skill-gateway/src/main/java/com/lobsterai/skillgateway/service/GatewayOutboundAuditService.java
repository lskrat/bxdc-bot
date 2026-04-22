package com.lobsterai.skillgateway.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lobsterai.skillgateway.audit.*;
import com.lobsterai.skillgateway.entity.GatewayOutboundAuditLog;
import com.lobsterai.skillgateway.repository.GatewayOutboundAuditLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

@Service
public class GatewayOutboundAuditService {

    private static final Logger log = LoggerFactory.getLogger(GatewayOutboundAuditService.class);

    private final GatewayOutboundAuditLogRepository repository;
    private final IngressSnapshotReader ingressSnapshotReader;
    private final ObjectMapper objectMapper;
    private final int maxPayloadBytes;
    private final java.util.List<String> extraRedactedHeaders;

    public GatewayOutboundAuditService(
            GatewayOutboundAuditLogRepository repository,
            IngressSnapshotReader ingressSnapshotReader,
            ObjectMapper objectMapper,
            @Value("${app.gateway-audit.max-payload-bytes:1048576}") int maxPayloadBytes,
            @Value("${app.gateway-audit.redacted-headers:}") String extraRedactedHeaders
    ) {
        this.repository = repository;
        this.ingressSnapshotReader = ingressSnapshotReader;
        this.objectMapper = objectMapper;
        this.maxPayloadBytes = maxPayloadBytes;
        this.extraRedactedHeaders = parseCsv(extraRedactedHeaders);
    }

    private static java.util.List<String> parseCsv(String csv) {
        if (csv == null || csv.isBlank()) {
            return java.util.Collections.emptyList();
        }
        return java.util.Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    public void recordHttpOutboundSuccess(HttpRequest request, byte[] outboundBodyBytes, ClientHttpResponse response,
                                          String skillContext) {
        try {
            GatewayOutboundAuditLog row = baseHttpRow(request, outboundBodyBytes, skillContext);
            row.setStatus("SUCCESS");
            row.setErrorMessage(null);
            repository.save(row);
        } catch (Exception e) {
            log.warn("gateway outbound audit (HTTP success) failed: {}", e.getMessage());
        }
    }

    public void recordHttpOutboundFailure(HttpRequest request, byte[] outboundBodyBytes, Exception error,
                                          String skillContext) {
        try {
            GatewayOutboundAuditLog row = baseHttpRow(request, outboundBodyBytes, skillContext);
            row.setStatus("FAILURE");
            row.setErrorMessage(error != null && error.getMessage() != null ? error.getMessage() : "unknown error");
            repository.save(row);
        } catch (Exception e) {
            log.warn("gateway outbound audit (HTTP failure) failed: {}", e.getMessage());
        }
    }

    private GatewayOutboundAuditLog baseHttpRow(HttpRequest request, byte[] outboundBodyBytes, String skillContext) {
        GatewayOutboundAuditLog row = new GatewayOutboundAuditLog();
        row.setRecordedAt(Instant.now());
        row.setOutboundKind("HTTP");
        row.setCorrelationId(correlationOrGenerated());
        row.setUserId(AuditPrincipalResolver.currentAuditUserId());
        row.setDestination(request.getURI().toString());
        row.setHttpMethod(request.getMethod().name());
        row.setSkillContext(skillContext);

        IngressCapture ingress = ingressSnapshotReader.readCurrentRequest();
        row.setOriginIncomplete(ingress.incomplete());
        row.setOriginHeadersJson(ingress.headersJson());
        row.setOriginBody(ingress.body());
        row.setOriginTruncated(ingress.bodyTruncated());
        row.setOriginSha256(ingress.bodySha256());

        String outboundHeadersJson = AuditHeaderJsonBuilder.toJson(request, extraRedactedHeaders, objectMapper);
        row.setOutboundHeadersJson(outboundHeadersJson);

        AuditPayloadTruncator.Result ob = AuditPayloadTruncator.truncate(outboundBodyBytes, maxPayloadBytes);
        row.setOutboundBody(ob.stored());
        row.setOutboundTruncated(ob.truncated());
        row.setOutboundSha256(ob.sha256Hex());
        return row;
    }

    public void recordSsh(String userId, String host, int port, String command, boolean success,
                          String errorMessage, String skillContext) {
        try {
            GatewayOutboundAuditLog row = new GatewayOutboundAuditLog();
            row.setRecordedAt(Instant.now());
            row.setOutboundKind("SSH");
            row.setCorrelationId(correlationOrGenerated());
            row.setUserId(userId != null && !userId.isBlank() ? userId.trim() : AuditPrincipalResolver.currentAuditUserId());
            row.setDestination(host + ":" + port);
            row.setStatus(success ? "SUCCESS" : "FAILURE");
            row.setErrorMessage(success ? null : errorMessage);
            row.setSshCommand(command);
            row.setSkillContext(skillContext);

            IngressCapture ingress = ingressSnapshotReader.readCurrentRequest();
            row.setOriginIncomplete(ingress.incomplete());
            row.setOriginHeadersJson(ingress.headersJson());
            row.setOriginBody(ingress.body());
            row.setOriginTruncated(ingress.bodyTruncated());
            row.setOriginSha256(ingress.bodySha256());

            repository.save(row);
        } catch (Exception e) {
            log.warn("gateway outbound audit (SSH) failed: {}", e.getMessage());
        }
    }

    private String correlationOrGenerated() {
        String c = AuditPrincipalResolver.currentCorrelationId();
        if (c != null && !c.isBlank()) {
            return c;
        }
        return UUID.randomUUID().toString();
    }
}
