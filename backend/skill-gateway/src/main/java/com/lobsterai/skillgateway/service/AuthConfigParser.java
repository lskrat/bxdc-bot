package com.lobsterai.skillgateway.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

import java.util.Map;

/**
 * auth_config JSON 解析器（按 auth_kind 校验 + valueStatic 自动解密）。
 *
 * 设计稿：openspec/changes/add-external-service-skill/design.md 决策 7
 *
 * 用法：
 *   AuthConfigParser p = AuthConfigParser.parse(svc.getAuthConfigJson(), svc.getAuthKind());
 *   String headerName = p.getString("headerName", null);
 *   String value = p.getDecryptedString("valueStatic");   // 自动 AesCipher.decrypt
 */
public class AuthConfigParser {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final Map<String, Object> raw;
    private final String authKind;

    private AuthConfigParser(Map<String, Object> raw, String authKind) {
        this.raw = raw != null ? raw : new java.util.HashMap<String, Object>();
        this.authKind = authKind;
    }

    /**
     * 静态工厂：接收 auth_config JSON 字符串 + auth_kind，解析并校验必填字段。
     * 失败抛 IllegalArgumentException（带可读消息）。
     *
     * 注：这是推荐入口——ExternalService.authConfigJson 是 String 形态（与 PythonSandbox 同形），
     *     不依赖 MyBatis-Plus 全局 TypeHandler 配置。
     */
    public static AuthConfigParser parse(String authConfigJson, String authKind) {
        if (authKind == null) {
            throw new IllegalArgumentException("auth_kind is required");
        }
        Map<String, Object> map;
        if (authConfigJson == null || authConfigJson.trim().isEmpty()) {
            map = new java.util.HashMap<String, Object>();
        } else {
            try {
                map = MAPPER.readValue(authConfigJson,
                        new TypeReference<Map<String, Object>>() {});
            } catch (Exception e) {
                throw new IllegalArgumentException(
                        "Invalid auth_config JSON: " + e.getMessage(), e);
            }
        }
        AuthConfigParser p = new AuthConfigParser(map, authKind);
        p.validate();
        return p;
    }

    /**
     * 兼容旧签名（接收 Map）。新代码优先用 String 版本。
     */
    @Deprecated
    public static AuthConfigParser parse(Map<String, Object> raw, String authKind) {
        if (authKind == null) {
            throw new IllegalArgumentException("auth_kind is required");
        }
        AuthConfigParser p = new AuthConfigParser(raw, authKind);
        p.validate();
        return p;
    }

    /**
     * 按 auth_kind 校验必填字段。
     */
    private void validate() {
        if ("none".equals(authKind)) {
            return;
        }
        if ("apiKey".equals(authKind)) {
            require("headerName");
            require("valueStatic");
            return;
        }
        if ("bearer".equals(authKind)) {
            require("valueStatic");
            return;
        }
        if ("dynamicToken".equals(authKind)) {
            require("tokenEndpoint");
            require("tokenRequestBody");
            require("tokenPath");
            require("cacheSeconds");
            return;
        }
        throw new IllegalArgumentException("Unsupported auth_kind: " + authKind);
    }

    private void require(String key) {
        Object v = raw.get(key);
        if (v == null || (v instanceof String && ((String) v).trim().isEmpty())) {
            throw new IllegalArgumentException(
                    "auth_config missing required key for auth_kind=" + authKind + ": " + key);
        }
    }

    public String getString(String key, String defaultValue) {
        Object v = raw.get(key);
        return v == null ? defaultValue : String.valueOf(v);
    }

    /**
     * 取 valueStatic 并自动 AesCipher.decrypt（构造时即尝试解密，明文不长期驻留）。
     */
    public String getDecryptedString(String key) {
        Object v = raw.get(key);
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v);
        // 若已被外部脱敏（***MASKED-XXXX***）则不解密，直接返回原样
        if (s.startsWith("***")) {
            return s;
        }
        try {
            return com.lobsterai.skillgateway.util.AesCipher.decrypt(s);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt auth_config." + key, e);
        }
    }

    public JsonNode getJsonNode(String key) {
        Object v = raw.get(key);
        if (v == null) {
            return null;
        }
        return MAPPER.valueToTree(v);
    }

    public Long getLong(String key, Long defaultValue) {
        Object v = raw.get(key);
        if (v == null) {
            return defaultValue;
        }
        if (v instanceof Number) {
            return ((Number) v).longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    public String getAuthKind() { return authKind; }

    public Map<String, Object> getRaw() { return raw; }
}