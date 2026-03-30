package com.lobsterai.skillgateway.service;

import com.lobsterai.skillgateway.dto.LlmSettingsResponse;
import com.lobsterai.skillgateway.dto.LlmSettingsUpdateRequest;
import com.lobsterai.skillgateway.entity.User;
import com.lobsterai.skillgateway.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final ApiProxyService apiProxyService;

    @Value("${agent.core.url:http://localhost:3000}")
    private String agentCoreUrl;

    public UserService(UserRepository userRepository, ApiProxyService apiProxyService) {
        this.userRepository = userRepository;
        this.apiProxyService = apiProxyService;
    }

    private static String trimOrNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String envOrNull(String name) {
        String v = System.getenv(name);
        return trimOrNull(v);
    }

    /**
     * Merge user-stored fields with process env (same rules as agent-core). User non-empty wins per field.
     */
    public Map<String, String> mergeLlmConfigForAgent(User user) {
        Map<String, String> m = new LinkedHashMap<>();
        String envBase = envOrNull("OPENAI_API_BASE");
        String envModel = envOrNull("OPENAI_MODEL_NAME");
        if (envModel == null) envModel = "gpt-4";
        String envKey = envOrNull("OPENAI_API_KEY");

        String uBase = user != null ? trimOrNull(user.getLlmApiBase()) : null;
        String uModel = user != null ? trimOrNull(user.getLlmModelName()) : null;
        String uKey = user != null ? trimOrNull(user.getLlmApiKey()) : null;

        m.put("llmApiBase", uBase != null ? uBase : envBase);
        m.put("llmModelName", uModel != null ? uModel : envModel);
        m.put("llmApiKey", uKey != null ? uKey : envKey);
        return m;
    }

    public boolean hasEffectiveLlmApiKey(User user) {
        String k = mergeLlmConfigForAgent(user).get("llmApiKey");
        return k != null && !k.isBlank();
    }

    public LlmSettingsResponse getLlmSettingsForApi(String userId) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return null;
        }
        boolean hasStoredKey = trimOrNull(user.getLlmApiKey()) != null;
        boolean effective = hasEffectiveLlmApiKey(user);
        return new LlmSettingsResponse(
                trimOrNull(user.getLlmApiBase()),
                trimOrNull(user.getLlmModelName()),
                hasStoredKey,
                effective
        );
    }

    public User updateLlmSettings(String userId, LlmSettingsUpdateRequest req) {
        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (req.apiBase != null) {
            user.setLlmApiBase(trimOrNull(req.apiBase));
        }
        if (req.modelName != null) {
            user.setLlmModelName(trimOrNull(req.modelName));
        }
        if (req.apiKey != null) {
            if (req.apiKey.isEmpty()) {
                user.setLlmApiKey(null);
            } else {
                user.setLlmApiKey(trimOrNull(req.apiKey));
            }
        }
        return userRepository.save(user);
    }

    /**
     * Map of optional overrides to send to agent-core (only non-null entries from DB).
     */
    public Map<String, String> userLlmOverridesFromDb(User user) {
        Map<String, String> o = new LinkedHashMap<>();
        if (user == null) return o;
        if (trimOrNull(user.getLlmApiBase()) != null) o.put("llmApiBase", user.getLlmApiBase().trim());
        if (trimOrNull(user.getLlmModelName()) != null) o.put("llmModelName", user.getLlmModelName().trim());
        if (trimOrNull(user.getLlmApiKey()) != null) o.put("llmApiKey", user.getLlmApiKey().trim());
        return o;
    }

    public Object proxyAvatarGenerate(Map<String, Object> payload) {
        return apiProxyService.callApi(agentCoreUrl + "/features/avatar/generate", "POST",
                Map.of("Content-Type", "application/json"), payload);
    }

    public User register(String id, String nickname) {
        if (id == null || !id.matches("\\d{6}")) {
            throw new IllegalArgumentException("User ID must be exactly 6 digits.");
        }
        if (nickname == null || nickname.length() > 10) {
            throw new IllegalArgumentException("Nickname must be no longer than 10 characters.");
        }
        if (userRepository.existsById(id)) {
            throw new IllegalArgumentException("User ID already exists.");
        }

        // Default avatar (Generation happens asynchronously in frontend)
        String avatar = "👤";

        User user = new User();
        user.setId(id);
        user.setNickname(nickname);
        user.setAvatar(avatar);
        user.setCreatedAt(LocalDateTime.now());
        
        userRepository.save(user);

        // Inject initial memory (Call Agent Core)
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("userId", id);
            // Injected as explicit memory.
            // Using "我的昵称是..." allows the agent to recall it naturally.
            body.put("text", "我的昵称是" + nickname);
            body.put("role", "user"); // Attribute to user so it feels like user said it
            
            apiProxyService.callApi(agentCoreUrl + "/memory/add", "POST", null, body);
        } catch (Exception e) {
            System.err.println("[UserService] Failed to inject initial memory: " + e.getMessage());
        }

        return user;
    }

    public User updateAvatar(String id, String avatar) {
        User user = userRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("User not found"));
        user.setAvatar(avatar);
        return userRepository.save(user);
    }

    public User login(String id) {
        if (id == null) return null;
        return userRepository.findById(id).orElse(null);
    }

    public User getUser(String id) {
        if (id == null) return null;
        return userRepository.findById(id).orElse(null);
    }
}
