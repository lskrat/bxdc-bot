package com.lobsterai.skillgateway.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * 平台系统级 Built-in Skill（与 {@code skills} 扩展表分离）。
 */
@Entity
@Table(name = "system_skills")
public class SystemSkill {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 与 agent 工具名一致，如 api_caller、compute、ssh_executor */
    @Column(name = "tool_name", nullable = false, unique = true, length = 128)
    private String toolName;

    @Column(columnDefinition = "TEXT")
    private String description;

    /**
     * 执行分类：API_PROXY、COMPUTE、SSH_EXECUTOR（与 {@link com.lobsterai.skillgateway.service.SystemSkillService} 对齐）。
     */
    @Column(nullable = false, length = 32)
    private String kind;

    /** 可选 JSON，预留扩展 */
    @Column(columnDefinition = "TEXT")
    private String configuration;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "schema_version")
    private int schemaVersion = 1;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public SystemSkill() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getToolName() {
        return toolName;
    }

    public void setToolName(String toolName) {
        this.toolName = toolName;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public String getConfiguration() {
        return configuration;
    }

    public void setConfiguration(String configuration) {
        this.configuration = configuration;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(int schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
