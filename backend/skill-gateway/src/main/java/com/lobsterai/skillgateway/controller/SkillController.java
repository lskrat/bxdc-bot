package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.dto.ParseFromDescriptionRequest;
import com.lobsterai.skillgateway.dto.SkillMatchRequest;
import com.lobsterai.skillgateway.dto.SkillMatchResponse;
import com.lobsterai.skillgateway.dto.SkillImportRequest;
import com.lobsterai.skillgateway.dto.SkillImportValidator;
import com.lobsterai.skillgateway.dto.SkillParseResponse;
import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.mapper.SkillMapper;
import com.lobsterai.skillgateway.service.AsyncTaskPollingService;
import com.lobsterai.skillgateway.service.BuiltinToolExecutionService;
import com.lobsterai.skillgateway.service.GatewayOutboundAuditService;
import com.lobsterai.skillgateway.service.LinuxScriptExecutionService;
import com.lobsterai.skillgateway.service.ServerLedgerService;
import com.lobsterai.skillgateway.service.SkillEmbeddingService;
import com.lobsterai.skillgateway.service.SkillParseService;
import com.lobsterai.skillgateway.service.SkillService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.lobsterai.skillgateway.entity.AsyncTask;
import com.lobsterai.skillgateway.entity.AsyncPollingAuditLog;
import com.lobsterai.skillgateway.entity.ServerLedger;
import com.lobsterai.skillgateway.entity.SkillTextPrompt;
import com.lobsterai.skillgateway.mapper.SkillTextPromptMapper;
import com.lobsterai.skillgateway.service.ApiProxyService;
import com.lobsterai.skillgateway.service.AsyncPollingAuditService;
import com.lobsterai.skillgateway.service.ConversationService;
import com.lobsterai.skillgateway.service.SkillExecutionService;
import com.lobsterai.skillgateway.util.JsonPathUtils;
import com.lobsterai.skillgateway.util.StringUtils;

/**
 * Skill 控制器。
 * <p>
 * 暴露 RESTful 接口供 Agent Core 调用，以执行具体的 SSH 命令或 API 请求。
 * 包含安全检查逻辑。
 * 此外，提供 Skill 的统一管理（CRUD）。
 * </p>
 */
@RestController
@RequestMapping("/api/skills")
public class SkillController {

    private final SkillService skillService;
    private final SkillParseService skillParseService;
    private final LinuxScriptExecutionService linuxScriptExecutionService;
    private final ServerLedgerService serverLedgerService;
    private final BuiltinToolExecutionService builtinToolExecutionService;
    private final GatewayOutboundAuditService gatewayOutboundAuditService;
    private final AsyncTaskPollingService asyncTaskPollingService;
    private final SkillTextPromptMapper skillTextPromptMapper;
    private final ApiProxyService apiProxyService;
    private final AsyncPollingAuditService pollingAuditService;
    private final ObjectMapper objectMapper;

    private final SkillExecutionService skillExecutionService;

    private final ConversationService conversationService;

    private final SkillEmbeddingService skillEmbeddingService;

    private final SkillMapper skillMapper;

    public SkillController(
            SkillService skillService,
            SkillParseService skillParseService,
            LinuxScriptExecutionService linuxScriptExecutionService,
            ServerLedgerService serverLedgerService,
            BuiltinToolExecutionService builtinToolExecutionService,
            GatewayOutboundAuditService gatewayOutboundAuditService,
            AsyncTaskPollingService asyncTaskPollingService,
            SkillTextPromptMapper skillTextPromptMapper,
            ApiProxyService apiProxyService,
            AsyncPollingAuditService pollingAuditService,
            ObjectMapper objectMapper,
            SkillExecutionService skillExecutionService,
            ConversationService conversationService,
            SkillEmbeddingService skillEmbeddingService,
            SkillMapper skillMapper
    ) {
        this.skillService = skillService;
        this.skillParseService = skillParseService;
        this.linuxScriptExecutionService = linuxScriptExecutionService;
        this.serverLedgerService = serverLedgerService;
        this.builtinToolExecutionService = builtinToolExecutionService;
        this.gatewayOutboundAuditService = gatewayOutboundAuditService;
        this.asyncTaskPollingService = asyncTaskPollingService;
        this.skillTextPromptMapper = skillTextPromptMapper;
        this.apiProxyService = apiProxyService;
        this.pollingAuditService = pollingAuditService;
        this.objectMapper = objectMapper;
        this.skillExecutionService = skillExecutionService;
        this.conversationService = conversationService;
        this.skillEmbeddingService = skillEmbeddingService;
        this.skillMapper = skillMapper;
    }

    // --- Skill Management (CRUD) ---

    @GetMapping
    public List<Skill> getAllSkills(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestParam(value = "ownerType", required = false) Integer ownerType
    ) {
        try {
            return skillService.listSkillsForUser(userId, ownerType);
        } catch (Exception e) {
            System.err.println("[SkillController.getAllSkills] ERROR: " + e.getMessage());
            e.printStackTrace();
            throw e;
        }
    }

    /**
     * 按技能所有者类型检索技能（agent-core 加载用户/系统技能时调用）。
     * ownerType=1 用户技能，ownerType=2 系统技能；仅返回 enabled=true 的技能。
     */
    @GetMapping("/by-owner-type")
    public List<Skill> getSkillsByOwnerType(
            @RequestParam(value = "ownerType") Integer ownerType
    ) {
        return skillService.listSkillsByOwnerType(ownerType);
    }

    /**
     * 主 Agent 加载会话勾选技能：传入会话 ID，由 gateway 查会话表 enabled_skills，
     * 解析出 skillId 列表后返回「该用户可见 + enabled=true」的技能列表。
     * X-User-Id 用于校验会话归属并做可见性过滤。
     */
    @GetMapping("/by-conversation")
    public List<Skill> getSkillsByConversation(
            @RequestHeader("X-User-Id") String userId,
            @RequestParam("conversationId") String conversationId
    ) {
        List<Long> enabledSkillIds = conversationService.getEnabledSkillIds(conversationId, userId);
        // agent-core 内部调用：不做可见性过滤，对话已勾选的技能都应返回
        return skillService.listEnabledByIds(enabledSkillIds);
    }

    /**
     * 向量检索系统技能（agent-core execute_skill_with_context 内部调用）。
     *
     * <p>
     * 接收 LLM 提炼的任务关键词/描述，返回按余弦相似度 × search_weight 排序的 top-K 技能。
     * 仅检索 skill_owner_type=2 的系统技能。
     * </p>
     */
    @PostMapping("/match")
    public SkillMatchResponse matchSkills(@RequestBody SkillMatchRequest request) {
        String query = request.getQuery();
        int limit = request.getLimit();
        // add-skill-tags-and-intent-filtering：透传标签（可选；null = 走 e2ac8ce 原路径）
        List<String> tags = request.getTags();

        if (query == null || query.trim().isEmpty()) {
            SkillMatchResponse empty = new SkillMatchResponse();
            empty.setQuery(query);
            empty.setMatches(Collections.emptyList());
            empty.setTotal(0);
            return empty;
        }

        // add-skill-tags-and-intent-filtering：tags 透传 + excludeNames 基础工具排除
        List<SkillEmbeddingService.MatchResult> results = skillEmbeddingService.match(
                query, tags, limit, request.getExcludeNames());

        List<SkillMatchResponse.MatchItem> items = new ArrayList<>();
        for (SkillEmbeddingService.MatchResult r : results) {
            SkillMatchResponse.MatchItem item = new SkillMatchResponse.MatchItem();
            item.setSkillId(r.skillId);
            item.setName(r.name);
            item.setDescription(r.description);
            item.setType(r.type);
            item.setExecutionMode(r.executionMode);
            item.setRequiresConfirmation(r.requiresConfirmation);
            item.setAvatar(r.avatar);
            item.setScore(r.score);
            items.add(item);
        }

        SkillMatchResponse response = new SkillMatchResponse();
        response.setQuery(query);
        response.setMatches(items);
        response.setTotal(results.size());
        return response;
    }

    /**
     * 按技能名称列表 + ownerType 直接数据库查询（不走向量检索）。
     *
     * <p>
     * 用于基础工具（file_list/file_read/file_write）等已知名称的技能快速获取。
     * 不走 embedding API，无延迟，适合高频调用。
     * </p>
     *
     * @param names    技能名称列表（逗号分隔）
     * @param ownerType 技能所有者类型（2=系统技能）
     */
    @GetMapping("/by-names")
    public SkillMatchResponse findByNames(
            @RequestParam("names") String names,
            @RequestParam(value = "ownerType", defaultValue = "2") int ownerType) {
        SkillMatchResponse response = new SkillMatchResponse();
        response.setQuery(names);

        if (names == null || names.trim().isEmpty()) {
            response.setMatches(Collections.emptyList());
            response.setTotal(0);
            return response;
        }

        java.util.List<String> nameList = java.util.Arrays.asList(names.split(","));
        java.util.List<Skill> skills = skillMapper.findByNamesAndOwnerType(nameList, ownerType);

        java.util.List<SkillMatchResponse.MatchItem> items = new java.util.ArrayList<>();
        for (Skill s : skills) {
            SkillMatchResponse.MatchItem item = new SkillMatchResponse.MatchItem();
            item.setSkillId(s.getId());
            item.setName(s.getName());
            item.setDescription(s.getDescription());
            item.setType(s.getType());
            item.setExecutionMode(s.getExecutionMode());
            item.setRequiresConfirmation(s.isRequiresConfirmation());
            item.setAvatar(s.getAvatar());
            item.setScore(0);
            items.add(item);
        }

        response.setMatches(items);
        response.setTotal(items.size());
        return response;
    }

    @GetMapping("/{id}")
    public ResponseEntity<Skill> getSkillById(
            @PathVariable Long id,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        return skillService.getSkillByIdForUser(id, userId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * 保存skill的markdown介绍（20260626）
     * @param userId
     * @param skill
     * @return
     *
     * http://localhost:18080/api/skills/updateIntroMd
     * POST JSON
     * 参数：
     * header:
     * X-User-Id:123456
     * Content-Type:application/json
     * JSON：
     * {
     *   "id":40,
     *   "introMd": "# 天气查询技能\n\n## 功能概述\n用于查询指定城市的天气信息..."
     * }
     */
    @PostMapping("/updateIntroMd")
    public ResponseEntity<?> updateSkillIntroMd(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody Skill skill
    ) {
        if (userId == null || StringUtils.isBlank(userId)) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "X-User-Id header is required"));
        }
        if (skill == null || skill.getId() == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "Skill id is required"));
        }
        try {
            Skill result = skillService.updateSkillIntroMd(skill.getId(), skill.getIntroMd(), userId);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            if (e.getMessage() != null && e.getMessage().startsWith("Skill not found")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", "Failed to update skill intro: " + e.getMessage()));
        }
    }

    /**
     * 创建skill（20260626）
     * POST http://localhost:18080/api/skills
     * Content-Type: application/json
     * X-User-Id: 123456
     * {
     *   "name": "多团队共享技能",
     *   "description": "多个团队成员都可见",
     *   "type": "API",
     *   "configuration": "{\"kind\":\"api\",\"operation\":\"公共查询\",\"method\":\"GET\",\"endpoint\":\"http://api.example.com/common\"}",
     *   "visibility": "TEAM",
     *   "teamId": "1, 2, 3"
     * }
     *
     * @param skill
     * @param userId
     * @return
     */
    @PostMapping
    public ResponseEntity<?> createSkill(
            @RequestBody com.lobsterai.skillgateway.dto.SkillImportWrapper wrapper,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        if (wrapper == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "request body is required"));
        }
        try {
            Skill skill = wrapper.toSkill();

            // ---- 1.3：字段大小校验（name ≤ 100, description ≤ 2000, configuration ≤ 65536）----
            validateImportFieldSizes(skill);

            // ---- 导入分支（任务 2.1 / 2.2）----
            SkillImportRequest importPayload = wrapper.getImportPayload();
            if (importPayload != null) {
                if (importPayload.getMetaSchemaVersion() == null
                        || !SkillImportRequest.SUPPORTED_META_SCHEMA_VERSION.equals(importPayload.getMetaSchemaVersion())) {
                    return ResponseEntity.badRequest().body(Collections.singletonMap(
                            "error",
                            "unsupported-meta-schema-version: supported = "
                                    + SkillImportRequest.SUPPORTED_META_SCHEMA_VERSION
                                    + ", got = " + importPayload.getMetaSchemaVersion()
                    ));
                }
                if (importPayload.getPayload() == null) {
                    return ResponseEntity.badRequest().body(Collections.singletonMap(
                            "error", "importPayload.payload is required"
                    ));
                }

                // 任务 2.1：拒绝覆盖 createdBy="public" 的系统种子（非 admin）
                Skill payload = importPayload.getPayload();
                if (SkillService.PLATFORM_PUBLIC_AUTHOR.equals(payload.getCreatedBy())
                        && !SkillService.SKILL_PLATFORM_ADMIN_USER_ID.equals(userId)) {
                    return ResponseEntity.status(403).body(Collections.singletonMap(
                            "error",
                            "importing a system seed Skill (createdBy=public) is not allowed for non-admin users"
                    ));
                }

                // 任务 1.2：用 importPayload.payload 替换顶层 Skill 字段
                skill = payload;
                validateImportFieldSizes(skill);
            }

            return ResponseEntity.ok(skillService.createSkill(skill, userId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    /**
     * 字段大小校验（任务 1.3）。超限抛 IllegalArgumentException，由 Controller 统一捕获返回 400。
     */
    private void validateImportFieldSizes(Skill skill) {
        if (skill == null) {
            throw new IllegalArgumentException("Skill payload is required");
        }
        if (skill.getName() != null && skill.getName().length() > 100) {
            throw new IllegalArgumentException("name length must be <= 100, got " + skill.getName().length());
        }
        if (skill.getDescription() != null && skill.getDescription().length() > 2000) {
            throw new IllegalArgumentException("description length must be <= 2000, got " + skill.getDescription().length());
        }
        if (skill.getConfiguration() != null && skill.getConfiguration().length() > 65536) {
            throw new IllegalArgumentException("configuration length must be <= 65536, got " + skill.getConfiguration().length());
        }
    }

    // --- Skill Parse from Description ---

    /**
     * 从自然语言描述解析生成 Skill 对象（20260626）
     * @param userId      用户 ID（从 X-User-Id header 获取）
     * @param request     包含 description 的请求体
     * @return SkillParseResponse 解析响应（包含 skill、warnings、extractedFields）
     *
     * 添加skill（自然语言转Skill对象）
     * http://localhost:18080/api/skills/parse-from-description
     * POST JSON
     * 参数：
     * header:
     * X-User-Id:123456
     * Content-Type:application/json
     * JSON:
     * {"description":"新增一个skill，查询当日新闻。地址 http://v.juhe.cn/toutiao/index?key=c990e44845181032f48cc9a556e3a006&type=top。请求类型 GET。接口描述：返回头条(推荐)、国内，娱乐，体育，军事，科技，财经，时尚等新闻信息; 数据来源网络整理"}
     */
    @PostMapping("/parse-from-description")
    public ResponseEntity<?> parseFromDescription(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody ParseFromDescriptionRequest request
    ) {
        if (userId == null || StringUtils.isBlank(userId)) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "X-User-Id header is required"));
        }
        if (request == null || request.getDescription() == null || request.getDescription().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "description is required"));
        }
        try {
            SkillParseResponse response = skillParseService.parseFromDescription(userId, request.getDescription());
            return ResponseEntity.ok(response);
        } catch (SkillParseService.SkillParseException e) {
            String code = e.getCode();
            if ("LLM_NOT_CONFIGURED".equals(code)) {
                return ResponseEntity.badRequest().body(new HashMap<String, Object>() {{
                    put("error", e.getMessage());
                    put("code", code);
                }});
            } else if ("INVALID_REQUEST".equals(code)) {
                return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
            }
            return ResponseEntity.internalServerError().body(new HashMap<String, Object>() {{
                put("error", "Skill parsing failed: " + e.getMessage());
                put("code", code);
            }});
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(new HashMap<String, Object>() {{
                put("error", "Skill parsing failed: " + e.getMessage());
                put("code", "INTERNAL_ERROR");
            }});
        }
    }

    /**
     * 更新skill（20260626）
     *PUT http://localhost:18080/api/skills/46
     * Content-Type: application/json
     * X-User-Id: 123456
     * {
     *   "name": "多团队共享技能",
     *   "description": "多个团队成员都可见",
     *   "type": "API",
     *   "configuration": "{\"kind\":\"api\",\"operation\":\"公共查询\",\"method\":\"GET\",\"endpoint\":\"http://api.example.com/common\"}",
     *   "executionMode": "CONFIG",
     *   "enabled": true,
     *   "requiresConfirmation": false,
     *   "visibility": "TEAM",
     *   "teamId": "1"
     * }
     *
     * @param id
     * @param skillDetails
     * @param userId
     * @return
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> updateSkill(
            @PathVariable Long id,
            @RequestBody Skill skillDetails,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        try {
            return ResponseEntity.ok(skillService.updateSkill(id, skillDetails, userId));
        } catch (IllegalArgumentException e) {
            if (e.getMessage() != null && e.getMessage().startsWith("Skill not found")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteSkill(
            @PathVariable Long id,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        try {
            skillService.deleteSkill(id, userId);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * 根据Skill对象信息生成整体介绍（20260626）
     * @param userId
     * @param skill
     * @return
     *
     * http://localhost:18080/api/skills/generate-intro
     * POST JSON
     * 参数：
     * header:
     * X-User-Id:123456
     * Content-Type:application/json
     * JSON：
     * {
     * 	"id": null,
     * 	"name": "，查询当日新闻。地址 http://v.juhe.cn/toutiao/index?key=c990e44845181032f48cc9a556e3a006&type=top。请求类型 GET。接口描述：返回头条(推荐)、国内，娱乐，体育，军事，科技，财经，时尚等新闻信息; 数据来源网络整理",
     * 	"description": "返回头条(推荐)、国内，娱乐，体育，军事，科技，财经，时尚等新闻信息; 数据来源网络整理",
     * 	"type": "API",
     * 	"configuration": "{\"kind\":\"api\",\"operation\":\"查询当日新闻\",\"method\":\"GET\",\"endpoint\":\"http://v.juhe.cn/toutiao/index\",\"headers\":{},\"queryParams\":{\"type\":\"top。请求类型\",\"key\":\"c990e44845181032f48cc9a556e3a006\"}}",
     * 	"executionMode": "CONFIG",
     * 	"enabled": true,
     * 	"requiresConfirmation": false,
     * 	"visibility": "PRIVATE",
     * 	"avatar": null,
     * 	"createdBy": null,
     * 	"createdAt": null,
     * 	"updatedAt": null,
     * 	"templatePlaceholders": [],
     * 	"schemaPropertiesJson": null,
     * 	"schemaProperties": {}
     * }
     */
    @PostMapping("/generate-intro")
    public ResponseEntity<?> generateSkillIntro(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody Skill skill
    ) {
        if (userId == null || StringUtils.isBlank(userId)) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "X-User-Id header is required"));
        }
        if (skill == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "Skill is required"));
        }
        try {
            Skill result = skillService.generateIntro(userId, skill);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", "Failed to generate skill intro: " + e.getMessage()));
        }
    }

    @GetMapping("/server-lookup")
    public ResponseEntity<?> lookupServer(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestParam(value = "serverName", required = false) String serverName,
            @RequestParam(value = "name", required = false) String name
    ) {
        if (userId == null || StringUtils.isBlank(userId)) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "X-User-Id header is required for server lookup"));
        }
        String q = (serverName != null && !StringUtils.isBlank(serverName)) ? serverName : name;
        if (q == null || StringUtils.isBlank(q)) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "serverName (or legacy name) query parameter is required"));
        }
        List<ServerLedgerService.ServerNameCandidate> candidates = serverLedgerService.findTopServerNameMatches(userId, q, 5);
        List<Map<String, Object>> list = new java.util.ArrayList<>();
        for (ServerLedgerService.ServerNameCandidate c : candidates) {
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("id", c.id());
            row.put("name", c.name());
            list.add(row);
        }
        int n = list.size();
        return ResponseEntity.ok(new HashMap<String, Object>() {{
            put("candidates", list);
            put("count", n);
            put("needsUserConfirmation", n > 1);
        }});
    }

    // --- Unified Skill Execution ---

    @PostMapping("/execute")
    public ResponseEntity<?> executeSkill(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestHeader(value = "X-Session-Id", required = false) String sessionId,
            @RequestHeader(value = "X-Conversation-Id", required = false) String conversationId,
            @RequestBody Map<String, Object> body
    ) {
        try {
            SkillExecutionService.ExecuteRequest req = new SkillExecutionService.ExecuteRequest();
            req.skillId = body.get("skillId") instanceof Number ? ((Number) body.get("skillId")).longValue() : null;
            req.parameters = body.get("parameters");
            req.confirmed = Boolean.TRUE.equals(body.get("confirmed"));
            req.requestId = (String) body.get("requestId");
            req.adjustedParams = body.get("adjustedParams");
            req.userId = userId;
            req.sessionId = sessionId;
            req.conversationId = conversationId;

            Object result = skillExecutionService.execute(req);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Collections.singletonMap("error", "Skill execution failed: " + e.getMessage()));
        }
    }

    // --- Skill Execution ---

    // Old async endpoints removed — async polling now handled internally by POST /api/skills/execute

    // --- Text Prompts (AI optimization) ---

    @GetMapping("/text-prompts")
    public List<SkillTextPrompt> getAllTextPrompts() {
        return skillTextPromptMapper.selectList(null);
    }

    @GetMapping("/text-prompts/{fieldId}")
    public ResponseEntity<SkillTextPrompt> getTextPrompt(@PathVariable String fieldId) {
        return skillTextPromptMapper.findByFieldId(fieldId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/text-prompts/{fieldId}")
    public ResponseEntity<?> updateTextPrompt(
            @PathVariable String fieldId,
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody SkillTextPrompt body
    ) {
        return skillTextPromptMapper.findByFieldId(fieldId)
                .map(existing -> {
                    if (body.getSystemPrompt() != null) existing.setSystemPrompt(body.getSystemPrompt());
                    if (body.getUserPromptTemplate() != null) existing.setUserPromptTemplate(body.getUserPromptTemplate());
                    skillTextPromptMapper.updateById(existing);
                    return ResponseEntity.ok(existing);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // --- Enum Source (dynamic dropdown options) ---

    @PostMapping("/enum-source")
    public ResponseEntity<?> fetchEnumSource(@RequestBody Map<String, Object> body) {
        try {
            String url = (String) body.get("url");
            if (url == null || StringUtils.isBlank(url)) {
                return ResponseEntity.badRequest().body(Collections.singletonMap("error", "url is required"));
            }
            String method = body.get("method") instanceof String ? (String) body.get("method") : "GET";
            @SuppressWarnings("unchecked")
            Map<String, Object> headers = body.get("headers") instanceof Map ? (Map<String, Object>) body.get("headers") : null;
            String jsonPath = (String) body.get("jsonPath");
            String valueKey = body.get("valueKey") instanceof String ? (String) body.get("valueKey") : "value";
            String labelKey = body.get("labelKey") instanceof String ? (String) body.get("labelKey") : "label";
            String searchParam = (String) body.get("searchParam");
            String searchQuery = (String) body.get("searchQuery");

            String resolvedUrl = url;
            if (searchQuery != null && !StringUtils.isBlank(searchQuery) && searchParam != null && !StringUtils.isBlank(searchParam)) {
                String separator = resolvedUrl.contains("?") ? "&" : "?";
                resolvedUrl += separator + searchParam + "=" + java.net.URLEncoder.encode(searchQuery, "UTF-8");
            }

            Object response = apiProxyService.callApi(resolvedUrl, method, headers, null);
            String responseStr = response instanceof String ? (String) response : objectMapper.writeValueAsString(response);
            Object parsed = objectMapper.readValue(responseStr, Object.class);

            Object listNode = (jsonPath != null && !StringUtils.isBlank(jsonPath))
                    ? JsonPathUtils.extractValueByPath(parsed, jsonPath)
                    : parsed;

            if (!(listNode instanceof List)) {
                return ResponseEntity.badRequest().body(new HashMap<String, Object>() {{
            put("error", "jsonPath did not resolve to an array");
            put("jsonPath", jsonPath);
            put("responsePreview", responseStr.substring(0, Math.min(500, responseStr.length())));
        }});
            }

            @SuppressWarnings("unchecked")
            List<Object> items = (List<Object>) listNode;
            List<Map<String, String>> options = new java.util.ArrayList<>();
            for (Object item : items) {
                if (!(item instanceof Map)) continue;
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) item;
                Object labelObj = map.get(labelKey);
                Object valueObj = map.get(valueKey);
                if (valueObj != null) {
                    options.add(new HashMap<String, String>() {{
                        put("label", labelObj != null ? labelObj.toString() : valueObj.toString());
                        put("value", valueObj.toString());
                    }});
                }
            }
            return ResponseEntity.ok(options);
        } catch (Exception e) {
            return ResponseEntity.status(502).body(Collections.singletonMap("error", "Enum source fetch failed: " + e.getMessage()));
        }
    }

    // Old linux-script endpoint removed — use POST /api/skills/execute instead

    // Old compute endpoint removed — use POST /api/skills/execute instead

    /**
     * SSH 请求数据传输对象。
     */
    public static class SshRequest {
        private String host;
        private int port = 22;
        private String username;
        private String privateKey;
        private String command;
        // getters/setters omitted for brevity
        public String getHost() { return host; }
        public void setHost(String host) { this.host = host; }
        public int getPort() { return port; }
        public void setPort(int port) { this.port = port; }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getPrivateKey() { return privateKey; }
        public void setPrivateKey(String privateKey) { this.privateKey = privateKey; }
        public String getCommand() { return command; }
        public void setCommand(String command) { this.command = command; }
    }

    /**
     * API 调用请求数据传输对象。
     */
    public static class ApiRequest {
        private String url;
        private String method;
        /**
         * Outgoing headers; values are usually strings. Arrays (e.g. {@code "Origin": ["https://a"]})
         * are accepted so OpenAPI-style or UI-exported skills deserialize; see {@code ApiProxyService}.
         */
        private Map<String, Object> headers;
        private Object body;
        private Integer timeoutSeconds;
        private Map<String, Object> asyncPoll;
        // getters/setters
        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }
        public String getMethod() { return method; }
        public void setMethod(String method) { this.method = method; }
        public Map<String, Object> getHeaders() { return headers; }
        public void setHeaders(Map<String, Object> headers) { this.headers = headers; }
        public Object getBody() { return body; }
        public void setBody(Object body) { this.body = body; }
        public Integer getTimeoutSeconds() { return timeoutSeconds; }
        public void setTimeoutSeconds(Integer timeoutSeconds) { this.timeoutSeconds = timeoutSeconds; }
        public Map<String, Object> getAsyncPoll() { return asyncPoll; }
        public void setAsyncPoll(Map<String, Object> asyncPoll) { this.asyncPoll = asyncPoll; }
    }

    /**
     * 计算请求数据传输对象。
     */
    public static class ComputeRequest {
        private String operation;
        private List<Object> operands;

        public String getOperation() { return operation; }
        public void setOperation(String operation) { this.operation = operation; }
        public List<Object> getOperands() { return operands; }
        public void setOperands(List<Object> operands) { this.operands = operands; }
    }
}
