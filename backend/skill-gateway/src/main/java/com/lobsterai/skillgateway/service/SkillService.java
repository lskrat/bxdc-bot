package com.lobsterai.skillgateway.service;

import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.entity.SkillVisibility;
import com.lobsterai.skillgateway.entity.User;
import com.lobsterai.skillgateway.entity.UserTeam;
import com.lobsterai.skillgateway.http.LlmHttpClient;
import com.lobsterai.skillgateway.mapper.SkillMapper;
import com.lobsterai.skillgateway.mapper.UserMapper;
import com.lobsterai.skillgateway.mapper.UserTeamMapper;
import com.lobsterai.skillgateway.util.StringUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class SkillService {

    private static final Logger log = LoggerFactory.getLogger(SkillService.class);

    /** 平台公共种子 / Built-in 对应行的创建者标识（与 spec 一致） */
    public static final String PLATFORM_PUBLIC_AUTHOR = "public";

    /** 可写 {@code createdBy=public} 平台行的固定管理员用户 ID（与 X-User-Id 字符串比较，非配置项） */
    public static final String SKILL_PLATFORM_ADMIN_USER_ID = "890728";

    private final SkillMapper skillMapper;
    private final ObjectMapper objectMapper;
    private final UserTeamMapper userTeamMapper;
    private final UserMapper userMapper;
    private final LlmHttpClient llmHttpClient;
    private final ExternalServiceSkillExecutor externalServiceSkillExecutor;
    private final ExternalServiceRegistry externalServiceRegistry;

    public SkillService(SkillMapper skillMapper, ObjectMapper objectMapper, UserTeamMapper userTeamMapper,
                       UserMapper userMapper, LlmHttpClient llmHttpClient,
                       ExternalServiceSkillExecutor externalServiceSkillExecutor,
                       ExternalServiceRegistry externalServiceRegistry) {
        this.skillMapper = skillMapper;
        this.objectMapper = objectMapper;
        this.userTeamMapper = userTeamMapper;
        this.userMapper = userMapper;
        this.llmHttpClient = llmHttpClient;
        this.externalServiceSkillExecutor = externalServiceSkillExecutor;
        this.externalServiceRegistry = externalServiceRegistry;
    }

    public List<Skill> listSkillsForUser(String userId) {
        return listSkillsForUser(userId, null);
    }

    /**
     * 按用户可见性 + 可选所有者类型查询技能
     * @param userId 当前用户 ID
     * @param ownerType 可选，1: 用户技能, 2: 系统技能；null=不过滤
     */
    public List<Skill> listSkillsForUser(String userId, Integer ownerType) {
        if (ownerType != null) {
            return skillMapper.findVisibleSummaryForUserByOwnerType(userId, ownerType);
        }
        if (userId == null || StringUtils.isBlank(userId)) {
            return skillMapper.findAllPublicSummary();
        }
        return skillMapper.findVisibleSummaryForUser(userId);
    }

    /**
     * 按技能所有者类型查询技能
     * @param ownerType 1: 用户技能, 2: 系统技能
     */
    public List<Skill> listSkillsByOwnerType(Integer ownerType) {
        return skillMapper.findBySkillOwnerTypeAndEnabledIsTrue(ownerType);
    }

    /**
     * 按 ID 列表查询该用户可见且 enabled=true 的技能（主 Agent 加载会话勾选技能用）。
     * @param userId 当前用户 ID（用于可见性过滤）
     * @param ids 会话表 enabled_skills 解析出的 skillId 列表；null/空则返回空列表
     */
    public List<Skill> listEnabledSkillsForUserByIds(String userId, List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyList();
        }
        return skillMapper.findVisibleEnabledSummaryForUserByIds(userId, ids);
    }

    public Optional<Skill> getSkillByIdForUser(Long id, String userId) {
        Skill skill = skillMapper.selectById(id);
        if (skill == null || !canViewSkill(skill, userId)) {
            return Optional.empty();
        }
        return Optional.of(skill);
    }

    public Optional<Skill> getSkillByName(String name) {
        return skillMapper.findByName(name);
    }

    public Skill createSkill(Skill skill, String userId) {
        if (userId == null || StringUtils.isBlank(userId)) {
            throw new IllegalArgumentException("X-User-Id is required");
        }
        if (skillMapper.findByName(skill.getName()).isPresent()) {
            throw new IllegalArgumentException("Skill with name " + skill.getName() + " already exists");
        }
        // external-service-skill：kind=external 时 FK 校验 serviceName
        validateExternalKindIfPresent(skill);
        skill.setCreatedBy(userId);
        if (skill.getVisibility() == null) {
            skill.setVisibility(SkillVisibility.PRIVATE);
        }
        // 用户创建的技能默认归为「用户技能」（skill_owner_type=1），把隐式 DB DEFAULT 显式化为代码契约。
        if (skill.getSkillOwnerType() == null) {
            skill.setSkillOwnerType(1);
        }

        if (SkillVisibility.TEAM.equals(skill.getVisibility())) {
            if (skill.getTeamId() == null || skill.getTeamId().trim().isEmpty()) {
                throw new IllegalArgumentException("TEAM visibility requires a team_id");
            }
            String[] teamIdArray = skill.getTeamId().split(",");
            boolean validTeamFound = false;
            for (String teamIdStr : teamIdArray) {
                String trimmed = teamIdStr.trim();
                if (!trimmed.isEmpty()) {
                    try {
                        Long teamId = Long.parseLong(trimmed);
                        if (!userTeamMapper.exists(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<UserTeam>()
                                .eq(UserTeam::getId, teamId)
                                .eq(UserTeam::getIsDeleted, 0))) {
                            throw new IllegalArgumentException("Team not found: " + teamId);
                        }
                        validTeamFound = true;
                    } catch (NumberFormatException e) {
                        throw new IllegalArgumentException("Invalid team_id format: " + trimmed);
                    }
                }
            }
            if (!validTeamFound) {
                throw new IllegalArgumentException("TEAM visibility requires at least one valid team_id");
            }
            if (!isUserInTeam(userId, skill.getTeamId())) {
                throw new IllegalArgumentException("User is not a member of any specified team");
            }
        } else {
            skill.setTeamId(null);
        }

        validateSkillAvatar(skill.getAvatar());
        skill.setExecutionMode(normalizeExecutionMode(skill.getExecutionMode()));
        skill.setConfiguration(normalizeAndValidateConfiguration(skill.getExecutionMode(), skill.getConfiguration()));
        persistSchemaProperties(skill);
        skillMapper.insert(skill);
        return skill;
    }

    public Skill updateSkill(Long id, Skill skillDetails, String userId) {
        Skill skill = skillMapper.selectById(id);
        if (skill == null) {
            throw new IllegalArgumentException("Skill not found for this id :: " + id);
        }
        if (!canWriteSkill(skill, userId)) {
            throw new IllegalArgumentException("Skill not found for this id :: " + id);
        }

        skill.setName(skillDetails.getName());
        skill.setDescription(skillDetails.getDescription());
        skill.setType(skillDetails.getType());
        skill.setExecutionMode(normalizeExecutionMode(skillDetails.getExecutionMode()));
        skill.setConfiguration(normalizeAndValidateConfiguration(skill.getExecutionMode(), skillDetails.getConfiguration()));
        persistSchemaProperties(skill);
        skill.setEnabled(skillDetails.isEnabled());
        skill.setRequiresConfirmation(skillDetails.isRequiresConfirmation());
        if (skillDetails.getVisibility() != null) {
            skill.setVisibility(skillDetails.getVisibility());

            if (SkillVisibility.TEAM.equals(skillDetails.getVisibility())) {
                if (skillDetails.getTeamId() == null || skillDetails.getTeamId().trim().isEmpty()) {
                    throw new IllegalArgumentException("TEAM visibility requires a team_id");
                }
                String[] teamIdArray = skillDetails.getTeamId().split(",");
                boolean validTeamFound = false;
                for (String teamIdStr : teamIdArray) {
                    String trimmed = teamIdStr.trim();
                    if (!trimmed.isEmpty()) {
                        try {
                            Long teamId = Long.parseLong(trimmed);
                            if (!userTeamMapper.exists(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<UserTeam>()
                                    .eq(UserTeam::getId, teamId)
                                    .eq(UserTeam::getIsDeleted, 0))) {
                                throw new IllegalArgumentException("Team not found: " + teamId);
                            }
                            validTeamFound = true;
                        } catch (NumberFormatException e) {
                            throw new IllegalArgumentException("Invalid team_id format: " + trimmed);
                        }
                    }
                }
                if (!validTeamFound) {
                    throw new IllegalArgumentException("TEAM visibility requires at least one valid team_id");
                }
                skill.setTeamId(skillDetails.getTeamId());
            } else {
                skill.setTeamId(null);
            }
        }
        if (skillDetails.getVisibility() == null && SkillVisibility.TEAM.equals(skill.getVisibility()) && skillDetails.getTeamId() != null && !skillDetails.getTeamId().trim().isEmpty()) {
            skill.setTeamId(skillDetails.getTeamId());
        }
        // Only touch avatar when the client sends a value. Omitted / null must preserve the stored emoji
        // (e.g. toggle enabled sends a partial body; JSON.stringify drops undefined → Jackson null).
        if (skillDetails.getAvatar() != null) {
            validateSkillAvatar(skillDetails.getAvatar());
            String trimmed = skillDetails.getAvatar().trim();
            skill.setAvatar(trimmed.isEmpty() ? null : trimmed);
        }

        skillMapper.updateById(skill);
        return skill;
    }

    public void deleteSkill(Long id, String userId) {
        Skill skill = skillMapper.selectById(id);
        if (skill == null) {
            throw new IllegalArgumentException("Skill not found for this id :: " + id);
        }
        if (!canWriteSkill(skill, userId)) {
            throw new IllegalArgumentException("Skill not found for this id :: " + id);
        }
        skillMapper.deleteById(id);
    }

    /**
     * Compute schema properties from the skill's configuration JSON
     * and persist them to the schema_properties DB column.
     */
    private void persistSchemaProperties(Skill skill) {
        try {
            String config = skill.getConfiguration();
            if (config == null || config.isEmpty()) {
                skill.setSchemaPropertiesJson(null);
                return;
            }
            java.util.Map<String, java.util.Map<String, Object>> props =
                Skill.computeSchemaPropertiesInternal(config);

            // external-service-skill 设计决策 11：kind=external 时 computeSchemaPropertiesInternal
            // 返回 null 哨兵值，由本方法调用 ExternalServiceSkillExecutor.deriveSchemaProperties() 派生
            if (props == null) {
                String kind = parseKind(config);
                if ("external".equals(kind) && externalServiceSkillExecutor != null) {
                    java.util.Map<String, Object> externalProps =
                            externalServiceSkillExecutor.deriveSchemaProperties(skill);
                    @SuppressWarnings("unchecked")
                    java.util.Map<String, java.util.Map<String, Object>> properties =
                            (java.util.Map<String, java.util.Map<String, Object>>) externalProps.get("properties");
                    if (properties == null || properties.isEmpty()) {
                        skill.setSchemaPropertiesJson(null);
                        return;
                    }
                    skill.setSchemaPropertiesJson(objectMapper.writeValueAsString(properties));
                }
                return;
            }

            if (props.isEmpty()) {
                skill.setSchemaPropertiesJson(null);
                return;
            }
            skill.setSchemaPropertiesJson(objectMapper.writeValueAsString(props));
        } catch (Exception e) {
            skill.setSchemaPropertiesJson(null);
        }
    }

    /**
     * 解析 configuration.kind（供 persistSchemaProperties 使用）。
     */
    private String parseKind(String config) {
        try {
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> cfg = objectMapper.readValue(config,
                    new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
            return (String) cfg.get("kind");
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * external-service-skill：kind=external 时 FK 校验 serviceName 存在 + 启用。
     * 仅对 kind=external 触发（其他 kind 不进此分支）；空数据时由 registry.assertExists 抛出可读 IllegalArgumentException。
     */
    private void validateExternalKindIfPresent(Skill skill) {
        if (skill == null || skill.getConfiguration() == null) {
            return;
        }
        String kind = parseKind(skill.getConfiguration());
        if (!"external".equals(kind)) {
            return; // 其它 kind 完全不进此分支，原有逻辑零变化
        }
        if (externalServiceRegistry == null) {
            throw new IllegalStateException("ExternalServiceRegistry not available");
        }
        String serviceName;
        try {
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> cfg = objectMapper.readValue(skill.getConfiguration(),
                    new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
            serviceName = (String) cfg.get("serviceName");
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid configuration JSON: " + e.getMessage());
        }
        if (serviceName == null || serviceName.trim().isEmpty()) {
            throw new IllegalArgumentException("serviceName is required for kind=external");
        }
        externalServiceRegistry.assertExists(serviceName);
    }

    /** Optional emoji; when set, same length bound as user avatar. */
    private static void validateSkillAvatar(String avatar) {
        if (avatar == null || StringUtils.isBlank(avatar)) {
            return;
        }
        String t = avatar.trim();
        if (t.length() > 32) {
            throw new IllegalArgumentException("Skill avatar is too long.");
        }
    }

    private boolean canViewSkill(Skill skill, String userId) {
        if (skill.getVisibility() == SkillVisibility.PUBLIC) {
            return true;
        }
        if (userId == null || StringUtils.isBlank(userId)) {
            return false;
        }
        if (skill.getVisibility() == SkillVisibility.PRIVATE) {
            return userId.equals(skill.getCreatedBy());
        }
        if (skill.getVisibility() == SkillVisibility.TEAM && skill.getTeamId() != null) {
            return isUserInTeam(userId, skill.getTeamId());
        }
        return userId.equals(skill.getCreatedBy());
    }

    private boolean canWriteSkill(Skill skill, String userId) {
        if (userId == null || StringUtils.isBlank(userId)) {
            return false;
        }
        if (skill.getVisibility() == SkillVisibility.PRIVATE) {
            return userId.equals(skill.getCreatedBy());
        }
        if (PLATFORM_PUBLIC_AUTHOR.equals(skill.getCreatedBy())) {
            return SKILL_PLATFORM_ADMIN_USER_ID.equals(userId);
        }
        if (skill.getVisibility() == SkillVisibility.TEAM) {
            if (userId.equals(skill.getCreatedBy())) {
                return true;
            }
            return isUserTeamCreator(userId, skill.getTeamId());
        }
        return userId.equals(skill.getCreatedBy());
    }

    private boolean isUserInTeam(String userId, String teamIds) {
        if (teamIds == null || teamIds.isEmpty()) {
            return false;
        }
        String[] teamIdArray = teamIds.split(",");
        for (String teamIdStr : teamIdArray) {
            String trimmed = teamIdStr.trim();
            if (!trimmed.isEmpty()) {
                try {
                    Long teamId = Long.parseLong(trimmed);
                    if (userTeamMapper.findById(teamId)
                            .map(team -> {
                                String members = team.getMembers();
                                return members != null && members.contains(userId);
                            })
                            .orElse(false)) {
                        return true;
                    }
                } catch (NumberFormatException e) {
                    // ignore invalid teamId
                }
            }
        }
        return false;
    }

    private boolean isUserTeamCreator(String userId, String teamIds) {
        if (teamIds == null || teamIds.isEmpty()) {
            return false;
        }
        String[] teamIdArray = teamIds.split(",");
        for (String teamIdStr : teamIdArray) {
            String trimmed = teamIdStr.trim();
            if (!trimmed.isEmpty()) {
                try {
                    Long teamId = Long.parseLong(trimmed);
                    if (userTeamMapper.findById(teamId)
                            .map(team -> userId.equals(team.getCreatorId()))
                            .orElse(false)) {
                        return true;
                    }
                } catch (NumberFormatException e) {
                    // ignore invalid teamId
                }
            }
        }
        return false;
    }

    private static String normalizeExecutionMode(String executionMode) {
        if (executionMode == null || StringUtils.isBlank(executionMode)) {
            return "CONFIG";
        }

        String normalized = executionMode.trim().toUpperCase();
        if ("CONFIG".equals(normalized) || "OPENCLAW".equals(normalized)) {
            return normalized;
        }
        throw new IllegalArgumentException("Unsupported executionMode: " + executionMode);
    }

    private String normalizeAndValidateConfiguration(String executionMode, String configuration) {
        if (configuration == null || StringUtils.isBlank(configuration)) {
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
            case "time":
                normalized.put("kind", "api");
                normalized.put("preset", "current-time");
                return normalized;
            case "monitor":
                normalized.put("kind", "ssh");
                normalized.put("preset", "server-resource-status");
                return normalized;
            case "api":
            case "ssh":
                normalized.put("kind", kind);
                if (preset != null && !StringUtils.isBlank(preset)) {
                    normalized.put("preset", preset);
                }
                normalized.remove("profile");
                return normalized;
            case "template":
                normalized.put("kind", "template");
                return normalized;
            case "python":
                normalized.put("kind", "python");
                return normalized;
            case "external":
                normalized.put("kind", "external");
                return normalized;
            default:
                throw new IllegalArgumentException("Unsupported CONFIG kind: " + kind);
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
            case "api":
                requiredText(root, "operation");
                requiredText(root, "method");
                requiredText(root, "endpoint");
                optionalText(root, "preset");
                optionalText(root, "responseTimestampField");
                optionalText(root, "interfaceDescription");
                break;
            case "ssh":
                requiredText(root, "operation");
                requiredText(root, "lookup");
                requiredText(root, "executor");
                requiredText(root, "command");
                optionalText(root, "preset");
                optionalBoolean(root, "readOnly");
                break;
            case "template":
                requiredText(root, "prompt");
                break;
            case "python":
                requiredText(root, "sandboxName");
                requiredText(root, "code");
                requiredText(root, "operation");
                optionalText(root, "interfaceDescription");
                break;
            case "external":
                requiredText(root, "serviceName");
                optionalText(root, "interfaceDescription");
                break;
            case "time":
            case "monitor":
                throw new IllegalArgumentException(
                        "Legacy CONFIG kind is no longer accepted directly. Use canonical kind api/ssh."
                );
            default:
                throw new IllegalArgumentException("Unsupported CONFIG kind: " + kind);
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
                if (!tool.isTextual() || StringUtils.isBlank(tool.asText())) {
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
        if (value == null || !value.isTextual() || StringUtils.isBlank(value.asText())) {
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

    public Skill updateSkillIntroMd(Long id, String introMd, String userId) {
        Skill skill = skillMapper.selectById(id);
        if (skill == null) {
            throw new IllegalArgumentException("Skill not found for this id :: " + id);
        }
        if (!canWriteSkill(skill, userId)) {
            throw new IllegalArgumentException("Skill not found for this id :: " + id);
        }
        skill.setIntroMd(introMd);
        skillMapper.updateById(skill);
        return skill;
    }

    public Skill generateIntro(String userId, Skill skill) {
        if (userId == null || StringUtils.isBlank(userId)) {
            throw new IllegalArgumentException("X-User-Id is required");
        }
        if (skill.getId() != null) {
            Skill existing = skillMapper.selectById(skill.getId());
            if (existing != null && !canWriteSkill(existing, userId)) {
                throw new IllegalArgumentException("Skill not found or not authorized");
            }
        }

        User user = userMapper.selectById(userId);
        Map<String, String> llmConfig = getLlmConfig(user);
        if (llmConfig == null || llmConfig.get("llmApiKey") == null || llmConfig.get("llmApiKey").isEmpty()) {
            throw new IllegalArgumentException("LLM API key not configured");
        }

        String skillJson;
        try {
            skillJson = objectMapper.writeValueAsString(skill);
        } catch (Exception e) {
            throw new IllegalArgumentException("Failed to serialize skill: " + e.getMessage());
        }

        String generatedIntro = callLlmForSkillIntro(skillJson, llmConfig);
        skill.setIntroMd(generatedIntro);

        if (skill.getId() != null) {
            skillMapper.updateById(skill);
        }
        return skill;
    }

    private Map<String, String> getLlmConfig(User user) {
        Map<String, String> config = new LinkedHashMap<>();

        if (user != null && user.getLlmApiBase() != null && !user.getLlmApiBase().trim().isEmpty()) {
            config.put("llmApiBase", user.getLlmApiBase().trim());
        }
        if (user != null && user.getLlmModelName() != null && !user.getLlmModelName().trim().isEmpty()) {
            config.put("llmModelName", user.getLlmModelName().trim());
        }
        if (user != null && user.getLlmApiKey() != null && !user.getLlmApiKey().trim().isEmpty()) {
            config.put("llmApiKey", user.getLlmApiKey().trim());
        }

        String envBase = System.getenv("OPENAI_API_BASE");
        String envModel = System.getenv("OPENAI_MODEL_NAME");
        String envKey = System.getenv("OPENAI_API_KEY");

        if (envModel == null) envModel = "gpt-4";
        if (envBase != null && !config.containsKey("llmApiBase")) {
            config.put("llmApiBase", envBase.trim());
        }
        if (envModel != null && !config.containsKey("llmModelName")) {
            config.put("llmModelName", envModel.trim());
        }
        if (envKey != null && !config.containsKey("llmApiKey")) {
            config.put("llmApiKey", envKey.trim());
        }

        return config;
    }

    private String callLlmForSkillIntro(String skillJson, Map<String, String> llmConfig) {
        String systemPrompt = "你是一个技能文档生成专家。请根据提供的 Skill JSON 对象，生成一份详细的 Markdown 格式技能介绍文档。\n\n" +
                "要求：\n" +
                "1. 使用中文输出\n" +
                "2. 结构清晰，包含以下部分：\n" +
                "   - 技能名称（一级标题）\n" +
                "   - 技能描述（二级标题）\n" +
                "   - 技能类型（二级标题）\n" +
                "   - 配置说明（二级标题，解析 configuration JSON）\n" +
                "   - 使用场景（二级标题）\n" +
                "   - 输入输出示例（二级标题）\n" +
                "3. 内容详实但不冗长\n" +
                "4. 对于 API 类型技能，需要解析 endpoint、method、headers、queryParams 等\n" +
                "5. 对于 SSH 类型技能，需要解析 executor、server 等\n" +
                "6. 对于 TEMPLATE 类型技能，需要解析 prompt 模板\n";

        String userMessage = "请为以下 Skill 对象生成完整的 Markdown 介绍文档：\n\n" + skillJson;

        try {
            List<Map<String, String>> messages = new ArrayList<>();
            messages.add(createMessage("system", systemPrompt));
            messages.add(createMessage("user", userMessage));

            String llmOutput = llmHttpClient.chatCompletion(
                    llmConfig.get("llmApiBase"),
                    llmConfig.get("llmApiKey"),
                    llmConfig.get("llmModelName"),
                    messages
            );

            return llmOutput.trim();
        } catch (LlmHttpClient.LlmHttpException e) {
            log.error("LLM call failed: {}", e.getMessage());
            throw new IllegalArgumentException("Failed to generate skill intro: " + e.getMessage());
        }
    }

    private Map<String, String> createMessage(String role, String content) {
        Map<String, String> msg = new LinkedHashMap<>();
        msg.put("role", role);
        msg.put("content", content);
        return msg;
    }
}
