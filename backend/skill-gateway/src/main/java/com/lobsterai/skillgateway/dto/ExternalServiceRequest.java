package com.lobsterai.skillgateway.dto;

import java.util.List;

/**
 * Admin 增改外部服务的入参 DTO（主表 + 子表行）。
 *
 * 用于 POST /api/external-service 与 PUT /api/external-service/{id}。
 */
public class ExternalServiceRequest {

    private String name;
    private String endpointUrl;
    private String httpMethod;
    private String authKind;
    /** 原始 JSON 字符串（Controller 解析后存到 entity 的 Map 字段）。也支持已是 Map 的形态。 */
    private Object authConfig;
    private String responseFormat;
    private Integer retryMax;
    private Integer enabled;
    private Integer displayOrder;
    private String description;

    /** 子表行（PUT 替换策略：先 DELETE 再 INSERT）。 */
    private List<ExternalServiceInputRequest> inputs;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEndpointUrl() { return endpointUrl; }
    public void setEndpointUrl(String endpointUrl) { this.endpointUrl = endpointUrl; }

    public String getHttpMethod() { return httpMethod; }
    public void setHttpMethod(String httpMethod) { this.httpMethod = httpMethod; }

    public String getAuthKind() { return authKind; }
    public void setAuthKind(String authKind) { this.authKind = authKind; }

    public Object getAuthConfig() { return authConfig; }
    public void setAuthConfig(Object authConfig) { this.authConfig = authConfig; }

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

    public List<ExternalServiceInputRequest> getInputs() { return inputs; }
    public void setInputs(List<ExternalServiceInputRequest> inputs) { this.inputs = inputs; }
}