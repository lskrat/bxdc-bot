package com.lobsterai.skillgateway.dto;

import java.util.List;

public class SkillAvailabilityUpdateRequest {
    /** Gateway DB skill ids (string form) that the user disables for Agent tool binding. */
    public List<String> disabledSkillIds;
}
