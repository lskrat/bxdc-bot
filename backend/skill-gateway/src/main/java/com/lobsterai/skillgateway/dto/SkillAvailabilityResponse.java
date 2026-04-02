package com.lobsterai.skillgateway.dto;

import java.util.List;

public class SkillAvailabilityResponse {
    public List<String> disabledSkillIds;
    public List<SkillOptionDto> skills;

    public SkillAvailabilityResponse() {
    }

    public SkillAvailabilityResponse(List<String> disabledSkillIds, List<SkillOptionDto> skills) {
        this.disabledSkillIds = disabledSkillIds;
        this.skills = skills;
    }
}
