package com.lobsterai.skillgateway.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User {
    @Id
    private String id; // 6-digit ID

    private String nickname;
    private String avatar; // Emoji
    private LocalDateTime createdAt;

    /** OpenAI-compatible API base URL; optional per-user override. */
    @Column(length = 512)
    private String llmApiBase;

    @Column(length = 128)
    private String llmModelName;

    /** Stored in plaintext (v1); never serialized to JSON for clients. */
    @JsonIgnore
    @Column(length = 2048)
    private String llmApiKey;

    /**
     * JSON array of stringified numeric ids for EXTENSION skills the user disabled (e.g. {@code ["1","2"]}).
     */
    @JsonIgnore
    @Column(name = "disabled_extended_skill_ids", length = 4000)
    private String disabledExtendedSkillIdsJson;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getNickname() {
        return nickname;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
    }

    public String getAvatar() {
        return avatar;
    }

    public void setAvatar(String avatar) {
        this.avatar = avatar;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public String getLlmApiBase() {
        return llmApiBase;
    }

    public void setLlmApiBase(String llmApiBase) {
        this.llmApiBase = llmApiBase;
    }

    public String getLlmModelName() {
        return llmModelName;
    }

    public void setLlmModelName(String llmModelName) {
        this.llmModelName = llmModelName;
    }

    public String getLlmApiKey() {
        return llmApiKey;
    }

    public void setLlmApiKey(String llmApiKey) {
        this.llmApiKey = llmApiKey;
    }

    public String getDisabledExtendedSkillIdsJson() {
        return disabledExtendedSkillIdsJson;
    }

    public void setDisabledExtendedSkillIdsJson(String disabledExtendedSkillIdsJson) {
        this.disabledExtendedSkillIdsJson = disabledExtendedSkillIdsJson;
    }
}
