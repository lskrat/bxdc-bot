package com.lobsterai.skillgateway.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

/**
 * 外部服务注册表（主表）。
 *
 * 字段语义详见 docs/external-service-skill-design.md §4.2.1 / §4.2.2。
 * 设计稿：openspec/changes/add-external-service-skill/
 *
 * 关键设计：
 * - auth_config 用 String JSON 形态（与 PythonSandbox.serviceParams 同形），
 *   避免 Map<String,Object> + JacksonTypeHandler 需要 MyBatis-Plus 全局配置
 * - id 用 AUTO_INCREMENT（MyBatis-Plus IdType.AUTO）
 * - enabled 用 TINYINT(1)（0=禁用, 1=启用）
 * - created_at / updated_at 用 FieldFill 由 MetaObjectHandler 自动填充
 */
@TableName("external_service")
public class ExternalService {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("name")
    private String name;

    @TableField("endpoint_url")
    private String endpointUrl;

    @TableField("http_method")
    private String httpMethod;

    @TableField("auth_kind")
    private String authKind;

    /**
     * JSON 配置字符串（按 auth_kind 不同 schema）：
     * - none: "{}" 或 null
     * - apiKey: {"headerName": "...", "valueStatic": "<encrypted>"}
     * - bearer: {"valueStatic": "<encrypted>"}
     * - dynamicToken: {"tokenEndpoint": "...", "tokenRequestBody": {...}, "tokenPath": "...", "cacheSeconds": 300}
     *
     * valueStatic 字段由 AesCipher 加密存储；读取时通过 AuthConfigParser.parse(this.authConfigJson, this.authKind) 自动解密。
     *
     * 注：用 String 存 JSON 而不是 Map<String,Object> + JacksonTypeHandler —— 后者需要
     * 项目 MyBatis-Plus 全局注册 JacksonTypeHandler 才能正常工作，当前项目没配，会导致
     * selectList() 抛异常被 loadAll() 吞掉，下拉框看起来"数据加载不出来"。
     */
    @TableField("auth_config")
    private String authConfigJson;

    @TableField("response_format")
    private String responseFormat;

    @TableField("retry_max")
    private Integer retryMax;

    @TableField("enabled")
    private Integer enabled;

    @TableField("display_order")
    private Integer displayOrder;

    @TableField("description")
    private String description;

    @TableField(value = "created_at", fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(value = "updated_at", fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

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

    /**
     * 兼容旧名（保留给可能未替换的调用方）。
     */
    @Deprecated
    public String getAuthConfig() { return authConfigJson; }
    @Deprecated
    public void setAuthConfig(String authConfig) { this.authConfigJson = authConfig; }

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
}