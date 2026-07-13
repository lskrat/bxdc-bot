package com.lobsterai.skillgateway.dto;

import java.util.List;

/**
 * open spec: add-conversation-token-usage-tab
 * 按天聚合响应：含连续日期的所有点（缺日补 0）。
 */
public class TokenUsageDailyResponseDTO {

    private List<TokenUsageDailyPointDTO> points;

    public TokenUsageDailyResponseDTO() {
    }

    public TokenUsageDailyResponseDTO(List<TokenUsageDailyPointDTO> points) {
        this.points = points;
    }

    public List<TokenUsageDailyPointDTO> getPoints() {
        return points;
    }

    public void setPoints(List<TokenUsageDailyPointDTO> points) {
        this.points = points;
    }
}