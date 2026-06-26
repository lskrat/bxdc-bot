package com.lobsterai.skillgateway.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.lobsterai.skillgateway.entity.Skill;

import java.time.LocalDateTime;

/**
 * Skill 创建请求包装类（20260625，add-skill-import-export 需求）。
 *
 * <p>设计动机：</p>
 * <ul>
 *   <li>原 {@code POST /api/skills} 入参为 {@code Skill} 实体，agent-core 透传扁平 JSON。</li>
 *   <li>新增导入场景需要携带 {@code importPayload}（metaSchemaVersion + payload），但**不能破坏** agent-core 现有调用方式。</li>
 *   <li>本包装类直接把 Skill 字段复制到顶层 + 新增可选 {@code importPayload} 字段，旧客户端仍发扁平 Skill 字段，
 *       新客户端可附加 {@code importPayload}。Jackson 反序列化时同名字段一一映射。</li>
 * </ul>
 *
 * <p>字段说明：</p>
 * <ul>
 *   <li>14 个 Skill 字段（id, name, description, type, configuration, executionMode, avatar,
 *       createdBy, teamId, introMd, skillOwnerType, createdAt, updatedAt, schemaPropertiesJson）</li>
 *   <li>{@code importPayload} - 可选，存在即走导入分支；为 null 即走原 Skill 创建流程（向后兼容）</li>
 * </ul>
 *
 * <p>向后兼容性：</p>
 * <pre>
 * // 旧客户端（agent-core + SkillHub）
 * POST /api/skills
 * { "name": "...", "type": "...", "configuration": "..." }
 *
 * // 新客户端（SkillImportDialog）
 * POST /api/skills
 * { "name": "...", "type": "...", "configuration": "...",
 *   "importPayload": { "metaSchemaVersion": "1.0.0", "payload": {...} } }
 * </pre>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
// 容忍 14 字段之外的 Skill 字段（如 enabled / requiresConfirmation / visibility / templatePlaceholders），
// 不阻断 SkillImportDialog 调 createSkill 时一并发出这些字段的场景。
@JsonIgnoreProperties(ignoreUnknown = true)
public class SkillImportWrapper {

    // --- Skill 字段（与 entity/Skill.java 一一对应） ---

    private Long id;

    private String name;

    private String description;

    private String type;

    private String configuration;

    private String executionMode;

    private String avatar;

    private String createdBy;

    private String teamId;

    private String introMd;

    private Integer skillOwnerType;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime createdAt;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime updatedAt;

    private String schemaPropertiesJson;

    // --- 导入专属字段 ---

    /**
     * 导入元数据。可选；为 null 时按"普通创建 Skill"处理。
     */
    private SkillImportRequest importPayload;

    // --- getters / setters ---

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getConfiguration() { return configuration; }
    public void setConfiguration(String configuration) { this.configuration = configuration; }

    public String getExecutionMode() { return executionMode; }
    public void setExecutionMode(String executionMode) { this.executionMode = executionMode; }

    public String getAvatar() { return avatar; }
    public void setAvatar(String avatar) { this.avatar = avatar; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public String getTeamId() { return teamId; }
    public void setTeamId(String teamId) { this.teamId = teamId; }

    public String getIntroMd() { return introMd; }
    public void setIntroMd(String introMd) { this.introMd = introMd; }

    public Integer getSkillOwnerType() { return skillOwnerType; }
    public void setSkillOwnerType(Integer skillOwnerType) { this.skillOwnerType = skillOwnerType; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public String getSchemaPropertiesJson() { return schemaPropertiesJson; }
    public void setSchemaPropertiesJson(String schemaPropertiesJson) { this.schemaPropertiesJson = schemaPropertiesJson; }

    public SkillImportRequest getImportPayload() { return importPayload; }
    public void setImportPayload(SkillImportRequest importPayload) { this.importPayload = importPayload; }

    /**
     * 把 wrapper 14 个字段映射为 Skill 实体。
     * Controller 在 createSkill 入口调用。
     * 字段值与 {@link Skill} 一一对应；null 字段保持 null（MyBatis-Plus 在 INSERT 时会忽略 null）。
     */
    public Skill toSkill() {
        Skill skill = new Skill();
        skill.setId(this.id);
        skill.setName(this.name);
        skill.setDescription(this.description);
        skill.setType(this.type);
        skill.setConfiguration(this.configuration);
        skill.setExecutionMode(this.executionMode);
        skill.setAvatar(this.avatar);
        skill.setCreatedBy(this.createdBy);
        skill.setTeamId(this.teamId);
        skill.setIntroMd(this.introMd);
        skill.setSkillOwnerType(this.skillOwnerType);
        skill.setCreatedAt(this.createdAt);
        skill.setUpdatedAt(this.updatedAt);
        skill.setSchemaPropertiesJson(this.schemaPropertiesJson);
        return skill;
    }
}