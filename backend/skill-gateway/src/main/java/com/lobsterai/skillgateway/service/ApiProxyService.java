package com.lobsterai.skillgateway.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lobsterai.skillgateway.audit.HttpClientAuditContext;
import com.lobsterai.skillgateway.audit.HttpClientAuditMode;
import com.lobsterai.skillgateway.http.OutboundUrlNormalizer;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * API 代理服务：封装 {@link RestTemplate}，供 Skill 对外 HTTP 与内部 HTTP 调用共用。
 */
@Service
public class ApiProxyService {

    private final RestTemplate gatewayRestTemplate;
    private final ObjectMapper objectMapper;

    public ApiProxyService(RestTemplate gatewayRestTemplate, ObjectMapper objectMapper) {
        this.gatewayRestTemplate = gatewayRestTemplate;
        this.objectMapper = objectMapper;
    }

    public Object callApi(String url, String method, Map<String, String> headers, Object body) {
        return callApi(url, method, headers, body, HttpClientAuditMode.NONE);
    }

    public Object callApi(
            String url,
            String method,
            Map<String, String> headers,
            Object body,
            HttpClientAuditMode mode
    ) {
            HttpClientAuditContext.set(mode);
        try {
            String outboundUrl = OutboundUrlNormalizer.normalizeForOutboundHttp(url);
            HttpHeaders httpHeaders = new HttpHeaders();
            if (headers != null) {
                headers.forEach(httpHeaders::add);
            }
            HttpEntity<Object> entity = new HttpEntity<>(body, httpHeaders);
            ResponseEntity<String> response = gatewayRestTemplate.exchange(
                    outboundUrl,
                    HttpMethod.valueOf(method.toUpperCase()),
                    entity,
                    String.class
            );
            return parseResponseBody(response);
        } finally {
            HttpClientAuditContext.clear();
        }
    }

    private Object parseResponseBody(ResponseEntity<String> response) {
        String responseBody = response.getBody();
        if (responseBody == null) {
            return null;
        }
        MediaType contentType = response.getHeaders().getContentType();
        if (contentType != null && (
                MediaType.APPLICATION_JSON.includes(contentType)
                        || contentType.getSubtype().toLowerCase().contains("json")
        )) {
            try {
                return objectMapper.readValue(responseBody, Object.class);
            } catch (Exception ignored) {
            }
        }
        return responseBody;
    }
}
