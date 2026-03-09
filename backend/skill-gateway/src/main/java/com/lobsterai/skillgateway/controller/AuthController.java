package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.entity.User;
import com.lobsterai.skillgateway.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*") // Allow CORS for frontend
public class AuthController {
    
    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> payload) {
        String id = payload.get("id");
        String nickname = payload.get("nickname");
        
        try {
            User user = userService.register(id, nickname);
            return ResponseEntity.ok(user);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Registration failed"));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> payload) {
        String id = payload.get("id");
        if (id == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "ID is required"));
        }

        User user = userService.login(id);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid User ID"));
        }
        return ResponseEntity.ok(user);
    }
}
