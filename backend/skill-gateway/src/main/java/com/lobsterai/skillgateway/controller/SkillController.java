package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.service.ApiProxyService;
import com.lobsterai.skillgateway.service.LinuxScriptExecutionService;
import com.lobsterai.skillgateway.service.SSHExecutorService;
import com.lobsterai.skillgateway.service.SecurityFilterService;
import com.lobsterai.skillgateway.service.ServerLedgerService;
import com.lobsterai.skillgateway.service.SkillService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.math.BigInteger;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
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

    private final SSHExecutorService sshExecutorService;
    private final ApiProxyService apiProxyService;
    private final SecurityFilterService securityFilterService;
    private final SkillService skillService;
    private final LinuxScriptExecutionService linuxScriptExecutionService;
    private final ServerLedgerService serverLedgerService;

    public SkillController(
            SSHExecutorService sshExecutorService,
            ApiProxyService apiProxyService,
            SecurityFilterService securityFilterService,
            SkillService skillService,
            LinuxScriptExecutionService linuxScriptExecutionService,
            ServerLedgerService serverLedgerService
    ) {
        this.sshExecutorService = sshExecutorService;
        this.apiProxyService = apiProxyService;
        this.securityFilterService = securityFilterService;
        this.skillService = skillService;
        this.linuxScriptExecutionService = linuxScriptExecutionService;
        this.serverLedgerService = serverLedgerService;
    }

    // --- Skill Management (CRUD) ---

    @GetMapping
    public List<Skill> getAllSkills() {
        return skillService.getAllSkills();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Skill> getSkillById(@PathVariable Long id) {
        return skillService.getSkillById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> createSkill(@RequestBody Skill skill) {
        try {
            return ResponseEntity.ok(skillService.createSkill(skill));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateSkill(@PathVariable Long id, @RequestBody Skill skillDetails) {
        try {
            return ResponseEntity.ok(skillService.updateSkill(id, skillDetails));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteSkill(@PathVariable Long id) {
        try {
            skillService.deleteSkill(id);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
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
        if (!securityFilterService.isCommandSafe(request.getCommand())) {
            return ResponseEntity.badRequest().body("Command blocked by security policy");
        }

        try {
            if (userId != null && !userId.isBlank()) {
                // Ledger mode: Resolve credentials from server ledger
                return serverLedgerService.getServerLedgerByIp(userId, request.getHost())
                        .map(ledger -> {
                            try {
                                String output = sshExecutorService.executeCommandWithPassword(
                                        ledger.getIp(),
                                        request.getPort(),
                                        ledger.getUsername(),
                                        ledger.getPassword(),
                                        request.getCommand()
                                );
                                return ResponseEntity.ok(output);
                            } catch (IOException e) {
                                return ResponseEntity.internalServerError().body("SSH execution failed: " + e.getMessage());
                            }
                        })
                        .orElseGet(() -> ResponseEntity.badRequest().body("Server not found in user ledger: " + request.getHost()));
            } else {
                // Legacy mode: Use provided credentials
                if (request.getUsername() == null || request.getPrivateKey() == null) {
                    return ResponseEntity.badRequest().body("Missing username/privateKey for legacy SSH execution");
                }
                String output = sshExecutorService.executeCommand(
                        request.getHost(),
                        request.getPort(),
                        request.getUsername(),
                        request.getPrivateKey(),
                        request.getCommand()
                );
                return ResponseEntity.ok(output);
            }
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("SSH execution failed: " + e.getMessage());
        }
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
            Object response = apiProxyService.callApi(request.getUrl(), request.getMethod(), request.getHeaders(), request.getBody());
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
     * 支持：时间戳转日期、加减乘除、阶乘、平方、开方。
     *
     * @param request 包含 operation 和 operands 的请求体
     * @return 成功时 { "result": <value> }，失败时 { "error": "<message>" }
     */
    @PostMapping("/compute")
    public ResponseEntity<Map<String, Object>> compute(@RequestBody ComputeRequest request) {
        try {
            Object result = executeCompute(request.getOperation(), request.getOperands());
            return ResponseEntity.ok(Map.of("result", result));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.ok(Map.of("error", e.getMessage()));
        }
    }

    private Object executeCompute(String operation, List<Number> operands) {
        if (operation == null || operation.isBlank()) {
            throw new IllegalArgumentException("operation is required");
        }
        if (operands == null) {
            throw new IllegalArgumentException("operands is required");
        }

        return switch (operation) {
            case "add" -> {
                requireOperands(operands, 2);
                double a = toDouble(operands.get(0)), b = toDouble(operands.get(1));
                yield a + b;
            }
            case "subtract" -> {
                requireOperands(operands, 2);
                double a = toDouble(operands.get(0)), b = toDouble(operands.get(1));
                yield a - b;
            }
            case "multiply" -> {
                requireOperands(operands, 2);
                double a = toDouble(operands.get(0)), b = toDouble(operands.get(1));
                yield a * b;
            }
            case "divide" -> {
                requireOperands(operands, 2);
                double a = toDouble(operands.get(0)), b = toDouble(operands.get(1));
                if (b == 0) throw new IllegalArgumentException("division by zero");
                yield a / b;
            }
            case "factorial" -> {
                requireOperands(operands, 1);
                int n = toInt(operands.get(0));
                if (n < 0) throw new IllegalArgumentException("factorial requires non-negative integer");
                if (n > 170) throw new IllegalArgumentException("factorial overflow: n must be <= 170");
                yield factorial(n).toString();
            }
            case "square" -> {
                requireOperands(operands, 1);
                double x = toDouble(operands.get(0));
                yield x * x;
            }
            case "sqrt" -> {
                requireOperands(operands, 1);
                double x = toDouble(operands.get(0));
                if (x < 0) throw new IllegalArgumentException("sqrt requires non-negative number");
                yield Math.sqrt(x);
            }
            case "timestamp_to_date" -> {
                requireOperands(operands, 1);
                long ts = operands.get(0).longValue();
                // 秒级时间戳（< 10^12）自动转为毫秒，兼容常见 Unix 秒级时间戳
                if (ts > 0 && ts < 10_000_000_000_000L) {
                    ts = ts * 1000;
                }
                LocalDate date = Instant.ofEpochMilli(ts).atZone(ZoneId.systemDefault()).toLocalDate();
                yield date.format(DateTimeFormatter.ISO_LOCAL_DATE);
            }
            default -> throw new IllegalArgumentException("unknown operation: " + operation);
        };
    }

    private static void requireOperands(List<Number> operands, int expected) {
        if (operands.size() != expected) {
            throw new IllegalArgumentException("expected " + expected + " operand(s), got " + operands.size());
        }
    }

    private static double toDouble(Number n) {
        return n == null ? 0 : n.doubleValue();
    }

    private static int toInt(Number n) {
        return n == null ? 0 : n.intValue();
    }

    private static BigInteger factorial(int n) {
        if (n <= 1) return BigInteger.ONE;
        BigInteger r = BigInteger.ONE;
        for (int i = 2; i <= n; i++) {
            r = r.multiply(BigInteger.valueOf(i));
        }
        return r;
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
        private List<Number> operands;

        public String getOperation() { return operation; }
        public void setOperation(String operation) { this.operation = operation; }
        public List<Number> getOperands() { return operands; }
        public void setOperands(List<Number> operands) { this.operands = operands; }
    }
}
