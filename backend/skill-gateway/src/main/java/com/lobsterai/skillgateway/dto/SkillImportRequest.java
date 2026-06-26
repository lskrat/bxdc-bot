package com.lobsterai.skillgateway.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.lobsterai.skillgateway.entity.Skill;

/**
 * Skill 导入请求 DTO（20260625，add-skill-import-export 需求）。
 *
 * 通过 JSON 导入时携带的元数据 + 载荷：
 * <ul>
 *   <li>{@code metaSchemaVersion} - 导出文件 schema 版本号（当前支持 {@value #SUPPORTED_META_SCHEMA_VERSION}）</li>
 *   <li>{@code payload} - 完整 Skill 实体</li>
 *   <li>{@code overrideStrategy} - 命名冲突时的处理策略（OVERWRITE / RENAME / SKIP），第一版由前端在导入预览对话框处理，
 *       此字段预留供后续批量导入或后端强约束使用</li>
 * </ul>
 *
 * 请求体格式：
 * <pre>
 * {
 *   "name": "...",
 *   "type": "...",
 *   "configuration": "...",
 *   "importPayload": {
 *     "metaSchemaVersion": "1.0.0",
 *     "payload": { "name": "...", "type": "...", ... },
 *     "overrideStrategy": "RENAME"
 *   }
 * }
 * </pre>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SkillImportRequest {

    /** 当前支持的 metaSchemaVersion。后续 breaking change 增加枚举值。 */
    public static final String SUPPORTED_META_SCHEMA_VERSION = "1.0.0";

    /** 命名冲突覆盖策略常量（第一版仅作为文档契约，前端处理覆盖/重命名） */
    public static final String OVERRIDE_STRATEGY_OVERWRITE = "OVERWRITE";
    public static final String OVERRIDE_STRATEGY_RENAME = "RENAME";
    public static final String OVERRIDE_STRATEGY_SKIP = "SKIP";

    private String metaSchemaVersion;
    private Skill payload;
    private String overrideStrategy;

    public String getMetaSchemaVersion() {
        return metaSchemaVersion;
    }

    public void setMetaSchemaVersion(String metaSchemaVersion) {
        this.metaSchemaVersion = metaSchemaVersion;
    }

    public Skill getPayload() {
        return payload;
    }

    public void setPayload(Skill payload) {
        this.payload = payload;
    }

    public String getOverrideStrategy() {
        return overrideStrategy;
    }

    public void setOverrideStrategy(String overrideStrategy) {
        this.overrideStrategy = overrideStrategy;
    }
}