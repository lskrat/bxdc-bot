package com.lobsterai.skillgateway.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Skill 解析请求 DTO。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ParseFromDescriptionRequest {
    /** 用户输入的自然语言 + 半结构化文本描述 */
    private String description;

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
