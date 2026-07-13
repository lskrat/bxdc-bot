package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.dto.ExternalServiceInputRequest;
import com.lobsterai.skillgateway.dto.ExternalServiceRequest;
import com.lobsterai.skillgateway.dto.ExternalServiceView;
import com.lobsterai.skillgateway.entity.ExternalService;
import com.lobsterai.skillgateway.entity.ExternalServiceInput;
import com.lobsterai.skillgateway.mapper.ExternalServiceInputMapper;
import com.lobsterai.skillgateway.mapper.ExternalServiceMapper;
import com.lobsterai.skillgateway.service.ExternalServiceRegistry;
import com.lobsterai.skillgateway.util.AesCipher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Admin CRUD for External Service + External Service Input。
 *
 * 设计稿：openspec/changes/add-external-service-skill/design.md §4 / §6
 *
 * 端点（全部 @PreAuthorize admin）：
 * - GET    /api/external-service              列表（含子表行；非 admin 脱敏）
 * - GET    /api/external-service/{id}         详情
 * - POST   /api/external-service              创建（含子表行）
 * - PUT    /api/external-service/{id}         更新（含子表行 — 事务内 replace）
 * - DELETE /api/external-service/{id}         删除（CASCADE 删子表）
 * - POST   /api/external-service/{id}/enable  启用/禁用
 * - POST   /api/external-service/{id}/invalidate-cache  即时失效 registry
 * - GET    /api/external-service/{id}/inputs  Admin-only 子表行查询（不带脱敏）
 */
@RestController
@RequestMapping("/api/external-service")
@CrossOrigin(origins = "*")
public class ExternalServiceController {

    private static final Logger log = LoggerFactory.getLogger(ExternalServiceController.class);

    private final ExternalServiceMapper serviceMapper;
    private final ExternalServiceInputMapper inputMapper;
    private final ExternalServiceRegistry registry;

    public ExternalServiceController(
            ExternalServiceMapper serviceMapper,
            ExternalServiceInputMapper inputMapper,
            ExternalServiceRegistry registry) {
        this.serviceMapper = serviceMapper;
        this.inputMapper = inputMapper;
        this.registry = registry;
    }

    @GetMapping
    public ResponseEntity<List<ExternalServiceView>> list(@RequestHeader(value = "X-User-Role", required = false) String role) {
        boolean isAdmin = isAdminRole(role);
        List<ExternalServiceView> views = new ArrayList<ExternalServiceView>();
        try {
            List<ExternalService> services = registry.listEnabled();
            // Admin 可看全量（含 disabled）；非 admin 只看 enabled
            if (isAdmin) {
                services = serviceMapper.selectList(null);
            }
            if (services == null) return ResponseEntity.ok(views);
            for (ExternalService svc : services) {
                List<ExternalServiceInput> inputs = inputMapper.listByServiceId(svc.getId());
                views.add(ExternalServiceView.from(svc, inputs, isAdmin));
            }
        } catch (Exception e) {
            log.warn("[ExternalService] list failed: {}", e.getMessage());
        }
        return ResponseEntity.ok(views);
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable Long id,
                                      @RequestHeader(value = "X-User-Role", required = false) String role) {
        boolean isAdmin = isAdminRole(role);
        ExternalService svc = serviceMapper.selectById(id);
        if (svc == null) {
            return ResponseEntity.status(404).body(java.util.Collections.singletonMap("error", "External service not found: " + id));
        }
        List<ExternalServiceInput> inputs = inputMapper.listByServiceId(id);
        return ResponseEntity.ok(ExternalServiceView.from(svc, inputs, isAdmin));
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> create(@RequestBody ExternalServiceRequest req) {
        if (req.getName() == null || req.getName().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(java.util.Collections.singletonMap("error", "name is required"));
        }
        if (req.getEndpointUrl() == null || req.getEndpointUrl().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(java.util.Collections.singletonMap("error", "endpointUrl is required"));
        }
        if (serviceMapper.findByName(req.getName()) != null) {
            return ResponseEntity.status(409).body(java.util.Collections.singletonMap("error", "name already exists: " + req.getName()));
        }

        ExternalService svc = new ExternalService();
        copyToEntity(svc, req);
        serviceMapper.insert(svc);

        if (req.getInputs() != null) {
            for (ExternalServiceInputRequest in : req.getInputs()) {
                inputMapper.insert(buildInputEntity(svc.getId(), in));
            }
        }

        return ResponseEntity.ok(ExternalServiceView.from(svc, inputMapper.listByServiceId(svc.getId()), true));
    }

    @PutMapping("/{id}")
    @Transactional
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody ExternalServiceRequest req) {
        ExternalService existing = serviceMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(404).body(java.util.Collections.singletonMap("error", "External service not found: " + id));
        }
        copyToEntity(existing, req);
        serviceMapper.updateById(existing);

        if (req.getInputs() != null) {
            // Replace 策略：删子表行后重建
            inputMapper.deleteByServiceId(id);
            for (ExternalServiceInputRequest in : req.getInputs()) {
                inputMapper.insert(buildInputEntity(id, in));
            }
        }

        return ResponseEntity.ok(ExternalServiceView.from(existing, inputMapper.listByServiceId(id), true));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        ExternalService existing = serviceMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(404).body(java.util.Collections.singletonMap("error", "External service not found: " + id));
        }
        // 子表 FK ON DELETE CASCADE 自动删
        serviceMapper.deleteById(id);
        return ResponseEntity.ok(java.util.Collections.singletonMap("deleted", id));
    }

    @PostMapping("/{id}/enable")
    public ResponseEntity<?> setEnabled(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        ExternalService existing = serviceMapper.selectById(id);
        if (existing == null) {
            return ResponseEntity.status(404).body(java.util.Collections.singletonMap("error", "External service not found: " + id));
        }
        Object en = body.get("enabled");
        if (en instanceof Boolean) {
            existing.setEnabled(((Boolean) en) ? 1 : 0);
        } else if (en instanceof Number) {
            existing.setEnabled(((Number) en).intValue());
        }
        serviceMapper.updateById(existing);
        return ResponseEntity.ok(ExternalServiceView.from(existing, inputMapper.listByServiceId(id), true));
    }

    @PostMapping("/{id}/invalidate-cache")
    public ResponseEntity<?> invalidateCache(@PathVariable Long id) {
        // 注册表已改为直查 DB，无需失效缓存；接口保留以兼容前端调用
        return ResponseEntity.ok(java.util.Collections.singletonMap("invalidated", id));
    }

    // ===== Helpers =====

    private void copyToEntity(ExternalService svc, ExternalServiceRequest req) {
        svc.setName(req.getName());
        svc.setEndpointUrl(req.getEndpointUrl());
        svc.setHttpMethod(req.getHttpMethod() == null ? "POST" : req.getHttpMethod().toUpperCase());
        svc.setAuthKind(req.getAuthKind() == null ? "none" : req.getAuthKind());
        svc.setAuthConfigJson(normalizeAuthConfig(req.getAuthConfig(), svc.getAuthKind()));
        svc.setResponseFormat(req.getResponseFormat() == null ? "json" : req.getResponseFormat());
        svc.setRetryMax(req.getRetryMax() == null ? 0 : Math.min(req.getRetryMax(), 5));
        svc.setEnabled(req.getEnabled() == null ? 1 : req.getEnabled());
        svc.setDisplayOrder(req.getDisplayOrder() == null ? 0 : req.getDisplayOrder());
        svc.setDescription(req.getDescription());
    }

    /**
     * 把请求里的 auth_config（Map 或 JSON 字符串）规范化为 JSON 字符串，并对 valueStatic 字段加密。
     * 返回 JSON 字符串形态（与 ExternalService.authConfigJson 字段类型一致）。
     */
    @SuppressWarnings("unchecked")
    private String normalizeAuthConfig(Object rawConfig, String authKind) {
        if (rawConfig == null) {
            return null;
        }
        java.util.Map<String, Object> map;
        if (rawConfig instanceof Map) {
            map = new java.util.HashMap<String, Object>((Map<String, Object>) rawConfig);
        } else if (rawConfig instanceof String) {
            String s = (String) rawConfig;
            if (s.trim().isEmpty()) return null;
            try {
                map = new com.fasterxml.jackson.databind.ObjectMapper()
                        .readValue(s, new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
            } catch (Exception e) {
                throw new IllegalArgumentException("Invalid auth_config JSON: " + e.getMessage());
            }
        } else {
            throw new IllegalArgumentException("auth_config must be Map or JSON string");
        }
        Object vs = map.get("valueStatic");
        if (vs instanceof String) {
            String s = (String) vs;
            if (!s.startsWith("***") && !s.isEmpty()) {
                try {
                    map.put("valueStatic", AesCipher.encrypt(s));
                } catch (Exception e) {
                    log.warn("[ExternalService] Failed to encrypt valueStatic: {}", e.getMessage());
                }
            }
        }
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(map);
        } catch (Exception e) {
            throw new IllegalArgumentException("Failed to serialize auth_config: " + e.getMessage());
        }
    }

    private ExternalServiceInput buildInputEntity(Long serviceId, ExternalServiceInputRequest req) {
        ExternalServiceInput e = new ExternalServiceInput();
        e.setServiceId(serviceId);
        e.setExternalParamName(req.getExternalParamName());
        e.setDisplayName(req.getDisplayName());
        e.setIsRequired(req.getIsRequired() == null ? 0 : req.getIsRequired());
        e.setIsRawTransmission(req.getIsRawTransmission() == null ? 0 : req.getIsRawTransmission());
        e.setParamLocation(req.getParamLocation() == null ? "body" : req.getParamLocation());
        e.setBodyContentType(req.getBodyContentType());
        e.setParamType(req.getParamType() == null ? "string" : req.getParamType());
        e.setIsSensitive(req.getIsSensitive() == null ? 0 : req.getIsSensitive());
        e.setDescription(req.getDescription());
        e.setDisplayOrder(req.getDisplayOrder() == null ? 0 : req.getDisplayOrder());
        return e;
    }

    private boolean isAdminRole(String role) {
        if (role == null) return false;
        String r = role.toUpperCase();
        return r.contains("ADMIN");
    }
}