package com.lobsterai.skillgateway.dto;

import com.lobsterai.skillgateway.entity.ExternalService;
import com.lobsterai.skillgateway.entity.ExternalServiceInput;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 外部服务出参 DTO。
 *
 * 关键：auth_config.valueStatic 对非 admin 角色脱敏为 "***MASKED-XXXX***"。
 */
public class ExternalServiceView {

    private Long id;
    private String name;
    private String endpointUrl;
    private String httpMethod;
    private String authKind;
    private String authConfigJson;
    private String responseFormat;
    private Integer retryMax;
    private Integer enabled;
    private Integer displayOrder;
    private String description;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<ExternalServiceInput> inputs;

    public static ExternalServiceView from(ExternalService svc, List<ExternalServiceInput> inputs, boolean isAdmin) {
        ExternalServiceView v = new ExternalServiceView();
        v.id = svc.getId();
        v.name = svc.getName();
        v.endpointUrl = svc.getEndpointUrl();
        v.httpMethod = svc.getHttpMethod();
        v.authKind = svc.getAuthKind();
        v.authConfigJson = isAdmin ? svc.getAuthConfigJson() : maskAuthConfigJson(svc.getAuthConfigJson());
        v.responseFormat = svc.getResponseFormat();
        v.retryMax = svc.getRetryMax();
        v.enabled = svc.getEnabled();
        v.displayOrder = svc.getDisplayOrder();
        v.description = svc.getDescription();
        v.createdAt = svc.getCreatedAt();
        v.updatedAt = svc.getUpdatedAt();
        v.inputs = inputs != null ? inputs : new ArrayList<ExternalServiceInput>();
        return v;
    }

    /**
     * 对 auth_config 中的 valueStatic 字段做脱敏（仅显后 4 位）。
     * 适用于非 admin 角色调用 list / get 接口时使用。
     */
    private static String maskAuthConfigJson(String authConfigJson) {
        if (authConfigJson == null || authConfigJson.trim().isEmpty()) {
            return null;
        }
        try {
            com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> map = om.readValue(authConfigJson,
                    new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
            Object vs = map.get("valueStatic");
            if (vs instanceof String) {
                String s = (String) vs;
                if (s.length() > 4) {
                    map.put("valueStatic", "***MASKED-" + s.substring(s.length() - 4) + "***");
                } else {
                    map.put("valueStatic", "***MASKED***");
                }
            }
            return om.writeValueAsString(map);
        } catch (Exception e) {
            return authConfigJson;
        }
    }

    // ===== Getter / Setter =====

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEndpointUrl() { return endpointUrl; }
    public void setEndpointUrl(String endpointUrl) { this.endpointUrl = endpointUrl; }

    public String getHttpMethod() { return httpMethod; }
    public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }

    public String getAuthKind() { return authKind; }
    public void setAuthKind(String authKind) { this.authKind = authKind; }

    public String getAuthConfigJson() { return authConfigJson; }
    public void setAuthConfigJson(String authConfigJson) { this.authConfigJson = authConfigJson; }

    public String getResponseFormat() { return responseFormat; }
    public void setResponseFormat(String responseFormat) { this.responseFormat = responseFormat; }

    public Integer getRetryMax() { return retryMax; }
    public void setRetryMax(Integer retryMax) { this.retryMax = retryMax; }

    public Integer getEnabled() { return enabled; }
    public void setEnabled(Integer enabled) { this.enabled = enabled; }

    public Integer getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(Integer displayOrder) { this.displayOrder = displayOrder; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public List<ExternalServiceInput> getInputs() { return inputs; }
    public void setInputs(List<ExternalServiceInput> inputs) { this.inputs = inputs; }
}