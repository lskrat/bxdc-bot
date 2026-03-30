package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.dto.LlmSettingsResponse;
import com.lobsterai.skillgateway.dto.LlmSettingsUpdateRequest;
import com.lobsterai.skillgateway.entity.User;
import com.lobsterai.skillgateway.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/user")
@CrossOrigin(origins = "*")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getUser(@PathVariable String id) {
        User user = userService.getUser(id);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(user);
    }

    @PutMapping("/{id}/avatar")
    public ResponseEntity<?> updateAvatar(@PathVariable String id, @RequestBody Map<String, String> payload) {
        String avatar = payload.get("avatar");
        if (avatar == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Avatar is required"));
        }
        try {
            User user = userService.updateAvatar(id, avatar);
            return ResponseEntity.ok(user);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/{id}/llm-settings")
    public ResponseEntity<?> getLlmSettings(@PathVariable String id) {
        LlmSettingsResponse r = userService.getLlmSettingsForApi(id);
        if (r == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(r);
    }

    @PutMapping("/{id}/llm-settings")
    public ResponseEntity<?> putLlmSettings(@PathVariable String id, @RequestBody LlmSettingsUpdateRequest body) {
        try {
            User user = userService.updateLlmSettings(id, body);
            LlmSettingsResponse r = userService.getLlmSettingsForApi(user.getId());
            return ResponseEntity.ok(r);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Proxies to agent-core avatar generation with merged LLM config (user + env on gateway JVM).
     */
    @PostMapping("/{id}/avatar/generate")
    public ResponseEntity<?> generateAvatar(@PathVariable String id, @RequestBody Map<String, String> body) {
        String nickname = body.get("nickname");
        if (nickname == null || nickname.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "nickname is required"));
        }
        User user = userService.getUser(id);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }
        if (!userService.hasEffectiveLlmApiKey(user)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "LLM API key not configured",
                    "avatar", "👤"
            ));
        }
        Map<String, String> merged = userService.mergeLlmConfigForAgent(user);
        Map<String, Object> payload = new HashMap<>();
        payload.put("nickname", nickname.trim());
        payload.put("llmApiBase", merged.get("llmApiBase"));
        payload.put("llmModelName", merged.get("llmModelName"));
        payload.put("llmApiKey", merged.get("llmApiKey"));
        try {
            Object res = userService.proxyAvatarGenerate(payload);
            return ResponseEntity.ok(res);
        } catch (Exception e) {
            return ResponseEntity.status(502).body(Map.of("error", "Avatar service error: " + e.getMessage()));
        }
    }
}
