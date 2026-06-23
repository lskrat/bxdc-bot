package com.lobsterai.skillgateway.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * Skill 解析响应 DTO。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SkillParseResponse {
    /** 解析后的 Skill 对象（未持久化） */
    private Object skill;

    /** 警告信息列表（如有字段缺失或解析异常） */
    private List<String> warnings;

    /** 显式提取的字段标记 */
    private ExtractedFields extractedFields;

    public SkillParseResponse() {}

    public SkillParseResponse(Object skill, List<String> warnings, ExtractedFields extractedFields) {
        this.skill = skill;
        this.warnings = warnings;
        this.extractedFields = extractedFields;
    }

    public Object getSkill() {
        return skill;
    }

    public void setSkill(Object skill) {
        this.skill = skill;
    }

    public List<String> getWarnings() {
        return warnings;
    }

    public void setWarnings(List<String> warnings) {
        this.warnings = warnings;
    }

    public ExtractedFields getExtractedFields() {
        return extractedFields;
    }

    public void setExtractedFields(ExtractedFields extractedFields) {
        this.extractedFields = extractedFields;
    }

    /**
     * 显式提取的字段标记。
     */
    public static class ExtractedFields {
        private Boolean url;
        private Boolean method;
        private Boolean headers;
        private Boolean description;

        public ExtractedFields() {}

        public ExtractedFields(Boolean url, Boolean method, Boolean headers, Boolean description) {
            this.url = url;
            this.method = method;
            this.headers = headers;
            this.description = description;
        }

        public Boolean getUrl() {
            return url;
        }

        public void setUrl(Boolean url) {
            this.url = url;
        }

        public Boolean getMethod() {
            return method;
        }

        public void setMethod(Boolean method) {
            this.method = method;
        }

        public Boolean getHeaders() {
            return headers;
        }

        public void setHeaders(Boolean headers) {
            this.headers = headers;
        }

        public Boolean getDescription() {
            return description;
        }

        public void setDescription(Boolean description) {
            this.description = description;
        }
    }
}
