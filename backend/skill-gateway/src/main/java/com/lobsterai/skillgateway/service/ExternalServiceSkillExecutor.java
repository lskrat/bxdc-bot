package com.lobsterai.skillgateway.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lobsterai.skillgateway.audit.ExternalOutboundPayloadMasker;
import com.lobsterai.skillgateway.audit.HttpClientAuditMode;
import com.lobsterai.skillgateway.entity.ExternalService;
import com.lobsterai.skillgateway.entity.ExternalServiceInput;
import com.lobsterai.skillgateway.entity.Skill;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 外部服务 Skill 执行器（核心出站逻辑）。
 *
 * 设计稿：openspec/changes/add-external-service-skill/design.md 决策 2/3/4/5/6/7/8
 *
 * 9 步执行流程：
 * 1. 加载主表（registry.getByNameOrThrow）
 * 2. 加载子表（registry.listInputs）
 * 3. 必填校验（按 is_required=1）
 * 4. path 替换（{external_param_name} 占位符）
 * 5. 拼 query / body / header（按 param_location + is_raw_transmission + body_content_type）
 * 6. 认证注入（按 auth_kind）
 * 7. 审计脱敏
 * 8. 出站调用（retryableHttpClient.callApiWithRetry）
 * 9. 响应处理（responseFormatter.format）→ 返回 LLM
 *
 * 强约束（决策 10 空数据兜底）：
 * - 子表为空 → 所有 map 保持空，仍能出站（仅认证 + 静态 URL）
 * - llmParams 为 null → 转空 Map
 * - inputs 为 null → 转空 List
 */
@Service
public class ExternalServiceSkillExecutor {

    private static final Logger log = LoggerFactory.getLogger(ExternalServiceSkillExecutor.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ExternalServiceRegistry registry;
    private final RetryableHttpClient retryableHttpClient;
    private final ExternalResponseFormatter responseFormatter;
    private final ExternalOutboundPayloadMasker masker;
    private final DynamicTokenCache dynamicTokenCache;
    private final ApiProxyService apiProxyService;

    public ExternalServiceSkillExecutor(
            ExternalServiceRegistry registry,
            RetryableHttpClient retryableHttpClient,
            ExternalResponseFormatter responseFormatter,
            DynamicTokenCache dynamicTokenCache,
            ApiProxyService apiProxyService) {
        this.registry = registry;
        this.retryableHttpClient = retryableHttpClient;
        this.responseFormatter = responseFormatter;
        this.masker = new ExternalOutboundPayloadMasker();
        this.dynamicTokenCache = dynamicTokenCache;
        this.apiProxyService = apiProxyService;
    }

    /**
     * 执行外部服务 Skill。
     */
    public Object executeExternalSkill(Skill skill, Map<String, Object> config, Object parameters, String userId) {
        String serviceName = config == null ? null : (String) config.get("serviceName");
        if (serviceName == null || serviceName.trim().isEmpty()) {
            throw new IllegalArgumentException("serviceName is required for kind=external");
        }

        ExternalService svc = registry.getByNameOrThrow(serviceName);
        if (svc.getEnabled() == null || svc.getEnabled() == 0) {
            throw new IllegalArgumentException("External service disabled: " + svc.getName());
        }

        List<ExternalServiceInput> inputs = registry.listInputs(svc.getId());
        if (inputs == null) inputs = Collections.emptyList();

        Map<String, Object> llmParams = asMap(parameters);
        if (llmParams == null) llmParams = Collections.emptyMap();

        // 1.5 raw=1 字段（原文透传）：强制使用 skill.configuration 创建时的初始值
        //     不被对话中 LLM 透传的 llmParams 覆盖。
        //     业务语义（用户需求）：创建 skill 时填什么值（例 q="aaa"），后续无论 LLM 在对话里把 q 改成什么（"bbb"），
        //     出站到第三方接口的始终是 "aaa"（创建时的原始值）。LLM 看到 schema 仍然会传 {q:"bbb"}，
        //     gateway 强制还原为 configuration 里的 q="aaa"，防止 LLM 篡改 raw 字段。
        Map<String, Object> configParams = parseSkillConfigParams(skill);
        for (ExternalServiceInput inp : inputs) {
            if (inp.getIsRawTransmission() != null && inp.getIsRawTransmission() == 1) {
                String n = inp.getExternalParamName();
                if (n != null && !n.isEmpty() && configParams.containsKey(n)) {
                    Object original = configParams.get(n);
                    llmParams.put(n, original);
                    log.info("[ExternalSkill] raw=1 override: field={} original={} llmPassed={}",
                            n, original, parameters);
                }
            }
        }

        // 3. 必填校验
        for (ExternalServiceInput inp : inputs) {
            if (inp.getIsRequired() != null && inp.getIsRequired() == 1) {
                String n = inp.getExternalParamName();
                if (n != null && !n.isEmpty() && !llmParams.containsKey(n)) {
                    throw new IllegalArgumentException("Missing required field: " + n);
                }
            }
        }

        // 4. path 替换
        String finalUrl = svc.getEndpointUrl();
        if (finalUrl != null) {
            for (ExternalServiceInput inp : inputs) {
                if (!"path".equals(inp.getParamLocation())) continue;
                String n = inp.getExternalParamName();
                if (n == null || !llmParams.containsKey(n)) continue;
                String val = String.valueOf(llmParams.get(n));
                String encoded;
                if (inp.getIsRawTransmission() != null && inp.getIsRawTransmission() == 1) {
                    encoded = val;
                } else {
                    try {
                        encoded = URLEncoder.encode(val, "UTF-8");
                    } catch (java.io.UnsupportedEncodingException e) {
                        throw new IllegalStateException("UTF-8 not supported", e);
                    }
                }
                finalUrl = finalUrl.replace("{" + n + "}", encoded);
            }
        }

        // 5. 拼 query / body / header
        //    设计：
        //    - header 类型字段 → headerMap
        //    - path 类型字段 → 已在第 4 步替换 URL 占位符
        //    - query 类型字段 → queryMap，拼 URL query string
        //    - body 类型字段 → bodyMap，统一包成 {"payload": {...}}（与 API 类型 parameterBinding=jsonBody 一致）
        Map<String, String> queryMap = new LinkedHashMap<String, String>();
        Map<String, String> headerMap = new LinkedHashMap<String, String>();
        Map<String, Object> bodyMap = new LinkedHashMap<String, Object>();

        for (ExternalServiceInput inp : inputs) {
            String n = inp.getExternalParamName();
            if (n == null || n.isEmpty() || !llmParams.containsKey(n)) continue;
            Object val = llmParams.get(n);
            String sval = String.valueOf(val);
            String loc = inp.getParamLocation();
            boolean raw = inp.getIsRawTransmission() != null && inp.getIsRawTransmission() == 1;

            if ("query".equals(loc)) {
                if (raw) {
                    queryMap.put(n, sval);
                } else {
                    try {
                        queryMap.put(n, URLEncoder.encode(sval, "UTF-8"));
                    } catch (java.io.UnsupportedEncodingException e) {
                        throw new IllegalStateException("UTF-8 not supported", e);
                    }
                }
            } else if ("header".equals(loc)) {
                headerMap.put(n, sval);
            } else if ("body".equals(loc)) {
                String ct = inp.getBodyContentType();
                if (ct == null) ct = "json";
                if ("text".equals(ct)) {
                    // 单值整体 body — 后续判断 __text__ 走特殊路径
                    bodyMap.put("__text__", sval);
                } else if ("binary".equals(ct)) {
                    bodyMap.put("__file_ref__", sval);
                } else {
                    bodyMap.put(n, sval);
                }
            }
            // path 已在第 4 步处理
        }

        // 6. 认证注入（query 类型 apiKey 也走 queryMap）
        AuthConfigParser authCfg = AuthConfigParser.parse(svc.getAuthConfigJson(), svc.getAuthKind());
        injectAuth(svc, authCfg, headerMap, queryMap);

        // 7. 审计脱敏（仅记录到 log，不修改入参；实际落审计在 ApiProxyService 中）
        Map<String, Object> maskedForLog = masker.mask(llmParams, inputs);
        log.info("[ExternalSkill] svc={} masked_payload={}", svc.getName(), maskedForLog);

        // 8. 出站调用
        //    body 处理策略（与 API 类型 parameterBinding=jsonBody 完全一致）：
        //    - __text__ → 整体作为 body string（不进 payload 包裹）
        //    - __file_ref__ → file:xxx 占位（multipart 待扩展）
        //    - 普通 json/form Map → 直接作为 body（不包 payload 包裹）
        //      也就是说：bodyMap 里是什么字段就发什么字段，不做外层封装
        Object finalBody = bodyMap;
        if (bodyMap.containsKey("__text__")) {
            finalBody = bodyMap.get("__text__");
        } else if (bodyMap.containsKey("__file_ref__")) {
            // 二进制 multipart 暂用 file:xxx 字符串占位（实际 multipart 由 ApiProxyService 内部支持时扩展）
            finalBody = bodyMap.get("__file_ref__");
        }
        // 普通 json/form 字段：直接用 bodyMap，不做 payload 包裹（与 API 类型 jsonBody 一致）

        // 拼 query string 到 finalUrl（与 API 类型 executeApiSkill 同形，使用 SkillExecutionService.buildUrlWithQuery）
        if (!queryMap.isEmpty()) {
            finalUrl = buildUrlWithQuery(finalUrl, queryMap);
        }

        Object resp = retryableHttpClient.callApiWithRetry(
                finalUrl, svc.getHttpMethod(),
                headerMap, finalBody,
                svc.getRetryMax() == null ? 0 : svc.getRetryMax(),
                30_000,
                HttpClientAuditMode.SKILL_OUTBOUND,
                skill);

        // 9. 响应处理（ApiProxyService 已 parse 为 Object，这里直接按 response_format 二次包装）
        String respBody = null;
        try {
            respBody = resp == null ? null : MAPPER.writeValueAsString(resp);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("[ExternalSkill] Failed to re-serialize response: {}", e.getMessage());
        }
        // 包装一个伪 ResponseEntity 给 formatter（保持 formatter 接口稳定）
        org.springframework.http.ResponseEntity<String> wrappedResp =
                org.springframework.http.ResponseEntity.ok(respBody == null ? "" : respBody);
        return responseFormatter.format(wrappedResp, svc.getResponseFormat());
    }

    /**
     * 按 auth_kind 注入认证头/参数。
     */
    private void injectAuth(ExternalService svc, AuthConfigParser authCfg,
                             Map<String, String> headerMap, Map<String, String> queryMap) {
        String kind = svc.getAuthKind();
        if (kind == null || "none".equals(kind)) {
            return;
        }
        if ("apiKey".equals(kind)) {
            String headerName = authCfg.getString("headerName", "");
            String value = authCfg.getDecryptedString("valueStatic");
            if (headerName == null || headerName.isEmpty()) {
                // headerName 空 → 拼 query
                queryMap.put("apiKey", value);
            } else {
                headerMap.put(headerName, value);
            }
            return;
        }
        if ("bearer".equals(kind)) {
            String value = authCfg.getDecryptedString("valueStatic");
            headerMap.put("Authorization", "Bearer " + value);
            return;
        }
        if ("dynamicToken".equals(kind)) {
            String token = dynamicTokenCache.getOrFetch(svc, authCfg);
            headerMap.put("Authorization", "Bearer " + token);
            return;
        }
        throw new IllegalArgumentException("Unsupported auth_kind: " + kind);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object parameters) {
        if (parameters == null) return null;
        if (parameters instanceof Map) {
            return (Map<String, Object>) parameters;
        }
        try {
            return MAPPER.readValue(MAPPER.writeValueAsString(parameters),
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            log.warn("[ExternalSkill] parameters not a Map and JSON conversion failed: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 解析 skill.configuration 字段得到配置时的初始参数字典。
     * 用于 raw=1 字段：把 LLM 透传的 llmParams 中被对话篡改的值还原为 configuration 里的原始值。
     *
     * 注：skill.configuration 是 LLM 看不到的运行时单一数据源（在 sys_param_config 单表存储）；
     * 前端 skillEditor.ts.serializeExternalDraft 在创建/更新 skill 时把所有子表字段（含 raw=1）
     * 序列化进 configuration（顶层字段）。
     */
    private Map<String, Object> parseSkillConfigParams(Skill skill) {
        Map<String, Object> empty = Collections.emptyMap();
        if (skill == null || skill.getConfiguration() == null) return empty;
        try {
            Map<String, Object> cfg = MAPPER.readValue(skill.getConfiguration(),
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            return cfg != null ? cfg : empty;
        } catch (Exception e) {
            log.warn("[ExternalSkill] parseSkillConfigParams: invalid config JSON: {}", e.getMessage());
            return empty;
        }
    }

    /**
     * 拼 query string 到 URL（与 API 类型 SkillExecutionService.buildUrlWithQuery 同形）。
     * 注意：queryMap 中的 value 已被 URLEncoder.encode 一次；这里只 encode key。
     */
    private String buildUrlWithQuery(String endpoint, Map<String, String> queryParams) {
        if (queryParams == null || queryParams.isEmpty()) {
            return endpoint;
        }
        StringBuilder sb = new StringBuilder(endpoint);
        boolean first = !endpoint.contains("?");
        for (Map.Entry<String, String> entry : queryParams.entrySet()) {
            if (entry.getValue() == null) continue;
            sb.append(first ? "?" : "&");
            first = false;
            try {
                sb.append(URLEncoder.encode(entry.getKey(), "UTF-8"));
                sb.append("=");
                sb.append(entry.getValue()); // 已经在 5.1 query 处理中 URLEncoder 编码过
            } catch (java.io.UnsupportedEncodingException e) {
                throw new RuntimeException(e);
            }
        }
        return sb.toString();
    }

    // ===== deriveSchemaProperties（决策 11 - agent-core 0 改动机制） =====

    /**
     * 派生 kind=external Skill 的 schemaProperties（供 SkillService.createOrUpdate 调用）。
     *
     * 派生语义（与 api/python 完全一致）：
     * - Map<external_param_name, {type, description}>
     * - required 列表（is_required=1 的 external_param_name）
     *
     * 子表为空 → 返回 {properties: {}, required: []}（不抛异常）
     * serviceName 不存在 → 抛 IllegalArgumentException
     * serviceName 禁用 → 抛 IllegalArgumentException
     */
    public Map<String, Object> deriveSchemaProperties(Skill skill) {
        // 与 API 类型同形：子表字段（除 parameterContract 外）平铺为顶层字段，
        // LLM 调用工具时传扁平参数 {q:"...", units:"...", lang:"..."}（agent-core 0 改动）。
        // executeExternalSkill 根据子表 param_location 自动绑定到 query/body/header/path，
        // body 类型字段会整体包成 {payload:{...}} 发送给第三方。
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        Map<String, Object> properties = new LinkedHashMap<String, Object>();
        java.util.List<String> required = new java.util.ArrayList<String>();

        if (skill == null || skill.getConfiguration() == null) {
            result.put("properties", properties);
            result.put("required", required);
            return result;
        }

        String configStr = skill.getConfiguration();
        Map<String, Object> cfg;
        try {
            cfg = MAPPER.readValue(configStr,
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            log.warn("[ExternalSkill] deriveSchemaProperties: invalid config JSON: {}", e.getMessage());
            result.put("properties", properties);
            result.put("required", required);
            return result;
        }

        Object kindObj = cfg.get("kind");
        if (!"external".equals(String.valueOf(kindObj))) {
            result.put("properties", properties);
            result.put("required", required);
            return result;
        }

        String serviceName = (String) cfg.get("serviceName");
        ExternalService svc = registry.getByNameOrThrow(serviceName);
        if (svc.getEnabled() == null || svc.getEnabled() == 0) {
            throw new IllegalArgumentException("External service disabled: " + serviceName);
        }

        List<ExternalServiceInput> inputs = registry.listInputs(svc.getId());
        if (inputs == null) inputs = Collections.emptyList();

        for (ExternalServiceInput inp : inputs) {
            String n = inp.getExternalParamName();
            if (n == null || n.isEmpty()) continue;
            // parameterContract 是 schema 语义说明字段（jsonEditor UI 给前端展示用的），不暴露给 LLM
            if ("parameterContract".equals(n)) continue;

            Map<String, Object> propMeta = new LinkedHashMap<String, Object>();
            String type = inp.getParamType();
            propMeta.put("type", type != null ? type : "string");
            String desc = inp.getDescription();
            if (desc == null || desc.isEmpty()) {
                desc = inp.getDisplayName();
            }
            propMeta.put("description", desc != null ? desc : "");

            if (inp.getIsRequired() != null && inp.getIsRequired() == 1) {
                required.add(n);
                propMeta.put("required", true);
            }
            properties.put(n, propMeta);
        }

        result.put("properties", properties);
        result.put("required", required);
        return result;
    }
}