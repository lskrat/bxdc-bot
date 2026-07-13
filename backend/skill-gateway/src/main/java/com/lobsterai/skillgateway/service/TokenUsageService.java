package com.lobsterai.skillgateway.service;

import com.lobsterai.skillgateway.dto.TokenUsageCallDetailDTO;
import com.lobsterai.skillgateway.dto.TokenUsageConversationPageDTO;
import com.lobsterai.skillgateway.dto.TokenUsageConversationSummaryDTO;
import com.lobsterai.skillgateway.dto.TokenUsageDailyPointDTO;
import com.lobsterai.skillgateway.dto.TokenUsageDailyResponseDTO;
import com.lobsterai.skillgateway.dto.TokenUsageOverviewDTO;
import com.lobsterai.skillgateway.dto.TokenUsageSessionDetailDTO;
import com.lobsterai.skillgateway.mapper.ConversationLogMapper;
import com.lobsterai.skillgateway.mapper.ToolCallLogMapper;
import com.lobsterai.skillgateway.mapper.ToolCallLogMapper.ToolCallSkillNameRow;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

// open spec: add-conversation-token-usage-tab
// Service 很简单：mapper 已经把所有 char 数算好了，service 只需拼装 + 缺日补 0。
@Service
public class TokenUsageService {

    @Autowired
    private ConversationLogMapper conversationLogMapper;

    @Autowired
    private ToolCallLogMapper toolCallLogMapper;

    public TokenUsageConversationPageDTO getConversationPage(String userId,
                                                              String startDate,
                                                              String endDate,
                                                              String keyword,
                                                              int page,
                                                              int size) {
        int offset = (page - 1) * size;
        List<TokenUsageConversationSummaryDTO> rows = conversationLogMapper.findSummariesByUserId(
                userId, startDate, endDate, keyword, offset, size);
        Long total = conversationLogMapper.countSummariesByUserId(userId, startDate, endDate, keyword);
        TokenUsageOverviewDTO overview = conversationLogMapper.getOverviewByUserId(userId, startDate, endDate);

        TokenUsageConversationPageDTO result = new TokenUsageConversationPageDTO();
        result.setConversations(rows != null ? rows : new ArrayList<>());
        result.setTotal(total != null ? total : 0L);
        result.setPage(page);
        result.setSize(size);
        result.setOverview(overview != null ? overview : new TokenUsageOverviewDTO());
        return result;
    }

    public TokenUsageSessionDetailDTO getSessionDetail(String userId, String sessionId) {
        List<TokenUsageCallDetailDTO> calls = conversationLogMapper.findCallDetailsBySessionIdDesc(userId, sessionId);
        if (calls == null) calls = new ArrayList<>();

        List<String> traceIds = calls.stream()
                .map(TokenUsageCallDetailDTO::getTraceId)
                .filter(t -> t != null && !t.isEmpty())
                .distinct()
                .collect(Collectors.toList());

        Map<String, List<String>> skillNamesByTrace = new HashMap<>();
        if (!traceIds.isEmpty()) {
            List<ToolCallSkillNameRow> rows = toolCallLogMapper.findDistinctSkillNamesBySessionAndTraceIds(sessionId, traceIds);
            if (rows != null) {
                for (ToolCallSkillNameRow r : rows) {
                    skillNamesByTrace.computeIfAbsent(r.getTraceId(), k -> new ArrayList<>()).add(r.getSkillName());
                }
            }
        }

        long totalPrompt = 0, totalCompletion = 0, totalTokens = 0, totalMessages = 0, failedCalls = 0;
        long totalPromptEst = 0, totalCompletionEst = 0, totalEst = 0;
        Set<String> uniqueSkillNames = new LinkedHashSet<>();
        for (TokenUsageCallDetailDTO c : calls) {
            List<String> skills = c.getTraceId() != null
                    ? skillNamesByTrace.getOrDefault(c.getTraceId(), new ArrayList<>())
                    : new ArrayList<>();
            c.setSkillNames(skills);
            uniqueSkillNames.addAll(skills);

            if (Boolean.FALSE.equals(c.getIsSuccess())) {
                failedCalls++;
            } else {
                if (c.getPromptTokens() != null) totalPrompt += c.getPromptTokens();
                if (c.getCompletionTokens() != null) totalCompletion += c.getCompletionTokens();
                if (c.getTotalTokens() != null) totalTokens += c.getTotalTokens();
                if (c.getMessageCount() != null) totalMessages += c.getMessageCount();
                if (c.getPromptEstimatedTokens() != null) totalPromptEst += c.getPromptEstimatedTokens();
                if (c.getCompletionEstimatedTokens() != null) totalCompletionEst += c.getCompletionEstimatedTokens();
                if (c.getEstimatedTokens() != null) totalEst += c.getEstimatedTokens();
            }
        }

        TokenUsageOverviewDTO totals = new TokenUsageOverviewDTO();
        totals.setTotalPromptTokens(totalPrompt);
        totals.setTotalCompletionTokens(totalCompletion);
        totals.setTotalTokens(totalTokens);
        totals.setTotalPromptEstimatedTokens(totalPromptEst);
        totals.setTotalCompletionEstimatedTokens(totalCompletionEst);
        totals.setTotalEstimatedTokens(totalEst);
        totals.setTotalMessageCount(totalMessages);
        totals.setTotalCalls((long) calls.size());
        totals.setTotalSessions(1L);
        totals.setFailedCalls(failedCalls);

        String conversationName = conversationLogMapper.findConversationNameById(sessionId);

        TokenUsageSessionDetailDTO result = new TokenUsageSessionDetailDTO();
        result.setSessionId(sessionId);
        result.setConversationName(conversationName != null ? conversationName : "");
        result.setCalls(calls);
        result.setTotals(totals);
        result.setUniqueSkillNames(new ArrayList<>(uniqueSkillNames));
        return result;
    }

    public TokenUsageDailyResponseDTO getDaily(String userId, String startDate, String endDate) {
        List<TokenUsageDailyPointDTO> raw = conversationLogMapper.findDailyByUserId(userId, startDate, endDate);
        if (raw == null) raw = new ArrayList<>();

        Map<LocalDate, TokenUsageDailyPointDTO> map = new LinkedHashMap<>();
        for (TokenUsageDailyPointDTO p : raw) {
            if (p.getDate() != null) map.put(p.getDate(), p);
        }

        // 缺日补 0
        List<TokenUsageDailyPointDTO> filled = new ArrayList<>();
        if (startDate != null && !startDate.isEmpty() && endDate != null && !endDate.isEmpty()) {
            try {
                LocalDate start = LocalDate.parse(startDate);
                LocalDate end = LocalDate.parse(endDate);
                long days = ChronoUnit.DAYS.between(start, end) + 1;
                if (days > 366) days = 366;
                for (long i = 0; i < days; i++) {
                    LocalDate d = start.plusDays(i);
                    TokenUsageDailyPointDTO p = map.get(d);
                    if (p != null) {
                        filled.add(p);
                    } else {
                        filled.add(new TokenUsageDailyPointDTO(d, 0L, 0L, 0L, 0, 0));
                    }
                }
            } catch (Exception ignored) {
                filled.addAll(raw);
            }
        } else {
            filled.addAll(raw);
        }

        return new TokenUsageDailyResponseDTO(filled);
    }
}