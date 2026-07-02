package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.entity.ExternalService;
import com.lobsterai.skillgateway.entity.ExternalServiceInput;
import com.lobsterai.skillgateway.service.ExternalServiceRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 公开读接口：任意已认证用户可查 GET /api/external-service/{name}/inputs。
 *
 * 设计稿：openspec/changes/add-external-service-skill/design.md §4.7 + §12.5
 *
 * - 服务不存在 → 404
 * - 服务存在但子表空 → 返回 []
 * - 子表行排除 is_sensitive（避免敏感字段名泄漏给前端 — 实际值不在此接口返回）
 */
@RestController
@RequestMapping("/api/external-service")
@CrossOrigin(origins = "*")
public class ExternalServiceQueryController {

    private static final Logger log = LoggerFactory.getLogger(ExternalServiceQueryController.class);

    private final ExternalServiceRegistry registry;

    public ExternalServiceQueryController(ExternalServiceRegistry registry) {
        this.registry = registry;
    }

    @GetMapping("/{name}/inputs")
    public ResponseEntity<?> listInputsByName(@PathVariable String name) {
        if (registry == null) {
            return ResponseEntity.ok(Collections.emptyList());
        }
        try {
            ExternalService svc = registry.getByNameOrThrow(name);
            List<ExternalServiceInput> raw = registry.listInputs(svc.getId());
            List<ExternalServiceInput> safe = new ArrayList<ExternalServiceInput>();
            for (ExternalServiceInput inp : raw) {
                if (inp.getIsSensitive() != null && inp.getIsSensitive() == 1) {
                    continue; // 排除敏感字段名
                }
                safe.add(inp);
            }
            return ResponseEntity.ok(safe);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(404).body(Collections.singletonMap("error", e.getMessage()));
        } catch (Exception e) {
            log.warn("[ExternalServiceQuery] listInputs({}) failed: {}", name, e.getMessage());
            return ResponseEntity.ok(Collections.emptyList());
        }
    }
}