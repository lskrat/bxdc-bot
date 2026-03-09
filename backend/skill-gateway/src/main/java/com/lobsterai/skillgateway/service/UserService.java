package com.lobsterai.skillgateway.service;

import com.lobsterai.skillgateway.entity.User;
import com.lobsterai.skillgateway.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
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
