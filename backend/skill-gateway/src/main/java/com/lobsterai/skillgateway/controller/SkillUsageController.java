package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.dto.SkillUsageDetailPageDTO;
import com.lobsterai.skillgateway.dto.SkillUsageOverviewDTO;
import com.lobsterai.skillgateway.service.SkillUsageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/skill-usage")
@CrossOrigin(origins = "*")
public class SkillUsageController {

    @Autowired
    private SkillUsageService skillUsageService;

    @GetMapping("/overview")
    public ResponseEntity<List<SkillUsageOverviewDTO>> getOverview(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String keyword) {
        List<SkillUsageOverviewDTO> result = skillUsageService.getOverview(startDate, endDate, keyword);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/details")
    public ResponseEntity<SkillUsageDetailPageDTO> getDetails(
            @RequestParam String skillName,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        SkillUsageDetailPageDTO result = skillUsageService.getDetails(skillName, page, size, startDate, endDate);
        return ResponseEntity.ok(result);
    }
}
