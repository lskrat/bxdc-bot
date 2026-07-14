package com.lobsterai.skillgateway.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lobsterai.skillgateway.entity.ApiCallLog;
import com.lobsterai.skillgateway.entity.Conversation;
import com.lobsterai.skillgateway.entity.ExternalApiTenant;
import com.lobsterai.skillgateway.entity.User;
import com.lobsterai.skillgateway.mapper.ApiCallLogMapper;
import com.lobsterai.skillgateway.mapper.ConversationMapper;
import com.lobsterai.skillgateway.mapper.ExternalApiTenantMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class ExternalApiService {

    private static final Logger log = LoggerFactory.getLogger(ExternalApiService.class);
    private static final int HISTORY_LIMIT = 10;
    private static final int AGENT_TIMEOUT_MS = 120_000;

    private final ConversationMapper conversationMapper;
    private final ApiCallLogMapper apiCallLogMapper;
    private final ExternalApiTenantMapper externalApiTenantMapper;
    private final ConversationService conversationService;
    private final UserService userService;
    private final ObjectMapper objectMapper;

    @Value("${agent.core.url:http://localhost:3000}")
    private String agentCoreUrl;

    public ExternalApiService(ConversationMapper conversationMapper,
                              ApiCallLogMapper apiCallLogMapper,
                              ExternalApiTenantMapper externalApiTenantMapper,
                              ConversationService conversationService,
                              UserService userService,
                              ObjectMapper objectMapper) {
        this.conversationMapper = conversationMapper;
        this.apiCallLogMapper = apiCallLogMapper;
        this.externalApiTenantMapper = externalApiTenantMapper;
        this.conversationService = conversationService;
        this.userService = userService;
        this.objectMapper = objectMapper;
    }

    // ---- Main Entry Point ----

    /**
     * 处理外部系统的 agent-chat 调用（非流式模式，聚合后返回 JSON）。
     */
    public Map<String, Object> agentChatExternal(String apiKey, String instruction,
                                                  String callerId, String apiClient) {
        ConvContext ctx = resolveContext(apiKey, callerId, apiClient);

        long startMs = System.currentTimeMillis();
        // 记录到模板对话下（管理员在模板对话的调用记录页查看）
        ApiCallLog callLog = createCallLog(ctx.templateConv.getConversationId(),
                ctx.templateConv.getUserId(), callerId, instruction);
        String reply = null;
        List<Map<String, Object>> toolCallList = new ArrayList<>();
        String status = "running";
        String errorMessage = null;

        try {
            String systemContent = getSystemContent(ctx.templateConv);
            String effectiveInstruction = systemContent + "\n\n用户请求：" + instruction;
            List<Map<String, String>> history = buildHistory(ctx.templateConv, ctx.clonedConv);
            Map<String, Object> agentRequest = buildAgentRequest(effectiveInstruction, history, ctx.clonedConv);
            Map<String, Object> sseResult = callAgentCoreSSE(agentRequest, toolCallList);
            reply = (String) sseResult.get("reply");
            status = "success";
        } catch (ResponseStatusException e) {
            status = "error";
            errorMessage = e.getMessage();
            throw e;
        } catch (Exception e) {
            status = "error";
            errorMessage = "Agent service unavailable: " + e.getMessage();
            log.error("[external-agent-chat] agent-core call failed", e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Agent service unavailable");
        } finally {
            updateCallLog(callLog, status, reply, toolCallList.size(), startMs, errorMessage);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("conversationId", ctx.clonedConv.getConversationId());
        result.put("reply", reply);
        result.put("toolCalls", toolCallList);
        result.put("durationMs", (int) (System.currentTimeMillis() - startMs));
        return result;
    }

    /**
     * 处理外部系统的 agent-chat 调用（流式模式，返回 SseEmitter）。
     */
    public SseEmitter agentChatExternalStreaming(String apiKey, String instruction,
                                                  String callerId, String apiClient) {
        ConvContext ctx = resolveContext(apiKey, callerId, apiClient);

        long startMs = System.currentTimeMillis();
        // 记录到模板对话下（管理员在模板对话的调用记录页查看）
        ApiCallLog callLog = createCallLog(ctx.templateConv.getConversationId(),
                ctx.templateConv.getUserId(), callerId, instruction);

        SseEmitter emitter = new SseEmitter(AGENT_TIMEOUT_MS + 10_000L);

        // 异步处理 SSE 流
        Thread emitterThread = new Thread(() -> {
            StringBuilder replyBuilder = new StringBuilder();
            List<Map<String, Object>> toolCallList = new ArrayList<>();
            String status = "running";
            String errorMessage = null;

            try {
                String systemContent = getSystemContent(ctx.templateConv);
                String effectiveInstruction = systemContent + "\n\n用户请求：" + instruction;
                List<Map<String, String>> history = buildHistory(ctx.templateConv, ctx.clonedConv);
                Map<String, Object> agentRequest = buildAgentRequest(effectiveInstruction, history, ctx.clonedConv);

                // 调用 agent-core SSE 并透传事件
                callAgentCoreSSEAndEmit(agentRequest, emitter, replyBuilder, toolCallList);
                status = "success";
            } catch (Exception e) {
                status = "error";
                errorMessage = "Agent service unavailable: " + e.getMessage();
                log.error("[external-agent-chat-streaming] agent-core call failed", e);
                try {
                    Map<String, String> errEvent = new LinkedHashMap<>();
                    errEvent.put("type", "error");
                    errEvent.put("message", errorMessage);
                    emitter.send(SseEmitter.event().data(objectMapper.writeValueAsString(errEvent)));
                } catch (IOException ignored) {}
            } finally {
                updateCallLog(callLog, status, replyBuilder.toString(), toolCallList.size(), startMs, errorMessage);
                try {
                    // 发送 agent_finish
                    Map<String, Object> finishEvent = new LinkedHashMap<>();
                    finishEvent.put("type", "agent_finish");
                    finishEvent.put("conversationId", ctx.clonedConv.getConversationId());
                    finishEvent.put("reply", replyBuilder.toString());
                    finishEvent.put("toolCalls", toolCallList);
                    finishEvent.put("durationMs", (int) (System.currentTimeMillis() - startMs));
                    emitter.send(SseEmitter.event().data(objectMapper.writeValueAsString(finishEvent)));
                    emitter.send(SseEmitter.event().data("[DONE]"));
                    emitter.complete();
                } catch (IOException e) {
                    emitter.completeWithError(e);
                }
            }
        });
        emitterThread.setDaemon(true);
        emitterThread.start();

        return emitter;
    }

    // ---- Context Resolution ----

    /**
     * 根据 apiKey 和 callerId 解析调用上下文（Template Conv + Cloned Conv）。
     */
    private ConvContext resolveContext(String apiKey, String callerId, String apiClient) {
        if (callerId == null || callerId.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "callerId is required");
        }

        // 1. Authenticate by apiKey
        String apiKeyHash = sha256Hex(apiKey);
        List<Conversation> convs = conversationMapper.selectByApiKeyHash(apiKeyHash);
        if (convs.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid API key");
        }
        Conversation templateConv = convs.get(0);
        log.info("[ExternalApi] Resolved template conv: id={}, name={}, publishType={}",
                templateConv.getConversationId(), templateConv.getName(), templateConv.getPublishType());
        if (!Boolean.TRUE.equals(templateConv.getIsPublished())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Conversation is not published");
        }

        // 2. Find or create tenant
        try {
            ExternalApiTenant tenant = findOrCreateTenant(templateConv, callerId.trim(), apiClient);

            // 3. Load cloned conversation
            Conversation clonedConv = conversationMapper.selectById(tenant.getClonedConvId());
            if (clonedConv == null) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Cloned conversation not found");
            }

            return new ConvContext(templateConv, clonedConv);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.error("[ExternalApi] Failed to resolve context for caller={}, apiKeyHash={}: {}",
                    callerId, apiKeyHash, e.getMessage(), e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Failed to initialize tenant: " + e.getMessage(), e);
        }
    }

    /**
     * 查找或创建租户映射。
     * 首次调用：创建用户 + 克隆对话 + 写入映射（同一事务）。
     * 重复调用：直接返回已有映射。
     */
    @Transactional
    public ExternalApiTenant findOrCreateTenant(Conversation templateConv, String callerId, String apiClient) {
        ExternalApiTenant existing = externalApiTenantMapper.selectByTemplateAndCaller(
                templateConv.getId(), callerId);
        if (existing != null) {
            return existing;
        }

        // 首次调用：生成用户 ID
        String userId = generateExternalUserId(templateConv.getApiKey(), callerId);

        // 创建用户（如果已存在则跳过）
        User user = userService.getUser(userId);
        if (user == null) {
            userService.createExternalUser(userId, "API: " + templateConv.getName());
        }

        // 克隆对话
        Conversation cloned = conversationService.clone(templateConv, userId, apiClient);

        // 写入映射
        ExternalApiTenant tenant = new ExternalApiTenant();
        tenant.setTemplateConvId(templateConv.getId());
        tenant.setCallerId(callerId);
        tenant.setUserId(userId);
        tenant.setClonedConvId(cloned.getId());
        tenant.setCreatedAt(LocalDateTime.now());
        externalApiTenantMapper.insert(tenant);

        log.info("[ExternalApi] Created tenant: template={} caller={} userId={} clonedConv={}",
                templateConv.getConversationId(), callerId, userId, cloned.getConversationId());

        return tenant;
    }

    /**
     * 生成外部用户 ID：ext_ + SHA-256(apiKey + callerId) 前 8 位。
     */
    private String generateExternalUserId(String apiKey, String callerId) {
        return "ext_" + sha256Hex(apiKey + ":" + callerId).substring(0, 8);
    }

    // ---- History Building ----

    private List<Map<String, String>> buildHistory(Conversation templateConv, Conversation clonedConv) {
        // 外部接入的 history 只包含空白列表。
        // System prompt 改为拼接到 instruction 中（agent-core 会过滤掉 history 里的 system 角色消息）。
        return Collections.emptyList();
    }

    // ---- System Content ----

    /**
     * 获取外部接入模式的实际 system prompt。
     * 优先级：external_system_prompt > api_description > 兜底文案。
     */
    private String getSystemContent(Conversation templateConv) {
        String content = templateConv.getExternalSystemPrompt();
        if (content == null || content.trim().isEmpty()) {
            content = templateConv.getApiDescription();
        }
        if (content == null || content.trim().isEmpty()) {
            content = "你是一个已发布为 API 的助手，请根据用户的指令完成任务。";
        }
        return content;
    }

    // ---- Agent Request ----

    private Map<String, Object> buildAgentRequest(String instruction,
                                                   List<Map<String, String>> history,
                                                   Conversation conv) {
        Map<String, Object> agentRequest = new LinkedHashMap<>();
        agentRequest.put("instruction", instruction);
        agentRequest.put("history", history);
        agentRequest.put("conversationId", conv.getConversationId());
        agentRequest.put("userId", conv.getUserId());
        agentRequest.put("enabledSkillIds", parseEnabledSkills(conv.getEnabledSkills()));

        // context 是 agent-core 初始化 LLM 配置和会话所必需的
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("userId", conv.getUserId());
        context.put("sessionId", conv.getConversationId());
        agentRequest.put("context", context);

        return agentRequest;
    }

    @SuppressWarnings("unchecked")
    private List<Long> parseEnabledSkills(String enabledSkillsJson) {
        if (enabledSkillsJson == null || enabledSkillsJson.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(enabledSkillsJson, new TypeReference<List<Long>>() {});
        } catch (Exception e) {
            log.warn("Failed to parse enabledSkills: {}", enabledSkillsJson, e);
            return Collections.emptyList();
        }
    }

    // ---- Agent Core Communication ----

    /**
     * 调用 agent-core SSE 并聚合结果（非流式）。
     */
    private Map<String, Object> callAgentCoreSSE(Map<String, Object> requestBody,
                                                   List<Map<String, Object>> toolCallList) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(AGENT_TIMEOUT_MS);
        RestTemplate sseTemplate = new RestTemplate(factory);

        StringBuilder replyBuilder = new StringBuilder();

        String url = agentCoreUrl + "/agent/run";
        try {
            sseTemplate.execute(url, HttpMethod.POST,
                    requestCallback -> {
                        requestCallback.getHeaders().setContentType(MediaType.APPLICATION_JSON);
                        requestCallback.getHeaders().set("X-Agent-Token",
                                System.getenv().getOrDefault("JAVA_GATEWAY_TOKEN", "your-secure-token-here"));
                        objectMapper.writeValue(requestCallback.getBody(), requestBody);
                    },
                    clientHttpResponse -> {
                        try (BufferedReader reader = new BufferedReader(
                                new InputStreamReader(clientHttpResponse.getBody(), StandardCharsets.UTF_8))) {
                            String line;
                            while ((line = reader.readLine()) != null) {
                                if (line.isEmpty()) continue;
                                if (line.startsWith("data: ")) {
                                    String data = line.substring(6);
                                    if ("[DONE]".equals(data)) break;
                                    try {
                                        Map<String, Object> event = objectMapper.readValue(data, Map.class);
                                        String eventType = (String) event.getOrDefault("type", "");
                                        if ("agent_message".equals(eventType)) {
                                            Object content = event.get("content");
                                            if (content != null) replyBuilder.append(content);
                                        } else if ("agent_update".equals(eventType)) {
                                            Object agent = event.get("agent");
                                            if (agent instanceof Map) {
                                                Object content = ((Map<?, ?>) agent).get("content");
                                                if (content != null) {
                                                    replyBuilder.append(content);
                                                }
                                            }
                                        } else if ("tool_status".equals(eventType)) {
                                            String toolName = (String) event.get("toolName");
                                            String toolStatus = (String) event.get("status");
                                            if (toolName != null) {
                                                Map<String, Object> info = new LinkedHashMap<>();
                                                info.put("toolName", toolName);
                                                info.put("status", toolStatus != null ? toolStatus : "unknown");
                                                toolCallList.add(info);
                                            }
                                        } else if ("confirmation_request".equals(eventType)) {
                                            // Auto-deny in API context
                                            String taskId = (String) event.get("taskId");
                                            if (taskId != null) denyConfirmation(taskId);
                                        } else if (eventType.isEmpty()) {
                                            String role = (String) event.get("role");
                                            if ("assistant".equals(role)) {
                                                Object content = event.get("content");
                                                if (content != null) {
                                                    replyBuilder.append(content);
                                                }
                                            }
                                        }
                                    } catch (Exception e) {
                                        log.warn("[external-agent-chat] failed to parse SSE event: {}", data, e);
                                    }
                                }
                            }
                        }
                        return null;
                    });
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Agent service call failed: " + e.getMessage(), e);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reply", replyBuilder.toString());
        result.put("toolCalls", toolCallList.size());
        return result;
    }

    /**
     * 调用 agent-core SSE 并逐事件透传给 SseEmitter（流式）。
     */
    private void callAgentCoreSSEAndEmit(Map<String, Object> requestBody,
                                          SseEmitter emitter,
                                          StringBuilder replyBuilder,
                                          List<Map<String, Object>> toolCallList) throws IOException {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(AGENT_TIMEOUT_MS);
        RestTemplate sseTemplate = new RestTemplate(factory);

        String url = agentCoreUrl + "/agent/run";
        sseTemplate.execute(url, HttpMethod.POST,
                requestCallback -> {
                    requestCallback.getHeaders().setContentType(MediaType.APPLICATION_JSON);
                    requestCallback.getHeaders().set("X-Agent-Token",
                            System.getenv().getOrDefault("JAVA_GATEWAY_TOKEN", "your-secure-token-here"));
                    objectMapper.writeValue(requestCallback.getBody(), requestBody);
                },
                clientHttpResponse -> {
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(clientHttpResponse.getBody(), StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            if (line.isEmpty()) continue;
                            if (line.startsWith("data: ")) {
                                String data = line.substring(6);
                                if ("[DONE]".equals(data)) break;
                                try {
                                    Map<String, Object> event = objectMapper.readValue(data, Map.class);
                                    String eventType = (String) event.getOrDefault("type", "");

                                    if ("agent_message".equals(eventType)) {
                                        Object content = event.get("content");
                                        if (content != null) replyBuilder.append(content);
                                        // 透传 agent_message
                                        Map<String, Object> out = new LinkedHashMap<>();
                                        out.put("type", "agent_message");
                                        out.put("content", content != null ? content : "");
                                        emitter.send(SseEmitter.event().data(objectMapper.writeValueAsString(out)));
                                    } else if ("tool_status".equals(eventType)) {
                                        String toolName = (String) event.getOrDefault("toolName", "unknown");
                                        String toolStatus = (String) event.getOrDefault("status", "");
                                        Map<String, Object> info = new LinkedHashMap<>();
                                        info.put("toolName", toolName);
                                        info.put("status", toolStatus);
                                        toolCallList.add(info);
                                        // 透传 tool_status -> tool_start / tool_result
                                        Map<String, Object> out = new LinkedHashMap<>();
                                        if ("started".equals(toolStatus)) {
                                            out.put("type", "tool_start");
                                        } else {
                                            out.put("type", "tool_result");
                                        }
                                        out.put("toolName", toolName);
                                        out.put("status", toolStatus);
                                        emitter.send(SseEmitter.event().data(objectMapper.writeValueAsString(out)));
                                    } else if ("confirmation_request".equals(eventType)) {
                                        String taskId = (String) event.get("taskId");
                                        if (taskId != null) denyConfirmation(taskId);
                                    } else if ("agent_update".equals(eventType)) {
                                        Object agent = event.get("agent");
                                        if (agent instanceof Map) {
                                            Object content = ((Map<?, ?>) agent).get("content");
                                            if (content != null) {
                                                replyBuilder.setLength(0);
                                                replyBuilder.append(content);
                                            }
                                        }
                                    } else if (eventType == null || eventType.isEmpty()) {
                                        // 无 type 的流式 token（role + content），追加并透传给客户端
                                        String role = (String) event.get("role");
                                        if ("assistant".equals(role)) {
                                            Object content = event.get("content");
                                            if (content != null) {
                                                String token = String.valueOf(content);
                                                replyBuilder.append(token);
                                                // 透传给客户端
                                                Map<String, Object> out = new LinkedHashMap<>();
                                                out.put("type", "agent_message");
                                                out.put("content", token);
                                                emitter.send(SseEmitter.event().data(objectMapper.writeValueAsString(out)));
                                            }
                                        }
                                    }
                                } catch (Exception e) {
                                    log.warn("[external-agent-chat-streaming] failed to parse SSE: {}", data, e);
                                }
                            }
                        }
                    }
                    return null;
                });
    }

    private void denyConfirmation(String taskId) {
        try {
            String url = agentCoreUrl + "/agent/confirm";
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("taskId", taskId);
            body.put("confirmed", false);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Agent-Token",
                    System.getenv().getOrDefault("JAVA_GATEWAY_TOKEN", "your-secure-token-here"));
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            new RestTemplate().postForEntity(url, entity, String.class);
        } catch (Exception e) {
            log.warn("[external-agent-chat] failed to deny confirmation taskId={}: {}", taskId, e.getMessage());
        }
    }

    // ---- Call Log ----

    private ApiCallLog createCallLog(String conversationId, String userId, String callerId, String instruction) {
        ApiCallLog log = new ApiCallLog();
        log.setConversationId(conversationId);
        log.setUserId(userId);
        log.setCallerId(callerId);
        log.setInstruction(instruction);
        log.setStatus("running");
        log.setCreatedAt(LocalDateTime.now());
        apiCallLogMapper.insert(log);
        return log;
    }

    private void updateCallLog(ApiCallLog callLog, String status, String reply,
                                int toolCallCount, long startMs, String errorMessage) {
        long durationMs = System.currentTimeMillis() - startMs;
        callLog.setStatus(status);
        callLog.setReply(reply);
        callLog.setToolCallCount(toolCallCount);
        callLog.setDurationMs((int) Math.min(durationMs, Integer.MAX_VALUE));
        callLog.setErrorMessage(errorMessage);
        apiCallLogMapper.updateById(callLog);
    }

    // ---- Helpers ----

    static String sha256Hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    // ---- Inner Class ----

    private static class ConvContext {
        final Conversation templateConv;
        final Conversation clonedConv;

        ConvContext(Conversation templateConv, Conversation clonedConv) {
            this.templateConv = templateConv;
            this.clonedConv = clonedConv;
        }
    }
}
