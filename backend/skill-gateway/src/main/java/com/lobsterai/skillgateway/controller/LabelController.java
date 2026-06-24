package com.lobsterai.skillgateway.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.lobsterai.skillgateway.entity.SysLabel;
import com.lobsterai.skillgateway.service.LabelService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;

@RestController
@RequestMapping("/api/labels")
public class LabelController {

    private final LabelService labelService;

    public LabelController(LabelService labelService) {
        this.labelService = labelService;
    }

    @PostMapping
    public ResponseEntity<?> createLabel(
            @RequestBody SysLabel label,
            @RequestHeader(value = "x-user-id", required = false) String userId) {
        if (label.getName() == null || label.getName().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "标签名称不能为空"));
        }
        if (label.getType() == null || label.getType().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "标签类型不能为空"));
        }
        return ResponseEntity.ok(labelService.createLabel(label, userId));
    }

    @GetMapping
    public ResponseEntity<IPage<SysLabel>> listLabels(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(labelService.listLabels(page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getLabelById(@PathVariable Long id) {
        SysLabel label = labelService.getLabelById(id);
        if (label == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(label);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateLabel(
            @PathVariable Long id, 
            @RequestBody SysLabel labelDetails,
            @RequestHeader(value = "x-user-id", required = false) String userId) {
        if (labelDetails.getName() == null || labelDetails.getName().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "标签名称不能为空"));
        }
        if (labelDetails.getType() == null || labelDetails.getType().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", "标签类型不能为空"));
        }
        SysLabel updated = labelService.updateLabel(id, labelDetails, userId);
        if (updated == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteLabel(@PathVariable Long id) {
        boolean deleted = labelService.deleteLabel(id);
        if (!deleted) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(Collections.singletonMap("success", true));
    }
}