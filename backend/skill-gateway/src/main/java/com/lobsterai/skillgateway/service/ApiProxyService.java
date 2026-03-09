package com.lobsterai.skillgateway.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * API 代理服务。
 * <p>
 * 封装 RestTemplate，提供通用的 HTTP 请求转发能力。
 * </p>
 */
@Service
public class ApiProxyService {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public ApiProxyService() {
        this.restTemplate = new RestTemplate();
        this.objectMapper = new ObjectMapper();
    }

    /**
     * 调用外部 API。
     *
     * @param url     目标 URL
     * @param method  HTTP 方法 (GET, POST, etc.)
     * @param headers 请求头
     * @param body    请求体
     * @return 响应体
     */
    public Object callApi(String url, String method, Map<String, String> headers, Object body) {
        HttpHeaders httpHeaders = new HttpHeaders();
        if (headers != null) {
            headers.forEach(httpHeaders::add);
        }

        HttpEntity<Object> entity = new HttpEntity<>(body, httpHeaders);
        ResponseEntity<String> response = restTemplate.exchange(
                url,
                HttpMethod.valueOf(method.toUpperCase()),
                entity,
                String.class
        );

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
                // Fall back to the raw payload when the body is JSON-like but not strict JSON.
            }
        }

        return responseBody;
    }
}
