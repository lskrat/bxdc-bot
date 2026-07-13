package com.lobsterai.skillgateway.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * 外部服务响应格式化器（按 response_format 返回不同形态给 LLM）。
 *
 * 设计稿：openspec/changes/add-external-service-skill/design.md §4.6
 */
@Service
public class ExternalResponseFormatter {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * 格式化出站响应：
     * - json → 解析为 Map/List/primitive，返回结构化对象
     * - text → 直接返回字符串
     * - binary-base64 → Base64 编码后返回字符串
     */
    public Object format(ResponseEntity<String> resp, String responseFormat) {
        if (resp == null || resp.getBody() == null) {
            return null;
        }
        String body = resp.getBody();
        String fmt = responseFormat != null ? responseFormat.toLowerCase() : "json";

        switch (fmt) {
            case "text":
                return body;
            case "binary-base64":
                return Base64.getEncoder().encodeToString(body.getBytes(StandardCharsets.UTF_8));
            case "json":
            default:
                try {
                    return MAPPER.readValue(body, Object.class);
                } catch (Exception e) {
                    // 解析失败 → 退化为字符串
                    return body;
                }
        }
    }
}