package com.lobsterai.skillgateway.service;

import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.entity.SkillVisibility;
import com.lobsterai.skillgateway.repository.SkillRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class SkillService {

    /** 平台公共种子 / Built-in 对应行的创建者标识（与 spec 一致） */
    public static final String PLATFORM_PUBLIC_AUTHOR = "public";

    /** 可写 {@code createdBy=public} 平台行的固定管理员用户 ID（与 X-User-Id 字符串比较，非配置项） */
    public static final String SKILL_PLATFORM_ADMIN_USER_ID = "890728";

    private final SkillRepository skillRepository;
    private final ObjectMapper objectMapper;

    public SkillService(SkillRepository skillRepository, ObjectMapper objectMapper) {
        this.skillRepository = skillRepository;
        this.objectMapper = objectMapper;
    }

    public List<Skill> listSkillsForUser(String userId) {
        if (userId == null || userId.isBlank()) {
            return skillRepository.findAllPublicSummary(SkillVisibility.PUBLIC);
        }
        return skillRepository.findVisibleSummaryForUser(SkillVisibility.PUBLIC, SkillVisibility.PRIVATE, userId);
    }

    public Optional<Skill> getSkillByIdForUser(Long id, String userId) {
        return skillRepository.findById(id).filter(skill -> canViewSkill(skill, userId));
    }

    public Optional<Skill> getSkillByName(String name) {
        return skillRepository.findByName(name);
    }

    public Skill createSkill(Skill skill, String userId) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("X-User-Id is required");
        }
        if (skillRepository.findByName(skill.getName()).isPresent()) {
            throw new IllegalArgumentException("Skill with name " + skill.getName() + " already exists");
        }
        skill.setCreatedBy(userId);
        if (skill.getVisibility() == null) {
            skill.setVisibility(SkillVisibility.PRIVATE);
        }
        skill.setExecutionMode(normalizeExecutionMode(skill.getExecutionMode()));
        skill.setConfiguration(normalizeAndValidateConfiguration(skill.getExecutionMode(), skill.getConfiguration()));
        return skillRepository.save(skill);
    }

    public Skill updateSkill(Long id, Skill skillDetails, String userId) {
        Skill skill = skillRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Skill not found for this id :: " + id));
        if (!canWriteSkill(skill, userId)) {
            throw new IllegalArgumentException("Skill not found for this id :: " + id);
        }

        skill.setName(skillDetails.getName());
        skill.setDescription(skillDetails.getDescription());
        skill.setType(skillDetails.getType());
        skill.setExecutionMode(normalizeExecutionMode(skillDetails.getExecutionMode()));
        skill.setConfiguration(normalizeAndValidateConfiguration(skill.getExecutionMode(), skillDetails.getConfiguration()));
        skill.setEnabled(skillDetails.isEnabled());
        skill.setRequiresConfirmation(skillDetails.isRequiresConfirmation());
        if (skillDetails.getVisibility() != null) {
            skill.setVisibility(skillDetails.getVisibility());
        }

        return skillRepository.save(skill);
    }

    public void deleteSkill(Long id, String userId) {
        Skill skill = skillRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Skill not found for this id :: " + id));
        if (!canWriteSkill(skill, userId)) {
            throw new IllegalArgumentException("Skill not found for this id :: " + id);
        }
        skillRepository.delete(skill);
    }

    private static boolean canViewSkill(Skill skill, String userId) {
        if (skill.getVisibility() == SkillVisibility.PUBLIC) {
            return true;
        }
        if (userId == null || userId.isBlank()) {
            return false;
        }
        return userId.equals(skill.getCreatedBy());
    }

    private static boolean canWriteSkill(Skill skill, String userId) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        if (skill.getVisibility() == SkillVisibility.PRIVATE) {
            return userId.equals(skill.getCreatedBy());
        }
        // PUBLIC: only creator, except platform rows (createdBy=public) editable by fixed admin id only
        if (PLATFORM_PUBLIC_AUTHOR.equals(skill.getCreatedBy())) {
            return SKILL_PLATFORM_ADMIN_USER_ID.equals(userId);
        }
        return userId.equals(skill.getCreatedBy());
    }

    private static String normalizeExecutionMode(String executionMode) {
        if (executionMode == null || executionMode.isBlank()) {
            return "CONFIG";
        }

        String normalized = executionMode.trim().toUpperCase();
        return switch (normalized) {
            case "CONFIG", "OPENCLAW" -> normalized;
            default -> throw new IllegalArgumentException("Unsupported executionMode: " + executionMode);
        };
    }

    private String normalizeAndValidateConfiguration(String executionMode, String configuration) {
        if (configuration == null || configuration.isBlank()) {
            throw new IllegalArgumentException("configuration is required");
        }

        final JsonNode root;
        try {
            root = objectMapper.readTree(configuration);
        } catch (Exception e) {
            throw new IllegalArgumentException("configuration must be valid JSON");
        }

        if (root == null || !root.isObject()) {
            throw new IllegalArgumentException("configuration must be a JSON object");
        }

        if ("OPENCLAW".equals(executionMode)) {
            validateOpenClawConfiguration(root);
            return root.toString();
        }

        ObjectNode normalized = normalizeConfigConfiguration((ObjectNode) root);
        validateConfigConfiguration(normalized);
        return normalized.toString();
    }

    private ObjectNode normalizeConfigConfiguration(ObjectNode root) {
        String kind = requiredText(root, "kind");
        ObjectNode normalized = root.deepCopy();
        String preset = readOptionalPreset(normalized);

        switch (kind) {
            case "time" -> {
                normalized.put("kind", "api");
                normalized.put("preset", "current-time");
                return normalized;
            }
            case "monitor" -> {
                normalized.put("kind", "ssh");
                normalized.put("preset", "server-resource-status");
                return normalized;
            }
            case "api", "ssh" -> {
                normalized.put("kind", kind);
                if (preset != null && !preset.isBlank()) {
                    normalized.put("preset", preset);
                }
                normalized.remove("profile");
                return normalized;
            }
            case "template" -> {
                normalized.put("kind", "template");
                return normalized;
            }
            default -> throw new IllegalArgumentException("Unsupported CONFIG kind: " + kind);
        }
    }

    private static String readOptionalPreset(ObjectNode root) {
        JsonNode preset = root.get("preset");
        if (preset != null && !preset.isNull()) {
            if (!preset.isTextual()) {
                throw new IllegalArgumentException("preset must be a string when provided");
            }
            return preset.asText();
        }

        JsonNode profile = root.get("profile");
        if (profile != null && !profile.isNull()) {
            if (!profile.isTextual()) {
                throw new IllegalArgumentException("profile must be a string when provided");
            }
            return profile.asText();
        }
        return null;
    }

    private static void validateConfigConfiguration(JsonNode root) {
        String kind = requiredText(root, "kind");
        if ("openclaw".equals(kind)) {
            throw new IllegalArgumentException("CONFIG executionMode cannot use openclaw configuration");
        }

        switch (kind) {
            case "api" -> {
                requiredText(root, "operation");
                requiredText(root, "method");
                requiredText(root, "endpoint");
                optionalText(root, "preset");
                optionalText(root, "responseTimestampField");
                optionalText(root, "interfaceDescription");
            }
            case "ssh" -> {
                requiredText(root, "operation");
                requiredText(root, "lookup");
                requiredText(root, "executor");
                requiredText(root, "command");
                optionalText(root, "preset");
                optionalBoolean(root, "readOnly");
            }
            case "template" -> {
                requiredText(root, "prompt");
            }
            case "time", "monitor" -> throw new IllegalArgumentException(
                    "Legacy CONFIG kind is no longer accepted directly. Use canonical kind api/ssh."
            );
            default -> throw new IllegalArgumentException("Unsupported CONFIG kind: " + kind);
        }
    }

    private static void validateOpenClawConfiguration(JsonNode root) {
        String kind = requiredText(root, "kind");
        if (!"openclaw".equals(kind)) {
            throw new IllegalArgumentException("OPENCLAW executionMode requires kind=openclaw");
        }

        requiredText(root, "systemPrompt");

        JsonNode allowedTools = root.get("allowedTools");
        if (allowedTools != null && !allowedTools.isNull()) {
            if (!allowedTools.isArray()) {
                throw new IllegalArgumentException("allowedTools must be an array when provided");
            }
            for (JsonNode tool : allowedTools) {
                if (!tool.isTextual() || tool.asText().isBlank()) {
                    throw new IllegalArgumentException("allowedTools entries must be non-empty strings");
                }
            }
        }

        JsonNode orchestration = root.get("orchestration");
        if (orchestration == null || !orchestration.isObject()) {
            throw new IllegalArgumentException("OPENCLAW configuration requires orchestration object");
        }
        String mode = requiredText(orchestration, "mode");
        if (!"serial".equals(mode)) {
            throw new IllegalArgumentException("OPENCLAW orchestration.mode must be serial");
        }
    }

    private static String requiredText(JsonNode node, String fieldName) {
        JsonNode value = node.get(fieldName);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw new IllegalArgumentException(fieldName + " is required");
        }
        return value.asText();
    }

    private static void optionalText(JsonNode node, String fieldName) {
        JsonNode value = node.get(fieldName);
        if (value != null && !value.isNull() && !value.isTextual()) {
            throw new IllegalArgumentException(fieldName + " must be a string when provided");
        }
    }

    private static void optionalBoolean(JsonNode node, String fieldName) {
        JsonNode value = node.get(fieldName);
        if (value != null && !value.isNull() && !value.isBoolean()) {
            throw new IllegalArgumentException(fieldName + " must be a boolean when provided");
        }
    }
}
