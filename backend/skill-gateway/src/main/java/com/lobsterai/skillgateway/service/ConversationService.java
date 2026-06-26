package com.lobsterai.skillgateway.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lobsterai.skillgateway.entity.Conversation;
import com.lobsterai.skillgateway.entity.ConversationMessage;
import com.lobsterai.skillgateway.entity.User;
import com.lobsterai.skillgateway.mapper.ConversationMapper;
import com.lobsterai.skillgateway.mapper.ConversationMessageMapper;
import com.lobsterai.skillgateway.mapper.UserMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class ConversationService {

    private static final Logger log = LoggerFactory.getLogger(ConversationService.class);
    private static final Set<String> VALID_ROLES = new java.util.HashSet<String>(java.util.Arrays.asList("user", "assistant", "tool", "system"));
    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 100;

    /** file-isolation-v2: enabled_files 上限 */
    public static final int MAX_ENABLED_FILES = 5;

    /** 默认头像（用户头像缺失时回退），与 UserService 注册默认一致。 */
    private static final String DEFAULT_AVATAR = "👤";

    /** 新建对话问好语模板（纯随机选取 + 占位符替换，无 LLM）。从 agent-core 迁入。 */
    private static final String[] GREETING_TEMPLATES = new String[] {
            "你好，{nickname} {avatar}！今天想聊点什么？",
            "欢迎回来，{nickname} {avatar}！有什么可以帮你的？",
            "嗨，{nickname} {avatar}！很高兴见到你~",
            "{nickname} {avatar}，欢迎来到 BRDC.bot！开始一场有趣的对话吧。",
            "Hey，{nickname} {avatar}！准备好探索新知识了吗？",
            "又见面啦，{nickname} {avatar}！今天有什么新想法？",
            "{nickname} {avatar}，欢迎光临！我是你的 AI 助手，随时待命。",
            "哈喽，{nickname} {avatar}！期待和你碰撞出思维的火花。",
            "你好呀，{nickname} {avatar}！放松心情，随便聊聊吧。",
            "{nickname} {avatar}，欢迎加入！这里没有傻问题，只有好奇的心。",
            "嗨嗨，{nickname} {avatar}！一天的好心情从聊天开始~",
            "欢迎你，{nickname} {avatar}！希望今天能帮到你点什么。",
            "{nickname} {avatar}，来啦！坐下来聊聊天呗。",
            "你好，{nickname} {avatar}！无论大事小事，我都乐意倾听。",
            "哈喽 {nickname} {avatar}！每一次对话都是一次小小的冒险。",
            "{nickname} {avatar}，欢迎上船！我们一起探索未知的领域。",
            "嗨，{nickname} {avatar}！新对话，新开始，加油！",
            "欢迎欢迎，{nickname} {avatar}！今天的天气是「适合聊天」。",
            "{nickname} {avatar}，你来啦！我已经准备好接招了。",
            "你好，{nickname} {avatar}！用心倾听，认真回答，这是我的承诺。",
            "嘿，{nickname} {avatar}！很高兴成为你的今日搭子。",
            "{nickname} {avatar}，欢迎回家！这里永远有一盏灯为你亮着。",
            "哈喽 {nickname} {avatar}！放下包袱，畅所欲言吧。",
            "你好，{nickname} {avatar}！世界上有两种东西藏不住——喷嚏和好奇心。而你，显然两者都有。",
            "{nickname} {avatar}，新的对话已开启！让我们从一句「你好」开始吧。",
            "嗨，{nickname} {avatar}！时间很宝贵，但和你聊天值得。",
            "欢迎你，{nickname} {avatar}！今天想搞点技术还是聊聊人生？",
            "{nickname} {avatar}，看到你来了，这一刻值得记录。",
            "你好呀，{nickname} {avatar}！别客气，把我当成你的私人智囊团。",
            "{nickname} {avatar}，欢迎光临 BRDC.bot！愿你在这里找到所有答案。",
    };

    private final ConversationMapper conversationMapper;
    private final ConversationMessageMapper messageMapper;
    private final ObjectMapper objectMapper;
    private final UserMapper userMapper;

    public ConversationService(ConversationMapper conversationMapper,
                               ConversationMessageMapper messageMapper,
                               ObjectMapper objectMapper,
                               UserMapper userMapper) {
        this.conversationMapper = conversationMapper;
        this.messageMapper = messageMapper;
        this.objectMapper = objectMapper;
        this.userMapper = userMapper;
    }

    // ---- Conversation CRUD ----

    public List<Conversation> listByUserId(String userId) {
        return conversationMapper.selectByUserIdOrderByUpdatedAt(userId);
    }

    public Conversation getById(String conversationId, String userId) {
        Conversation conv = conversationMapper.selectByConversationId(conversationId);
        if (conv == null || !conv.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found");
        }
        return conv;
    }

    /**
     * file-isolation-v2: 安全查询会话的 enabled_file_ids，不抛异常。
     * <p>
     * 用于文件隔离校验的内部调用，与 {@link #getById(String, String)} 不同：
     * 会话不存在、不属于当前用户、或 JSON 解析失败时返回空列表（而非 null、也非抛异常），
     * 防止异常被上层 catch 吞掉导致隔离绕过。
     * </p>
     * <p>
     * 返回 null 的唯一场景：会话属于当前用户 且 enabled_files 为 NULL（存量会话，向后兼容不启用过滤）。
     * </p>
     *
     * @param conversationId 会话 UUID
     * @param userId 当前用户 ID（用于校验会话归属）
     * @return enabled_files 中的文件 ID 列表；
     *         null 表示不启用过滤（会话属于当前用户但 enabled_files 为 NULL）；
     *         空列表表示启用隔离但无可用文件（会话不存在/不属于当前用户/JSON 解析失败）
     */
    public List<Long> getEnabledFileIds(String conversationId, String userId) {
        if (conversationId == null || conversationId.trim().isEmpty()) {
            return Collections.emptyList(); // 无 conversationId → 启用隔离，返回空
        }
        Conversation conv = conversationMapper.selectByConversationId(conversationId.trim());
        if (conv == null) {
            log.debug("getEnabledFileIds: conversation not found for id={}", conversationId);
            return Collections.emptyList(); // 会话不存在 → 启用隔离，拒绝所有
        }
        if (userId == null || !userId.equals(conv.getUserId())) {
            log.warn("getEnabledFileIds: userId mismatch for conv={}, expected={}, got={}",
                    conversationId, conv.getUserId(), userId);
            return Collections.emptyList(); // 不属于当前用户 → 启用隔离，拒绝所有
        }
        String raw = conv.getEnabledFiles();
        if (raw == null || raw.trim().isEmpty() || "null".equals(raw)) {
            return null; // 会话属于当前用户 且 enabled_files 为 NULL → 不启用过滤（向后兼容）
        }
        try {
            Long[] arr = objectMapper.readValue(raw, Long[].class);
            if (arr == null || arr.length == 0) {
                return Collections.emptyList(); // enabled_files 显式配置为空数组 → 无文件可操作
            }
            List<Long> result = new ArrayList<>();
            for (Long id : arr) {
                if (id != null) result.add(id);
            }
            return result;
        } catch (Exception e) {
            log.warn("getEnabledFileIds failed to parse enabled_files for conv={}: {}", conversationId, e.getMessage());
            return Collections.emptyList(); // JSON 解析失败 → 启用隔离，拒绝所有
        }
    }

    /**
     * 查询会话启用的技能 ID 列表（解析 enabled_skills JSON 数组，如 [1,3,5]）。
     * 会校验会话归属（非本人会话抛 404）。
     * @param conversationId 会话 ID
     * @param userId 当前用户 ID
     * @return 启用的 skillId 列表；为空或解析失败时返回空列表
     */
    public List<Long> getEnabledSkillIds(String conversationId, String userId) {
        Conversation conv = getById(conversationId, userId);
        String json = conv.getEnabledSkills();
        if (json == null || json.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<Long>>() {});
        } catch (Exception e) {
            log.warn("Failed to parse enabled_skills for conversation {}: {}", conversationId, json, e);
            return Collections.emptyList();
        }
    }

    @Transactional
    public Conversation create(String userId, String name, List<Long> enabledSkills) {
        return create(userId, name, enabledSkills, Collections.<Long>emptyList());
    }

    @Transactional
    public Conversation create(String userId, String name, List<Long> enabledSkills, List<Long> enabledFiles) {
        Conversation conv = new Conversation();
        conv.setConversationId(UUID.randomUUID().toString());
        conv.setUserId(userId);
        conv.setName(name != null ? name : "");
        conv.setEnabledSkills(skillsToJson(enabledSkills));
        conv.setEnabledFiles(filesToJson(enabledFiles));
        conv.setStatus("active");
        conv.setCreatedAt(LocalDateTime.now());
        conv.setUpdatedAt(LocalDateTime.now());
        conversationMapper.insert(conv);

        // 同事务注入一条持久化问好语（纯模板随机，无 LLM）
        insertGreetingMessage(conv.getConversationId(), userId);

        return conv;
    }

    /**
     * 在新建对话时插入一条 role=assistant 的问好语消息。
     * 内容由 GREETING_TEMPLATES 随机选取，用 users 表的昵称/头像填充占位符。
     * 用户缺失或字段为空时回退为空串 / 默认头像，不阻断创建。
     */
    private void insertGreetingMessage(String conversationId, String userId) {
        String nickname = "";
        String avatar = DEFAULT_AVATAR;
        User user = userId != null ? userMapper.selectById(userId) : null;
        if (user != null) {
            if (user.getNickname() != null && !user.getNickname().isEmpty()) {
                nickname = user.getNickname();
            }
            if (user.getAvatar() != null && !user.getAvatar().isEmpty()) {
                avatar = user.getAvatar();
            }
        }

        String template = GREETING_TEMPLATES[ThreadLocalRandom.current().nextInt(GREETING_TEMPLATES.length)];
        String content = template.replace("{nickname}", nickname).replace("{avatar}", avatar);

        ConversationMessage greeting = new ConversationMessage();
        greeting.setMessageId(UUID.randomUUID().toString());
        greeting.setConversationId(conversationId);
        greeting.setRole("assistant");
        greeting.setContent(content);
        greeting.setCreatedAt(LocalDateTime.now());
        messageMapper.insert(greeting);
    }

    @Transactional
    public Conversation update(String conversationId, String userId, String name, List<Long> enabledSkills) {
        return update(conversationId, userId, name, enabledSkills, null);
    }

    @Transactional
    public Conversation update(String conversationId, String userId, String name,
                               List<Long> enabledSkills, List<Long> enabledFiles) {
        Conversation conv = getById(conversationId, userId);
        if (name != null) {
            conv.setName(name);
        }
        if (enabledSkills != null) {
            conv.setEnabledSkills(skillsToJson(enabledSkills));
        }
        if (enabledFiles != null) {
            conv.setEnabledFiles(filesToJson(enabledFiles));
        }
        conv.setUpdatedAt(LocalDateTime.now());
        conversationMapper.updateById(conv);
        return conv;
    }

    /**
     * 将 fileId 追加到指定对话的 enabled_files。
     * 幂等：已存在则不重复添加。
     */
    @Transactional
    public void appendEnabledFile(String conversationId, String userId, Long fileId) {
        Conversation conv = getById(conversationId, userId);
        List<Long> ids = parseFileIds(conv.getEnabledFiles());
        if (!ids.contains(fileId)) {
            // file-isolation-v2: 上限校验
            validateEnabledFilesSize(ids);
            ids.add(fileId);
            conv.setEnabledFiles(filesToJson(ids));
            conv.setUpdatedAt(LocalDateTime.now());
            conversationMapper.updateById(conv);
            log.info("appendEnabledFile: conv={}, fileId={}", conversationId, fileId);
        }
    }

    /**
     * file-isolation-v2: 校验 enabled_files 是否已达上限。
     */
    private void validateEnabledFilesSize(List<Long> ids) {
        if (ids.size() >= MAX_ENABLED_FILES) {
            throw new IllegalArgumentException("enabled_files 最多 " + MAX_ENABLED_FILES + " 个文件");
        }
    }

    /**
     * file-isolation-v2: 公开校验入口（Controller 层直接调用）。
     */
    public void validateEnabledFilesSizeForUpdate(List<Long> ids) {
        validateEnabledFilesSize(ids);
    }

    /**
     * 从<b>指定用户</b>的所有对话的 enabled_files 中移除指定 fileId。
     * 用于 file_delete 成功后清理孤行引用。
     */
    @Transactional
    public int removeEnabledFileFromAllConversations(Long fileId, String userId) {
        List<Conversation> all = conversationMapper.selectByUserIdOrderByUpdatedAt(userId);
        int updated = 0;
        for (Conversation conv : all) {
            List<Long> ids = parseFileIds(conv.getEnabledFiles());
            if (ids.remove(fileId)) {
                conv.setEnabledFiles(filesToJson(ids));
                conv.setUpdatedAt(LocalDateTime.now());
                conversationMapper.updateById(conv);
                updated++;
            }
        }
        if (updated > 0) {
            log.info("removeEnabledFileFromAllConversations: fileId={}, cleaned={}", fileId, updated);
        }
        return updated;
    }

    @Transactional
    public void delete(String conversationId, String userId) {
        Conversation conv = getById(conversationId, userId);
        messageMapper.deleteByConversationId(conversationId);
        conversationMapper.deleteById(conv.getId());
    }

    // ---- Messages ----

    public Map<String, Object> getMessages(String conversationId, String userId,
                                            String cursorStr, Integer rawLimit) {
        // verify conversation exists and belongs to user
        getById(conversationId, userId);

        int limit = Math.min(rawLimit != null ? rawLimit : DEFAULT_LIMIT, MAX_LIMIT);
        LocalDateTime cursor = null;
        if (cursorStr != null && !cursorStr.isEmpty()) {
            try {
                cursor = LocalDateTime.parse(cursorStr);
            } catch (Exception e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid cursor format, expected ISO 8601");
            }
        }

        // Fetch one extra to determine hasMore
        List<ConversationMessage> messages = messageMapper.selectByConversationIdCursor(
                conversationId, cursor, limit + 1);

        boolean hasMore = messages.size() > limit;
        if (hasMore) {
            messages = messages.subList(0, limit);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (ConversationMessage msg : messages) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("message_id", msg.getMessageId());
            m.put("role", msg.getRole());
            m.put("content", msg.getContent());
            m.put("skill_calls", msg.getSkillCalls());
            m.put("skill_outputs", msg.getSkillOutputs());
            m.put("source", msg.getSource());
            // async-task-result-echo-to-chat: 异步任务结果消息专用字段
            m.put("async_task_id", msg.getAsyncTaskId());
            // bxdcbot-multi-turn-async change: BXDCBOT_RUN_RESULT 消息的 parent_tool_id=runId, parent_skill_id=skillId
            m.put("parent_tool_id", msg.getParentToolId());
            m.put("parent_skill_id", msg.getParentSkillId());
            m.put("summary_pending", msg.getSummaryPending());
            m.put("summary_text", msg.getSummaryText());
            m.put("summary_generated_at", msg.getSummaryGeneratedAt() != null ? msg.getSummaryGeneratedAt().toString() : null);
            m.put("created_at", msg.getCreatedAt() != null ? msg.getCreatedAt().toString() : null);
            result.add(m);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("messages", result);
        response.put("hasMore", hasMore);
        return response;
    }

    @Transactional
    public Map<String, Object> saveMessages(String conversationId, String userId,
                                             List<Map<String, Object>> messages) {
        Conversation conv = getById(conversationId, userId);

        if (messages == null || messages.isEmpty()) {
            java.util.Map<String, Object> emptyResult = new java.util.LinkedHashMap<String, Object>();
            emptyResult.put("ok", true);
            emptyResult.put("count", 0);
            return emptyResult;
        }

        int count = 0;
        for (Map<String, Object> raw : messages) {
            String role = String.valueOf(raw.getOrDefault("role", ""));
            if (!VALID_ROLES.contains(role)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Invalid message role: " + role + ". Must be one of: " + String.join(", ", VALID_ROLES));
            }

            ConversationMessage msg = new ConversationMessage();
            msg.setMessageId(UUID.randomUUID().toString());
            msg.setConversationId(conversationId);
            msg.setRole(role);
            msg.setContent(String.valueOf(raw.getOrDefault("content", "")));
            msg.setSkillCalls(raw.containsKey("skill_calls") ? toJson(raw.get("skill_calls")) : null);
            msg.setSkillOutputs(raw.containsKey("skill_outputs") ? toJson(raw.get("skill_outputs")) : null);
            msg.setCreatedAt(LocalDateTime.now());
            messageMapper.insert(msg);
            count++;
        }

        // Refresh conversation updated_at
        conv.setUpdatedAt(LocalDateTime.now());
        conversationMapper.updateById(conv);

        java.util.Map<String, Object> result = new java.util.LinkedHashMap<String, Object>();
        result.put("ok", true);
        result.put("count", count);
        return result;
    }

    // ---- Helper methods ----

    private String skillsToJson(List<Long> skillIds) {
        if (skillIds == null || skillIds.isEmpty()) return "[]";
        try {
            return objectMapper.writeValueAsString(skillIds);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize enabled_skills: {}", e.getMessage());
            return "[]";
        }
    }

    private String filesToJson(List<Long> fileIds) {
        if (fileIds == null) return "[]";
        if (fileIds.isEmpty()) return "[]";
        try {
            return objectMapper.writeValueAsString(fileIds);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize enabled_files: {}", e.getMessage());
            return "[]";
        }
    }

    /**
     * 反序列化 enabled_files JSON 字符串。
     * - null 或空字符串 → 返回空列表
     * - JSON 解析失败 → 返回空列表（容错）
     */
    private List<Long> parseFileIds(String json) {
        List<Long> result = new ArrayList<Long>();
        if (json == null || json.isEmpty() || "null".equals(json)) return result;
        try {
            Long[] arr = objectMapper.readValue(json, Long[].class);
            if (arr != null) {
                for (Long id : arr) {
                    if (id != null) result.add(id);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to parse enabled_files: {}", e.getMessage());
        }
        return result;
    }

    private String toJson(Object obj) {
        if (obj == null) return null;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize object to JSON: {}", e.getMessage());
            return null;
        }
    }
}
