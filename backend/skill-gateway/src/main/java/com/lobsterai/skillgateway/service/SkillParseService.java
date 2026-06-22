package com.lobsterai.skillgateway.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lobsterai.skillgateway.dto.SkillParseResponse;
import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.entity.SkillVisibility;
import com.lobsterai.skillgateway.entity.User;
import com.lobsterai.skillgateway.http.LlmHttpClient;
import com.lobsterai.skillgateway.mapper.UserMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Skill 自然语言解析服务。
 * <p>
 * 将用户输入的自然语言 + 半结构化文本解析为 Skill 对象。
 * 不持久化到数据库，仅返回 Skill JSON。
 * </p>
 */
@Service
public class SkillParseService {

    private static final Logger log = LoggerFactory.getLogger(SkillParseService.class);

    private static final Pattern URL_BACKTICK_PATTERN = Pattern.compile("`([^`]+)`");
    private static final Pattern URL_PREFIX_PATTERN = Pattern.compile("(?:地址|URL|endpoint)[：:]?\\s*(\\S+)");
    private static final Pattern METHOD_PATTERN = Pattern.compile("(?:请求类型|method|请求方法)[：:]?\\s*(\\w+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern HEADERS_PATTERN = Pattern.compile("header[：:]\\s*([\\s\\S]+?)(?=\\n\\n|\\n$|$)", Pattern.CASE_INSENSITIVE);
    private static final Pattern DESCRIPTION_PATTERN = Pattern.compile("(?:接口描述|description|描述)[：:]\\s*(.+?)(?:\\n\\n|$)", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern NAME_PATTERN = Pattern.compile("(?:名称|name|skill)[：:]?\\s*(.+?)(?:\\n|$)", Pattern.CASE_INSENSITIVE);

    private final UserMapper userMapper;
    private final LlmHttpClient llmHttpClient;
    private final ObjectMapper objectMapper;

    public SkillParseService(UserMapper userMapper, LlmHttpClient llmHttpClient, ObjectMapper objectMapper) {
        this.userMapper = userMapper;
        this.llmHttpClient = llmHttpClient;
        this.objectMapper = objectMapper;
    }

    /**
     * 从用户描述解析生成 Skill 对象。
     *
     * @param userId      用户 ID
     * @param description 用户输入的自然语言 + 半结构化文本
     * @return SkillParseResponse 解析响应
     * @throws SkillParseException 解析失败时抛出
     */
    public SkillParseResponse parseFromDescription(String userId, String description) throws SkillParseException {
        if (description == null || description.trim().isEmpty()) {
            throw new SkillParseException("请求体为空", "INVALID_REQUEST");
        }

        List<String> warnings = new ArrayList<>();
        Map<String, Object> extracted = new HashMap<>();

        // 1. 显式字段提取
        String url = extractUrl(description);
        extracted.put("url", url);

        String method = extractMethod(description);
        extracted.put("method", method != null ? method.toUpperCase() : null);

        Map<String, String> headers = extractHeaders(description);
        extracted.put("headers", headers);

        String descText = extractDescription(description);
        extracted.put("description", descText);

        String name = extractName(description);
        extracted.put("name", name);

        Map<String, String> queryParams = parseQueryParams(url);
        extracted.put("queryParams", queryParams);

        // 2. 构建显式字段标记
        SkillParseResponse.ExtractedFields extractedFields = new SkillParseResponse.ExtractedFields(
                url != null,
                method != null,
                headers != null && !headers.isEmpty(),
                descText != null
        );

        // 3. 获取用户 LLM 配置
        User user = userMapper.selectById(userId);
        Map<String, String> llmConfig = getLlmConfig(user);
        if (llmConfig == null || llmConfig.get("llmApiKey") == null || llmConfig.get("llmApiKey").isEmpty()) {
            throw new SkillParseException("LLM API key not configured", "LLM_NOT_CONFIGURED");
        }

        // 4. LLM 补充元数据
        Map<String, String> llmMetadata = callLlmForMetadata(description, extracted, llmConfig, warnings);

        // 5. 组装 Skill 对象
        Skill skill = assembleSkill(extracted, llmMetadata, warnings);

        // 6. 返回响应
        return new SkillParseResponse(skill, warnings, extractedFields);
    }

    /**
     * 提取 URL。
     */
    String extractUrl(String text) {
        if (text == null || text.isEmpty()) {
            return null;
        }
        // 优先匹配反引号包裹的 URL
        Matcher m1 = URL_BACKTICK_PATTERN.matcher(text);
        while (m1.find()) {
            String candidate = m1.group(1).trim();
            if (isLikelyUrl(candidate)) {
                return candidate;
            }
        }
        // 匹配地址/URL/endpoint 前缀
        Matcher m2 = URL_PREFIX_PATTERN.matcher(text);
        if (m2.find()) {
            return m2.group(1).trim();
        }
        // 匹配普通 URL（以 http 开头）
        int httpIdx = text.indexOf("http");
        if (httpIdx >= 0) {
            int end = httpIdx;
            while (end < text.length()) {
                char c = text.charAt(end);
                if (Character.isWhitespace(c) || c == ')' || c == '>' || c == '`' || c == '\n') {
                    break;
                }
                end++;
            }
            String candidate = text.substring(httpIdx, end).trim();
            if (isLikelyUrl(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    /**
     * 提取 HTTP method。
     */
    String extractMethod(String text) {
        if (text == null || text.isEmpty()) {
            return null;
        }
        Matcher m = METHOD_PATTERN.matcher(text);
        if (m.find()) {
            return m.group(1).trim().toUpperCase();
        }
        return null;
    }

    /**
     * 提取 headers。
     */
    Map<String, String> extractHeaders(String text) {
        Map<String, String> headers = new HashMap<>();
        if (text == null || text.isEmpty()) {
            return headers;
        }
        Matcher m = HEADERS_PATTERN.matcher(text);
        if (m.find()) {
            String headerBlock = m.group(1).trim();
            // 解析 header 行，格式：Key   Value 或 Key: Value
            String[] lines = headerBlock.split("\\n");
            for (String line : lines) {
                line = line.trim();
                if (line.isEmpty()) continue;
                // 分割 Key 和 Value
                String[] parts = line.split("\\s{2,}|\\s*：\\s*|\\s*:\\s*", 2);
                if (parts.length == 2) {
                    String key = parts[0].trim();
                    String value = parts[1].trim();
                    if (!key.isEmpty() && !value.isEmpty()) {
                        headers.put(key, value);
                    }
                }
            }
        }
        return headers;
    }

    /**
     * 提取接口描述。
     */
    String extractDescription(String text) {
        if (text == null || text.isEmpty()) {
            return null;
        }
        Matcher m = DESCRIPTION_PATTERN.matcher(text);
        if (m.find()) {
            return m.group(1).trim();
        }
        return null;
    }

    /**
     * 提取名称（可选）。
     */
    String extractName(String text) {
        if (text == null || text.isEmpty()) {
            return null;
        }
        Matcher m = NAME_PATTERN.matcher(text);
        if (m.find()) {
            String name = m.group(1).trim();
            // 去掉可能的 "新增一个skill" 前缀
            name = name.replaceFirst("^(?:新增(?:一个)?\\s*)?skill[：:]?\\s*", "");
            return name.trim();
        }
        // 如果第一行看起来像是名称（较短且不含特殊字符），直接使用
        String firstLine = text.split("\\n")[0].trim();
        if (firstLine.length() > 0 && firstLine.length() <= 50 && !firstLine.contains("http") && !firstLine.contains("`")) {
            firstLine = firstLine.replaceFirst("^(?:新增(?:一个)?\\s*)?skill[：:]?\\s*", "");
            return firstLine.trim();
        }
        return null;
    }

    /**
     * 从 URL 解析 query parameters。
     */
    Map<String, String> parseQueryParams(String url) {
        Map<String, String> params = new HashMap<>();
        if (url == null || url.isEmpty()) {
            return params;
        }
        try {
            int queryIdx = url.indexOf('?');
            if (queryIdx < 0 || queryIdx == url.length() - 1) {
                return params;
            }
            String query = url.substring(queryIdx + 1);
            // 处理完整的 URL（包含 scheme 和 path），只取 query string 部分
            int andIdx = query.indexOf('&');
            if (andIdx > 0 && query.contains("=")) {
                String[] pairs = query.split("&");
                for (String pair : pairs) {
                    int eqIdx = pair.indexOf('=');
                    if (eqIdx > 0) {
                        String key = URLDecoder.decode(pair.substring(0, eqIdx), "UTF-8");
                        String value = URLDecoder.decode(pair.substring(eqIdx + 1), "UTF-8");
                        params.put(key, value);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to parse query params from URL: {}", url, e);
        }
        return params;
    }

    /**
     * 判断字符串是否可能是 URL。
     */
    private boolean isLikelyUrl(String s) {
        if (s == null || s.isEmpty()) return false;
        return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("//");
    }

    /**
     * 获取用户 LLM 配置。
     */
    private Map<String, String> getLlmConfig(User user) {
        Map<String, String> config = new LinkedHashMap<>();

        // 用户配置优先
        if (user != null && user.getLlmApiBase() != null && !user.getLlmApiBase().trim().isEmpty()) {
            config.put("llmApiBase", user.getLlmApiBase().trim());
        }
        if (user != null && user.getLlmModelName() != null && !user.getLlmModelName().trim().isEmpty()) {
            config.put("llmModelName", user.getLlmModelName().trim());
        }
        if (user != null && user.getLlmApiKey() != null && !user.getLlmApiKey().trim().isEmpty()) {
            config.put("llmApiKey", user.getLlmApiKey().trim());
        }

        // 环境变量兜底
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

    /**
     * 调用 LLM 补充元数据。
     */
    @SuppressWarnings("unchecked")
    private Map<String, String> callLlmForMetadata(String originalText, Map<String, Object> extracted,
                                                    Map<String, String> llmConfig, List<String> warnings) throws SkillParseException {
        Map<String, String> metadata = new HashMap<>();

        String systemPrompt = buildSystemPrompt();
        String userMessage = buildUserMessage(originalText, extracted);

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

            // 解析 LLM 返回的 JSON
            String jsonStr = llmOutput.trim();
            // 去除可能的 markdown 代码块
            if (jsonStr.startsWith("```json")) {
                jsonStr = jsonStr.substring(7);
            }
            if (jsonStr.startsWith("```")) {
                jsonStr = jsonStr.substring(3);
            }
            if (jsonStr.endsWith("```")) {
                jsonStr = jsonStr.substring(0, jsonStr.length() - 3);
            }
            jsonStr = jsonStr.trim();

            Map<String, Object> parsed = objectMapper.readValue(jsonStr, Map.class);

            // 提取字段
            if (parsed.get("name") != null) {
                metadata.put("name", parsed.get("name").toString());
            }
            if (parsed.get("description") != null) {
                metadata.put("description", parsed.get("description").toString());
            }
            if (parsed.get("operation") != null) {
                metadata.put("operation", parsed.get("operation").toString());
            }
            if (parsed.get("kind") != null) {
                metadata.put("kind", parsed.get("kind").toString().toLowerCase());
            }

            // 检查缺失字段
            if (!metadata.containsKey("name")) {
                warnings.add("LLM 未返回 name，使用默认值");
            }
            if (!metadata.containsKey("kind")) {
                metadata.put("kind", "api"); // 默认 api
                warnings.add("LLM 未返回 kind，默认使用 'api'");
            }

        } catch (LlmHttpClient.LlmHttpException e) {
            throw new SkillParseException("LLM 调用失败: " + e.getMessage(), "LLM_ERROR", e);
        } catch (Exception e) {
            warnings.add("LLM 返回格式解析失败，使用默认值: " + e.getMessage());
            log.warn("Failed to parse LLM response", e);
        }

        return metadata;
    }

    /**
     * 构建 LLM System Prompt。
     */
    private String buildSystemPrompt() {
        return "你是一个技能配置助手。用户提供了一个技能的自然语言描述和部分配置信息。\n\n" +
               "请根据以下规则生成 Skill 配置：\n\n" +
               "1. name: 从描述中提取或生成一个简短的中文技能名称（不超过50字符）\n" +
               "2. description: 使用用户提供的接口描述，如果没有则根据描述推断\n" +
               "3. operation: 从描述中提取或生成一个操作名称（如\"查询新闻\"、\"执行命令\"等）\n" +
               "4. kind: 根据描述推断类型：\n" +
               "   - 包含 URL/API/接口 → \"api\"\n" +
               "   - 包含 SSH/服务器/命令/executor → \"ssh\"\n" +
               "   - 包含 模板/提示词/prompt → \"template\"\n" +
               "   - 无法判断 → 使用 \"api\"\n\n" +
               "只返回以下 JSON 格式，不要添加任何解释：\n" +
               "{\"name\": \"...\", \"description\": \"...\", \"operation\": \"...\", \"kind\": \"api|ssh|template\"}";
    }

    /**
     * 构建 LLM User Message。
     */
    private String buildUserMessage(String originalText, Map<String, Object> extracted) {
        StringBuilder sb = new StringBuilder();
        sb.append("用户提供的配置信息：\n");
        if (extracted.get("url") != null) {
            sb.append("- URL: ").append(extracted.get("url")).append("\n");
        }
        if (extracted.get("method") != null) {
            sb.append("- Method: ").append(extracted.get("method")).append("\n");
        }
        if (extracted.get("headers") != null && !((Map) extracted.get("headers")).isEmpty()) {
            sb.append("- Headers: ").append(extracted.get("headers")).append("\n");
        }
        if (extracted.get("description") != null) {
            sb.append("- Description: ").append(extracted.get("description")).append("\n");
        }
        if (extracted.get("name") != null) {
            sb.append("- Name: ").append(extracted.get("name")).append("\n");
        }
        sb.append("\n用户原始描述：\n").append(originalText);
        return sb.toString();
    }

    /**
     * 创建 Chat Message。
     */
    private Map<String, String> createMessage(String role, String content) {
        Map<String, String> msg = new LinkedHashMap<>();
        msg.put("role", role);
        msg.put("content", content);
        return msg;
    }

    /**
     * 组装 Skill 对象。
     */
    @SuppressWarnings("unchecked")
    Skill assembleSkill(Map<String, Object> extracted, Map<String, String> llmMetadata, List<String> warnings) {
        Skill skill = new Skill();

        // name: 显式提取 > LLM > 默认
        String name = (String) extracted.get("name");
        if (name == null) {
            name = llmMetadata.get("name");
        }
        if (name == null) {
            // 从 description 截取
            String desc = (String) extracted.get("description");
            if (desc != null && !desc.isEmpty()) {
                name = desc.length() > 50 ? desc.substring(0, 50) : desc;
            } else {
                name = "未命名技能";
            }
            warnings.add("name 使用默认值");
        }
        skill.setName(name.trim());

        // description: 显式 > LLM > name
        String desc = (String) extracted.get("description");
        if (desc == null) {
            desc = llmMetadata.get("description");
        }
        if (desc == null) {
            desc = name;
        }
        skill.setDescription(desc.trim());

        // type: 根据 kind 确定
        String kind = llmMetadata.get("kind");
        if (kind == null) {
            kind = "api";
        }
        String type = kindToType(kind);
        skill.setType(type);

        // executionMode: 固定 CONFIG
        skill.setExecutionMode("CONFIG");

        // enabled/requiresConfirmation/visibility: 默认值
        skill.setEnabled(true);
        skill.setRequiresConfirmation(false);
        skill.setVisibility(SkillVisibility.PRIVATE);

        // configuration
        String configuration = buildConfiguration(kind, extracted, llmMetadata, warnings);
        skill.setConfiguration(configuration);

        return skill;
    }

    /**
     * 将 kind 转换为 type。
     */
    private String kindToType(String kind) {
        if ("api".equalsIgnoreCase(kind)) {
            return "API";
        } else if ("ssh".equalsIgnoreCase(kind)) {
            return "SSH";
        } else if ("template".equalsIgnoreCase(kind)) {
            return "TEMPLATE";
        }
        return "API";
    }

    /**
     * 构建 configuration JSON。
     */
    private String buildConfiguration(String kind, Map<String, Object> extracted, Map<String, String> llmMetadata, List<String> warnings) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("kind", kind.toLowerCase());

        if ("api".equalsIgnoreCase(kind)) {
            return buildApiConfiguration(config, extracted, llmMetadata, warnings);
        } else if ("ssh".equalsIgnoreCase(kind)) {
            return buildSshConfiguration(config, extracted, llmMetadata, warnings);
        } else if ("template".equalsIgnoreCase(kind)) {
            return buildTemplateConfiguration(config, extracted, llmMetadata, warnings);
        }

        // 默认返回 api 配置
        return buildApiConfiguration(config, extracted, llmMetadata, warnings);
    }

    /**
     * 构建 API 类型 configuration。
     */
    @SuppressWarnings("unchecked")
    private String buildApiConfiguration(Map<String, Object> config, Map<String, Object> extracted,
                                         Map<String, String> llmMetadata, List<String> warnings) {
        // operation
        String operation = llmMetadata.get("operation");
        if (operation == null) {
            operation = "execute";
            warnings.add("operation 使用默认值 'execute'");
        }
        config.put("operation", operation);

        // method
        String method = (String) extracted.get("method");
        if (method == null) {
            method = "GET";
        }
        config.put("method", method.toUpperCase());

        // endpoint
        String endpoint = (String) extracted.get("url");
        if (endpoint != null) {
            // 去掉 query string 部分（已单独提取）
            int queryIdx = endpoint.indexOf('?');
            if (queryIdx > 0) {
                endpoint = endpoint.substring(0, queryIdx);
            }
        }
        config.put("endpoint", endpoint != null ? endpoint : "");

        // headers
        Map<String, String> headers = (Map<String, String>) extracted.get("headers");
        if (headers != null && !headers.isEmpty()) {
            config.put("headers", headers);
        } else {
            config.put("headers", new HashMap<String, String>());
        }

        // queryParams
        Map<String, String> queryParams = (Map<String, String>) extracted.get("queryParams");
        if (queryParams != null && !queryParams.isEmpty()) {
            config.put("queryParams", queryParams);
        }

        try {
            return objectMapper.writeValueAsString(config);
        } catch (Exception e) {
            log.error("Failed to serialize API configuration", e);
            return "{}";
        }
    }

    /**
     * 构建 SSH 类型 configuration。
     */
    private String buildSshConfiguration(Map<String, Object> config, Map<String, Object> extracted,
                                         Map<String, String> llmMetadata, List<String> warnings) {
        // operation
        String operation = llmMetadata.get("operation");
        if (operation == null) {
            operation = "execute";
            warnings.add("SSH operation 使用默认值 'execute'");
        }
        config.put("operation", operation);

        // lookup - 尝试从描述中提取服务器信息
        String description = (String) extracted.get("description");
        String lookup = extractServerName(description);
        config.put("lookup", lookup != null ? lookup : "");

        // executor - 从 URL 或描述中提取命令
        String url = (String) extracted.get("url");
        String executor = url != null ? url : (description != null ? description : "");
        if (executor.length() > 200) {
            executor = executor.substring(0, 200);
        }
        config.put("executor", executor);

        // preset
        config.put("preset", "server-command");

        try {
            return objectMapper.writeValueAsString(config);
        } catch (Exception e) {
            log.error("Failed to serialize SSH configuration", e);
            return "{}";
        }
    }

    /**
     * 构建 TEMPLATE 类型 configuration。
     */
    private String buildTemplateConfiguration(Map<String, Object> config, Map<String, Object> extracted,
                                              Map<String, String> llmMetadata, List<String> warnings) {
        // prompt - 使用 description 或 name
        String description = (String) extracted.get("description");
        String name = (String) extracted.get("name");
        String prompt = description != null ? description : (name != null ? name : "");
        config.put("prompt", prompt);

        try {
            return objectMapper.writeValueAsString(config);
        } catch (Exception e) {
            log.error("Failed to serialize TEMPLATE configuration", e);
            return "{}";
        }
    }

    /**
     * 从描述中提取服务器名称。
     */
    private String extractServerName(String text) {
        if (text == null || text.isEmpty()) {
            return null;
        }
        // 简单匹配：服务器、server、主机 等关键词后的名称
        Pattern p = Pattern.compile("(?:服务器|server|主机|host)[：:]?\\s*(\\S+)", Pattern.CASE_INSENSITIVE);
        Matcher m = p.matcher(text);
        if (m.find()) {
            return m.group(1).trim();
        }
        return null;
    }

    /**
     * 解析异常。
     */
    public static class SkillParseException extends Exception {
        private final String code;

        public SkillParseException(String message, String code) {
            super(message);
            this.code = code;
        }

        public SkillParseException(String message, String code, Throwable cause) {
            super(message, cause);
            this.code = code;
        }

        public String getCode() {
            return code;
        }
    }
}
