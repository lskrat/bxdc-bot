package com.lobsterai.skillgateway.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lobsterai.skillgateway.entity.ExternalService;
import com.lobsterai.skillgateway.util.JsonPathUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

/**
 * dynamicToken 模式本地缓存（按 serviceName 缓存 token + 过期时间）。
 *
 * 设计稿：openspec/changes/add-external-service-skill/design.md §4.4 + 风险表（Dynamic Token 雪崩）
 *
 * 单飞：synchronized(svc.getName().intern()) 保证同一 service 同时只发一次 token 请求。
 */
@Service
public class DynamicTokenCache {

    private static final Logger log = LoggerFactory.getLogger(DynamicTokenCache.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ConcurrentHashMap<String, CachedToken> cache = new ConcurrentHashMap<String, CachedToken>();

    private final ApiProxyService apiProxyService;

    public DynamicTokenCache(ApiProxyService apiProxyService) {
        this.apiProxyService = apiProxyService;
    }

    /**
     * 取 token（缓存命中直接返回；未命中单飞去 tokenEndpoint 拿）。
     */
    public String getOrFetch(ExternalService svc, AuthConfigParser authCfg) {
        String name = svc.getName();
        CachedToken hit = cache.get(name);
        if (hit != null && System.currentTimeMillis() < hit.expiresAt) {
            return hit.token;
        }

        // 单飞：同一 service 同时只发一次 token 请求
        synchronized (name.intern()) {
            hit = cache.get(name);
            if (hit != null && System.currentTimeMillis() < hit.expiresAt) {
                return hit.token;
            }

            try {
                String tokenEndpoint = authCfg.getString("tokenEndpoint", null);
                String tokenPath = authCfg.getString("tokenPath", "data.token");
                Long cacheSeconds = authCfg.getLong("cacheSeconds", 300L);
                JsonNode body = authCfg.getJsonNode("tokenRequestBody");

                Object resp = apiProxyService.callApi(
                        tokenEndpoint,
                        "POST",
                        new java.util.HashMap<String, String>(),
                        body == null ? null : body.toString(),
                        com.lobsterai.skillgateway.audit.HttpClientAuditMode.NONE,
                        10_000
                );

                String respJson = resp == null ? null : MAPPER.writeValueAsString(resp);
                Object parsed = resp == null ? null : JsonPathUtils.extractValueByPath(MAPPER.readTree(respJson), tokenPath);
                String token = parsed == null ? null : String.valueOf(parsed);
                if (token == null || token.isEmpty()) {
                    throw new IllegalStateException("Token not found at JSONPath: " + tokenPath);
                }

                CachedToken entry = new CachedToken();
                entry.token = token;
                entry.expiresAt = System.currentTimeMillis() + cacheSeconds * 1000L;
                cache.put(name, entry);
                log.info("[DynamicTokenCache] Fetched new token for {} (expires in {}s)", name, cacheSeconds);
                return token;

            } catch (Exception e) {
                log.error("[DynamicTokenCache] Failed to fetch token for {}: {}", name, e.getMessage());
                throw new IllegalStateException("Failed to fetch dynamic token: " + e.getMessage(), e);
            }
        }
    }

    public void invalidate(String name) {
        cache.remove(name);
    }

    private static class CachedToken {
        String token;
        long expiresAt;
    }
}