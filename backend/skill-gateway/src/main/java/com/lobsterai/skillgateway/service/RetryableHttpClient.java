package com.lobsterai.skillgateway.service;

import com.lobsterai.skillgateway.audit.HttpClientAuditMode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 重试 HTTP 客户端（沿用 ApiProxyService.callApi，指数退避基数 500ms 写死）。
 *
 * 设计稿：openspec/changes/add-external-service-skill/design.md 决策 8
 *
 * retry_max 语义：额外重试次数（不含首次）。retry_max=0 → 仅 1 次。
 * 退避：500 * (1L << attempt)，attempt 从 0 到 retryMax-1。
 * 不引入新 HTTP 客户端 — 复用现有 RestTemplate（ApiProxyService 持有）。
 *
 * 注意：ApiProxyService.callApi 内部已对 5xx 抛出异常，本类仅在外层包一层 try/catch。
 */
@Service
public class RetryableHttpClient {

    private static final Logger log = LoggerFactory.getLogger(RetryableHttpClient.class);

    private final ApiProxyService apiProxyService;

    public RetryableHttpClient(ApiProxyService apiProxyService) {
        this.apiProxyService = apiProxyService;
    }

    /**
     * 带重试的出站调用。
     *
     * @param url           完整 URL
     * @param method        GET / POST / PUT / DELETE / PATCH
     * @param headers       请求头
     * @param body          请求体（GET 时为 null）
     * @param retryMax      额外重试次数（0-5）
     * @param timeoutMs     单次超时（毫秒）
     * @param auditMode     审计模式
     * @param auditContext  审计上下文（skill_id 等；当前未使用，预留扩展）
     */
    public Object callApiWithRetry(
            String url, String method,
            Map<String, String> headers, Object body,
            int retryMax, int timeoutMs,
            HttpClientAuditMode auditMode, Object auditContext) {

        int maxAttempts = retryMax + 1; // 首次 + retry_max 次
        Exception lastError = null;

        for (int attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                return apiProxyService.callApi(url, method, headers, body, auditMode, timeoutMs);
            } catch (Exception e) {
                log.warn("[RetryableHttpClient] Attempt {}/{} failed for {}: {}",
                        attempt + 1, maxAttempts, url, e.getMessage());
                lastError = e;
            }

            // 退避（最后一次不等）
            if (attempt < maxAttempts - 1) {
                long backoffMs = 500L * (1L << attempt);
                try {
                    Thread.sleep(backoffMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Retry interrupted", ie);
                }
            }
        }

        throw new RuntimeException("All " + maxAttempts + " attempts failed for " + url,
                lastError != null ? lastError : new RuntimeException("unknown"));
    }
}