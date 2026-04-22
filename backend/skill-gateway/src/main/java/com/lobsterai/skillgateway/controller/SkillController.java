package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.service.BuiltinToolExecutionService;
import com.lobsterai.skillgateway.service.LinuxScriptExecutionService;
import com.lobsterai.skillgateway.service.ServerLedgerService;
import com.lobsterai.skillgateway.service.SkillService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.NoSuchElementException;
import java.util.List;
import java.util.Map;

/**
 * Skill 控制器。
 * <p>
 * 暴露 RESTful 接口供 Agent Core 调用，以执行具体的 SSH 命令或 API 请求。
 * 包含安全检查逻辑。
 * 此外，提供 Skill 的统一管理（CRUD）。
 * </p>
 */
@RestController
@RequestMapping("/api/skills")
public class SkillController {

    private final SkillService skillService;
    private final LinuxScriptExecutionService linuxScriptExecutionService;
    private final ServerLedgerService serverLedgerService;
    private final BuiltinToolExecutionService builtinToolExecutionService;

    public SkillController(
            SkillService skillService,
            LinuxScriptExecutionService linuxScriptExecutionService,
            ServerLedgerService serverLedgerService,
            BuiltinToolExecutionService builtinToolExecutionService
    ) {
        this.skillService = skillService;
        this.linuxScriptExecutionService = linuxScriptExecutionService;
        this.serverLedgerService = serverLedgerService;
        this.builtinToolExecutionService = builtinToolExecutionService;
    }

    // --- Skill Management (CRUD) ---

    @GetMapping
    public List<Skill> getAllSkills(
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        return skillService.listSkillsForUser(userId);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Skill> getSkillById(
            @PathVariable Long id,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        return skillService.getSkillByIdForUser(id, userId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> createSkill(
            @RequestBody Skill skill,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        try {
            return ResponseEntity.ok(skillService.createSkill(skill, userId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateSkill(
            @PathVariable Long id,
            @RequestBody Skill skillDetails,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        try {
            return ResponseEntity.ok(skillService.updateSkill(id, skillDetails, userId));
        } catch (IllegalArgumentException e) {
            if (e.getMessage() != null && e.getMessage().startsWith("Skill not found")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteSkill(
            @PathVariable Long id,
            @RequestHeader(value = "X-User-Id", required = false) String userId
    ) {
        try {
            skillService.deleteSkill(id, userId);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/server-lookup")
    public ResponseEntity<?> lookupServer(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestParam String name
    ) {
        if (userId == null || userId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "X-User-Id header is required for server lookup"));
        }
        return serverLedgerService.getServerLedgerByName(userId, name)
                .map(ledger -> {
                    Map<String, Object> response = new java.util.HashMap<>();
                    response.put("ip", ledger.getIp());
                    response.put("username", ledger.getUsername());
                    response.put("password", ledger.getPassword());
                    return ResponseEntity.ok(response);
                })
                .orElseGet(() -> ResponseEntity.status(404).body(Map.of("error", "Server not found with name: " + name)));
    }

    // --- Skill Execution ---

    /**
     * 执行 SSH 命令。
     *
     * @param request 包含主机、端口、认证信息和命令的请求体
     * @return 命令执行结果或错误信息
     */
    @PostMapping("/ssh")
    public ResponseEntity<String> executeSshCommand(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody SshRequest request
    ) {
        return builtinToolExecutionService.executeSsh(request, userId);
    }

    /**
     * 调用外部 API。
     *
     * @param request 包含 URL、方法、头信息和请求体的请求对象
     * @return 外部 API 的响应
     */
    @PostMapping("/api")
    public ResponseEntity<Object> callApi(@RequestBody ApiRequest request) {
        try {
            Object response = builtinToolExecutionService.callExternalApi(request);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("API call failed: " + e.getMessage());
        }
    }

    /**
     * 在预配置的 Linux 服务器上执行脚本命令。
     *
     * @param request 包含 serverId 和 command 的请求体
     * @return 成功时 { "result": "..." }，失败时返回错误信息
     */
    @PostMapping("/linux-script")
    public ResponseEntity<Map<String, Object>> executeLinuxScript(@RequestBody LinuxScriptRequest request) {
        try {
            String output = linuxScriptExecutionService.execute(request.getServerId(), request.getCommand());
            return ResponseEntity.ok(Map.of("result", output));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(404).body(Map.of("error", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Linux script execution failed: " + e.getMessage()));
        }
    }

    /**
     * 执行计算运算。
     * 支持：时间戳转日期、日期差值、加减乘除、阶乘、平方、开方。
     *
     * @param request 包含 operation 和 operands 的请求体
     * @return 成功时 { "result": <value> }，失败时 { "error": "<message>" }
     */
    @PostMapping("/compute")
    public ResponseEntity<Map<String, Object>> compute(@RequestBody ComputeRequest request) {
        return ResponseEntity.ok(builtinToolExecutionService.compute(request));
    }

    /**
     * SSH 请求数据传输对象。
     */
    public static class SshRequest {
        private String host;
        private int port = 22;
        private String username;
        private String privateKey;
        private String command;
        // getters/setters omitted for brevity
        public String getHost() { return host; }
        public void setHost(String host) { this.host = host; }
        public int getPort() { return port; }
        public void setPort(int port) { this.port = port; }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getPrivateKey() { return privateKey; }
        public void setPrivateKey(String privateKey) { this.privateKey = privateKey; }
        public String getCommand() { return command; }
        public void setCommand(String command) { this.command = command; }
    }

    /**
     * API 调用请求数据传输对象。
     */
    public static class ApiRequest {
        private String url;
        private String method;
        private Map<String, String> headers;
        private Object body;
        // getters/setters
        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }
        public String getMethod() { return method; }
        public void setMethod(String method) { this.method = method; }
        public Map<String, String> getHeaders() { return headers; }
        public void setHeaders(Map<String, String> headers) { this.headers = headers; }
        public Object getBody() { return body; }
        public void setBody(Object body) { this.body = body; }
    }

    /**
     * 计算请求数据传输对象。
     */
    public static class ComputeRequest {
        private String operation;
        private List<Object> operands;

        public String getOperation() { return operation; }
        public void setOperation(String operation) { this.operation = operation; }
        public List<Object> getOperands() { return operands; }
        public void setOperands(List<Object> operands) { this.operands = operands; }
    }
}
