package com.lobsterai.skillgateway.dto;

/**
 * Minimal EXTENSION skill row for Skill availability UI (id stable for agent-core filtering).
 */
public class SkillOptionDto {
    public long id;
    public String name;
    public String description;

    public SkillOptionDto() {
    }

    public SkillOptionDto(long id, String name, String description) {
        this.id = id;
        this.name = name;
        this.description = description != null ? description : "";
    }
}
