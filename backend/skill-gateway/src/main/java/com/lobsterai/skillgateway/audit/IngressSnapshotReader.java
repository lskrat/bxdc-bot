package com.lobsterai.skillgateway.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletRequestWrapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.util.ContentCachingRequestWrapper;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

@Component
public class IngressSnapshotReader {

    private final ObjectMapper objectMapper;
    private final int maxPayloadBytes;
    private final List<String> extraRedactedHeaders;

    public IngressSnapshotReader(
            ObjectMapper objectMapper,
            @Value("${app.gateway-audit.max-payload-bytes:1048576}") int maxPayloadBytes,
            @Value("${app.gateway-audit.redacted-headers:}") String extraRedactedHeaders
    ) {
        this.objectMapper = objectMapper;
        this.maxPayloadBytes = maxPayloadBytes;
        this.extraRedactedHeaders = parseList(extraRedactedHeaders);
    }

    private static List<String> parseList(String csv) {
        if (csv == null || csv.isBlank()) {
            return Collections.emptyList();
        }
        return Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    public IngressCapture readCurrentRequest() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (!(attrs instanceof ServletRequestAttributes sra)) {
            return IngressCapture.missing();
        }
        HttpServletRequest request = sra.getRequest();
        ContentCachingRequestWrapper wrapped = resolveContentCachingWrapper(request);
        if (wrapped == null) {
            return IngressCapture.missing();
        }
        byte[] raw = wrapped.getContentAsByteArray();
        AuditPayloadTruncator.Result tr = AuditPayloadTruncator.truncate(raw, maxPayloadBytes);
        String headersJson = AuditHeaderJsonBuilder.toJson(wrapped, extraRedactedHeaders, objectMapper);
        return new IngressCapture(false, headersJson, tr.stored(), tr.truncated(), tr.sha256Hex());
    }

    /**
     * Security and other filters may wrap the request; unwrap to find {@link ContentCachingRequestWrapper}.
     */
    private static ContentCachingRequestWrapper resolveContentCachingWrapper(HttpServletRequest request) {
        HttpServletRequest current = request;
        while (current instanceof ServletRequestWrapper wrapper) {
            if (current instanceof ContentCachingRequestWrapper ccw) {
                return ccw;
            }
            current = (HttpServletRequest) wrapper.getRequest();
        }
        return current instanceof ContentCachingRequestWrapper ccw ? ccw : null;
    }
}
