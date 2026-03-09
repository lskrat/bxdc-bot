package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.entity.User;
import com.lobsterai.skillgateway.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
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
}
