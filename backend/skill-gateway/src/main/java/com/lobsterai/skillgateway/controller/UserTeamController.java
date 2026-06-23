package com.lobsterai.skillgateway.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.lobsterai.skillgateway.entity.UserTeam;
import com.lobsterai.skillgateway.service.UserTeamService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.Map;

/**
 * 团队功能
 */
@RestController
@RequestMapping("/api/user-teams")
@CrossOrigin(origins = "*")
public class UserTeamController {

    private final UserTeamService userTeamService;

    public UserTeamController(UserTeamService userTeamService) {
        this.userTeamService = userTeamService;
    }


    /**
     * 1. 新增团队（20260626）
     * http://localhost:18080/api/user-teams
     * POST JSON
     * 参数：
     * header:
     * X-User-Id:123456
     * Content-Type:application/json
     * JSON:
     * {"teamName":"测试团队","members":"100001,100002,100003"}
     *
     * @param userId
     * @param payload
     * @return
     */
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

    /**
     * 2. 查询团队列表（20260626）
     * 查询当前用户创建的团队列表（分页）
     * http://localhost:18080/api/user-teams?page=1&size=20
     * GET
     * 参数：
     * header:
     * X-User-Id:123456
     *
     * @param userId
     * @param page
     * @param size
     * @return
     */
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

    /**
     * 3. 查询单个团队（20260626）
     * 根据团队ID查询团队详情
     * http://localhost:18080/api/user-teams/1
     * GET
     * 参数：
     * header:
     * X-User-Id:123456
     *
     * @param userId 用户id
     * @return
     */
    @GetMapping("/{userId}")
    public ResponseEntity<?> getUserTeamById(@PathVariable Long userId) {
        UserTeam userTeam = userTeamService.getUserTeamById(userId);
        if (userTeam == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(userTeam);
    }

    /**
     * 4. 更新团队（20260626）
     * 更新指定团队的名称和成员信息
     * http://localhost:18080/api/user-teams/1
     * PUT JSON
     * 参数：
     * header:
     * X-User-Id:123456
     * Content-Type:application/json
     * JSON:
     * {"teamName":"更新后的团队名称","members":"100001,100002,100003,100004"}
     *
     * @param id
     * @param userId
     * @param payload
     * @return
     */
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

    /**
     * 5. 删除团队（20260626）
     * 逻辑删除指定团队（标记为已删除状态）
     * http://localhost:18080/api/user-teams/1
     * DELETE
     * 参数：
     * header:
     * X-User-Id:123456
     *
     * @param id
     * @param userId
     * @return
     */
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
