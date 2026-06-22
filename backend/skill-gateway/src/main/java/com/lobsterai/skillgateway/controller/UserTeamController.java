package com.lobsterai.skillgateway.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.lobsterai.skillgateway.entity.UserTeam;
import com.lobsterai.skillgateway.service.UserTeamService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.Map;

@RestController
@RequestMapping("/api/user-teams")
@CrossOrigin(origins = "*")
public class UserTeamController {

    private final UserTeamService userTeamService;

    public UserTeamController(UserTeamService userTeamService) {
        this.userTeamService = userTeamService;
    }

    @PostMapping
    public ResponseEntity<?> createUserTeam(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody Map<String, String> payload) {
        if (userId == null || userId.trim().isEmpty()) {
            return ResponseEntity.status(401).body(Collections.singletonMap("error", "X-User-Id header is required"));
        }
        String teamName = payload != null ? payload.get("teamName") : null;
        String members = payload != null ? payload.get("members") : null;
        try {
            UserTeam userTeam = userTeamService.createUserTeam(teamName, members, userId.trim());
            return ResponseEntity.ok(userTeam);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping
    public ResponseEntity<?> getUserTeams(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer size) {
        if (userId == null || userId.trim().isEmpty()) {
            return ResponseEntity.status(401).body(Collections.singletonMap("error", "X-User-Id header is required"));
        }
        try {
            IPage<UserTeam> userTeams = userTeamService.getUserTeamsByCreatorId(userId.trim(), page, size);
            return ResponseEntity.ok(userTeams);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getUserTeamById(@PathVariable Long id) {
        UserTeam userTeam = userTeamService.getUserTeamById(id);
        if (userTeam == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(userTeam);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateUserTeam(
            @PathVariable Long id,
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody Map<String, String> payload) {
        if (userId == null || userId.trim().isEmpty()) {
            return ResponseEntity.status(401).body(Collections.singletonMap("error", "X-User-Id header is required"));
        }
        String teamName = payload != null ? payload.get("teamName") : null;
        String members = payload != null ? payload.get("members") : null;
        try {
            UserTeam userTeam = userTeamService.updateUserTeam(id, teamName, members, userId.trim());
            return ResponseEntity.ok(userTeam);
        } catch (IllegalArgumentException e) {
            if ("团队不存在".equals(e.getMessage())) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteUserTeam(
            @PathVariable Long id,
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        if (userId == null || userId.trim().isEmpty()) {
            return ResponseEntity.status(401).body(Collections.singletonMap("error", "X-User-Id header is required"));
        }
        try {
            userTeamService.deleteUserTeam(id);
            return ResponseEntity.ok(Collections.singletonMap("message", "团队删除成功"));
        } catch (IllegalArgumentException e) {
            if ("团队不存在".equals(e.getMessage())) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        }
    }
}
