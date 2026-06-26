package com.lobsterai.skillgateway.dto;

import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.service.SkillService;

/**
 * Skill 导入校验器（20260625，add-skill-import-export 需求）。
 *
 * 抽出为独立类的目的：
 * <ul>
 *   <li>便于写单元测试（SpringBootTest 启动慢）</li>
 *   <li>校验逻辑与 Controller 解耦，未来批量导入可复用</li>
 * </ul>
 *
 * 所有方法返回 {@code null} 表示校验通过；非 null 表示错误消息。
 */
public final class SkillImportValidator {

    /** name 字段最大长度 */
    public static final int MAX_NAME_LENGTH = 100;
    /** description 字段最大长度 */
    public static final int MAX_DESCRIPTION_LENGTH = 2000;
    /** configuration 字段最大长度（64KB） */
    public static final int MAX_CONFIGURATION_LENGTH = 65536;

    private SkillImportValidator() {}

    /**
     * 字段大小校验。超限返回错误消息，未超限返回 null。
     */
    public static String validateFieldSizes(Skill skill) {
        if (skill == null) {
            return "Skill payload is required";
        }
        if (skill.getName() != null && skill.getName().length() > MAX_NAME_LENGTH) {
            return "name length must be <= " + MAX_NAME_LENGTH + ", got " + skill.getName().length();
        }
        if (skill.getDescription() != null && skill.getDescription().length() > MAX_DESCRIPTION_LENGTH) {
            return "description length must be <= " + MAX_DESCRIPTION_LENGTH + ", got " + skill.getDescription().length();
        }
        if (skill.getConfiguration() != null && skill.getConfiguration().length() > MAX_CONFIGURATION_LENGTH) {
            return "configuration length must be <= " + MAX_CONFIGURATION_LENGTH + ", got " + skill.getConfiguration().length();
        }
        return null;
    }

    /**
     * metaSchemaVersion 校验。匹配返回 null，不匹配返回错误消息。
     */
    public static String validateMetaSchemaVersion(String version) {
        if (version == null || version.trim().isEmpty()) {
            return "missing-meta-schema-version: required = " + SkillImportRequest.SUPPORTED_META_SCHEMA_VERSION;
        }
        if (!SkillImportRequest.SUPPORTED_META_SCHEMA_VERSION.equals(version)) {
            return "unsupported-meta-schema-version: supported = "
                    + SkillImportRequest.SUPPORTED_META_SCHEMA_VERSION + ", got = " + version;
        }
        return null;
    }

    /**
     * 系统种子保护。非 admin 用户尝试导入 createdBy="public" 时返回错误消息，admin 通过返回 null。
     */
    public static String validateNotSystemSeed(String payloadCreatedBy, String userId) {
        if (SkillService.PLATFORM_PUBLIC_AUTHOR.equals(payloadCreatedBy)
                && !SkillService.SKILL_PLATFORM_ADMIN_USER_ID.equals(userId)) {
            return "importing a system seed Skill (createdBy=public) is not allowed for non-admin users";
        }
        return null;
    }
}