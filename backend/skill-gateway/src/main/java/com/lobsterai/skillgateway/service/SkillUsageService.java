package com.lobsterai.skillgateway.service;

import com.lobsterai.skillgateway.dto.SkillUsageDetailPageDTO;
import com.lobsterai.skillgateway.dto.SkillUsageOverviewDTO;
import com.lobsterai.skillgateway.entity.ToolCallLog;
import com.lobsterai.skillgateway.mapper.SkillUsageMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

@Service
public class SkillUsageService {

    @Autowired
    private SkillUsageMapper skillUsageMapper;

    public List<SkillUsageOverviewDTO> getOverview(String startDate, String endDate, String keyword) {
        return skillUsageMapper.getOverview(startDate, endDate, keyword);
    }

    public SkillUsageDetailPageDTO getDetails(String skillName, int page, int size, String startDate, String endDate) {
        List<ToolCallLog> all = skillUsageMapper.getDetails(skillName, startDate, endDate);
        long total = all.size();
        if (total == 0) {
            return new SkillUsageDetailPageDTO(0, page, size, Collections.emptyList());
        }
        int fromIndex = (page - 1) * size;
        if (fromIndex >= total) {
            return new SkillUsageDetailPageDTO(total, page, size, Collections.emptyList());
        }
        int toIndex = (int) Math.min(fromIndex + size, total);
        List<ToolCallLog> pageRecords = all.subList(fromIndex, toIndex);
        return new SkillUsageDetailPageDTO(total, page, size, pageRecords);
    }
}
