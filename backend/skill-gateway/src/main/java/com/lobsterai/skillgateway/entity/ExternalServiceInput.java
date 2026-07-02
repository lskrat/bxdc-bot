package com.lobsterai.skillgateway.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

/**
 * 外部服务入参契约（子表；运行时单一数据源）。
 *
 * 字段语义详见 docs/external-service-skill-design.md §4.2.1。
 * 设计稿：openspec/changes/add-external-service-skill/
 *
 * 字段三类：
 * 1. 第三方接口契约（4 个）：external_param_name / param_location / body_content_type / param_type
 * 2. LLM 行为标志（3 个）：is_required / is_raw_transmission / is_sensitive
 * 3. Admin 元数据（5 个）：id / service_id / display_name / description / display_order
 */
@TableName("external_service_input")
public class ExternalServiceInput {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("service_id")
    private Long serviceId;

    @TableField("external_param_name")
    private String externalParamName;

    @TableField("display_name")
    private String displayName;

    @TableField("is_required")
    private Integer isRequired;

    @TableField("is_raw_transmission")
    private Integer isRawTransmission;

    @TableField("param_location")
    private String paramLocation;

    @TableField("body_content_type")
    private String bodyContentType;

    @TableField("param_type")
    private String paramType;

    @TableField("is_sensitive")
    private Integer isSensitive;

    @TableField("description")
    private String description;

    @TableField("display_order")
    private Integer displayOrder;

    // ===== Getter / Setter =====

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getServiceId() { return serviceId; }
    public void setServiceId(Long serviceId) { this.serviceId = serviceId; }

    public String getExternalParamName() { return externalParamName; }
    public void setExternalParamName(String externalParamName) { this.externalParamName = externalParamName; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public Integer getIsRequired() { return isRequired; }
    public void setIsRequired(Integer isRequired) { this.isRequired = isRequired; }

    public Integer getIsRawTransmission() { return isRawTransmission; }
    public void setIsRawTransmission(Integer isRawTransmission) { this.isRawTransmission = isRawTransmission; }

    public String getParamLocation() { return paramLocation; }
    public void setParamLocation(String paramLocation) { this.paramLocation = paramLocation; }

    public String getBodyContentType() { return bodyContentType; }
    public void setBodyContentType(String bodyContentType) { this.bodyContentType = bodyContentType; }

    public String getParamType() { return paramType; }
    public void setParamType(String paramType) { this.paramType = paramType; }

    public Integer getIsSensitive() { return isSensitive; }
    public void setIsSensitive(Integer isSensitive) { this.isSensitive = isSensitive; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Integer getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(Integer displayOrder) { this.displayOrder = displayOrder; }
}