package com.lobsterai.skillgateway.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

/**
 * 外部 API 接入租户映射表。
 * <p>
 * 存储模板对话（template_conv_id）→ 克隆对话（cloned_conv_id）+ 平台用户（user_id）的映射。
 * 同一 (template_conv_id, caller_id) 首次调用时创建，后续调用直接复用。
 * </p>
 */
@TableName("external_api_tenants")
public class ExternalApiTenant {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField("template_conv_id")
    private Long templateConvId;

    @TableField("caller_id")
    private String callerId;

    @TableField("user_id")
    private String userId;

    @TableField("cloned_conv_id")
    private Long clonedConvId;

    @TableField("created_at")
    private LocalDateTime createdAt;

    // ---- Getters / Setters ----

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getTemplateConvId() {
        return templateConvId;
    }

    public void setTemplateConvId(Long templateConvId) {
        this.templateConvId = templateConvId;
    }

    public String getCallerId() {
        return callerId;
    }

    public void setCallerId(String callerId) {
        this.callerId = callerId;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public Long getClonedConvId() {
        return clonedConvId;
    }

    public void setClonedConvId(Long clonedConvId) {
        this.clonedConvId = clonedConvId;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
