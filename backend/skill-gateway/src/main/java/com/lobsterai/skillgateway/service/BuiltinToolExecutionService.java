package com.lobsterai.skillgateway.service;

import com.lobsterai.skillgateway.audit.HttpClientAuditMode;
import com.lobsterai.skillgateway.controller.SkillController;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.math.BigInteger;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

/**
 * Shared execution logic for built-in tools (api proxy, compute, SSH), used by
 * {@link com.lobsterai.skillgateway.controller.SkillController} and {@link com.lobsterai.skillgateway.controller.SystemSkillController}.
 */
@Service
public class BuiltinToolExecutionService {

    private final SSHExecutorService sshExecutorService;
    private final ApiProxyService apiProxyService;
    private final SecurityFilterService securityFilterService;
    private final ServerLedgerService serverLedgerService;
    private final GatewayOutboundAuditService gatewayOutboundAuditService;

    public BuiltinToolExecutionService(
            SSHExecutorService sshExecutorService,
            ApiProxyService apiProxyService,
            SecurityFilterService securityFilterService,
            ServerLedgerService serverLedgerService,
            GatewayOutboundAuditService gatewayOutboundAuditService
    ) {
        this.sshExecutorService = sshExecutorService;
        this.apiProxyService = apiProxyService;
        this.securityFilterService = securityFilterService;
        this.serverLedgerService = serverLedgerService;
        this.gatewayOutboundAuditService = gatewayOutboundAuditService;
    }

    public Object callExternalApi(SkillController.ApiRequest request) throws Exception {
        return apiProxyService.callApi(
                request.getUrl(),
                request.getMethod(),
                request.getHeaders(),
                request.getBody(),
                HttpClientAuditMode.SKILL_OUTBOUND
        );
    }

    public Map<String, Object> compute(SkillController.ComputeRequest request) {
        try {
            Object result = executeCompute(request.getOperation(), request.getOperands());
            return Map.of("result", result);
        } catch (IllegalArgumentException e) {
            return Map.of("error", e.getMessage());
        }
    }

    public ResponseEntity<String> executeSsh(SkillController.SshRequest request, String userId) {
        if (!securityFilterService.isCommandSafe(request.getCommand())) {
            gatewayOutboundAuditService.recordSsh(
                    userId,
                    request.getHost(),
                    request.getPort(),
                    request.getCommand(),
                    false,
                    "Command blocked by security policy",
                    "skill.ssh"
            );
            return ResponseEntity.badRequest().body("Command blocked by security policy");
        }
        if (userId != null && !userId.isBlank()) {
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
                            gatewayOutboundAuditService.recordSsh(
                                    userId,
                                    ledger.getIp(),
                                    request.getPort(),
                                    request.getCommand(),
                                    true,
                                    null,
                                    "skill.ssh"
                            );
                            return ResponseEntity.ok(output);
                        } catch (IOException e) {
                            gatewayOutboundAuditService.recordSsh(
                                    userId,
                                    ledger.getIp(),
                                    request.getPort(),
                                    request.getCommand(),
                                    false,
                                    e.getMessage(),
                                    "skill.ssh"
                            );
                            return ResponseEntity.internalServerError().body("SSH execution failed: " + e.getMessage());
                        }
                    })
                    .orElseGet(() -> {
                        gatewayOutboundAuditService.recordSsh(
                                userId,
                                request.getHost(),
                                request.getPort(),
                                request.getCommand(),
                                false,
                                "Server not found in user ledger: " + request.getHost(),
                                "skill.ssh"
                        );
                        return ResponseEntity.badRequest().body("Server not found in user ledger: " + request.getHost());
                    });
        }
        if (request.getUsername() == null || request.getPrivateKey() == null) {
            gatewayOutboundAuditService.recordSsh(
                    userId,
                    request.getHost(),
                    request.getPort(),
                    request.getCommand(),
                    false,
                    "Missing username/privateKey for legacy SSH execution",
                    "skill.ssh"
            );
            return ResponseEntity.badRequest().body("Missing username/privateKey for legacy SSH execution");
        }
        try {
            String output = sshExecutorService.executeCommand(
                    request.getHost(),
                    request.getPort(),
                    request.getUsername(),
                    request.getPrivateKey(),
                    request.getCommand()
            );
            gatewayOutboundAuditService.recordSsh(
                    userId,
                    request.getHost(),
                    request.getPort(),
                    request.getCommand(),
                    true,
                    null,
                    "skill.ssh"
            );
            return ResponseEntity.ok(output);
        } catch (IOException e) {
            gatewayOutboundAuditService.recordSsh(
                    userId,
                    request.getHost(),
                    request.getPort(),
                    request.getCommand(),
                    false,
                    e.getMessage(),
                    "skill.ssh"
            );
            return ResponseEntity.internalServerError().body("SSH execution failed: " + e.getMessage());
        }
    }

    private Object executeCompute(String operation, List<Object> operands) {
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
                long ts = toLong(operands.get(0));
                if (ts > 0 && ts < 10_000_000_000_000L) {
                    ts = ts * 1000;
                }
                LocalDate date = Instant.ofEpochMilli(ts).atZone(ZoneId.systemDefault()).toLocalDate();
                yield date.format(DateTimeFormatter.ISO_LOCAL_DATE);
            }
            case "date_diff_days" -> {
                requireOperands(operands, 2);
                LocalDate start = toLocalDate(operands.get(0));
                LocalDate end = toLocalDate(operands.get(1));
                yield ChronoUnit.DAYS.between(start, end);
            }
            default -> throw new IllegalArgumentException("unknown operation: " + operation);
        };
    }

    private static void requireOperands(List<?> operands, int expected) {
        if (operands.size() != expected) {
            throw new IllegalArgumentException("expected " + expected + " operand(s), got " + operands.size());
        }
    }

    private static double toDouble(Object n) {
        if (n instanceof Number number) {
            return number.doubleValue();
        }
        if (n instanceof String value && !value.isBlank()) {
            try {
                return Double.parseDouble(value);
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("invalid numeric operand: " + value);
            }
        }
        throw new IllegalArgumentException("numeric operand is required");
    }

    private static int toInt(Object n) {
        return (int) toLong(n);
    }

    private static long toLong(Object n) {
        if (n instanceof Number number) {
            return number.longValue();
        }
        if (n instanceof String value && !value.isBlank()) {
            try {
                return Long.parseLong(value);
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("invalid numeric operand: " + value);
            }
        }
        throw new IllegalArgumentException("numeric operand is required");
    }

    private static LocalDate toLocalDate(Object value) {
        if (!(value instanceof String text) || text.isBlank()) {
            throw new IllegalArgumentException("date_diff_days requires YYYY-MM-DD date strings");
        }
        try {
            return LocalDate.parse(text.trim(), DateTimeFormatter.ISO_LOCAL_DATE);
        } catch (Exception e) {
            throw new IllegalArgumentException("invalid date operand: " + text);
        }
    }

    private static BigInteger factorial(int n) {
        if (n <= 1) return BigInteger.ONE;
        BigInteger r = BigInteger.ONE;
        for (int i = 2; i <= n; i++) {
            r = r.multiply(BigInteger.valueOf(i));
        }
        return r;
    }
}
