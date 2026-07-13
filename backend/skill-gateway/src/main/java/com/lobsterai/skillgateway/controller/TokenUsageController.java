package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.dto.TokenUsageConversationPageDTO;
import com.lobsterai.skillgateway.dto.TokenUsageDailyResponseDTO;
import com.lobsterai.skillgateway.dto.TokenUsageSessionDetailDTO;
import com.lobsterai.skillgateway.service.TokenUsageService;
import com.lobsterai.skillgateway.util.AamTokenUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;

// open spec: add-conversation-token-usage-tab
// REST API：per-user LLM token + skill 用量查询；强制 X-User-Id == ?userId= 否则 403
@RestController
@RequestMapping("/api/token-usage")
@CrossOrigin(origins = "*")
public class TokenUsageController {

    @Autowired
    private TokenUsageService tokenUsageService;

    @GetMapping("/conversations")
    public ResponseEntity<TokenUsageConversationPageDTO> getConversations(
            HttpServletRequest request,
            @RequestParam("userId") String userId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) String startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) String endDate,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        enforceSelfAccess(request, userId);
        return ResponseEntity.ok(tokenUsageService.getConversationPage(userId, startDate, endDate, keyword, page, size));
    }

    @GetMapping("/conversations/{sessionId}")
    public ResponseEntity<TokenUsageSessionDetailDTO> getSessionDetail(
            HttpServletRequest request,
            @PathVariable String sessionId,
            @RequestParam("userId") String userId) {
        enforceSelfAccess(request, userId);
        return ResponseEntity.ok(tokenUsageService.getSessionDetail(userId, sessionId));
    }

    @GetMapping("/daily")
    public ResponseEntity<TokenUsageDailyResponseDTO> getDaily(
            HttpServletRequest request,
            @RequestParam("userId") String userId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) String startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) String endDate) {
        enforceSelfAccess(request, userId);
        return ResponseEntity.ok(tokenUsageService.getDaily(userId, startDate, endDate));
    }

    /** 强制 X-User-Id == ?userId= 否则 403 */
    private void enforceSelfAccess(HttpServletRequest request, String targetUserId) {
        String headerUserId = AamTokenUtil.requireUserId(request);
        if (!AamTokenUtil.canAccessUser(headerUserId, targetUserId)) {
            throw new ForbiddenOtherUserException();
        }
    }

    /** 403 — 试图跨用户访问 */
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public static class ForbiddenOtherUserException extends RuntimeException {
        public ForbiddenOtherUserException() {
            super("FORBIDDEN_OTHER_USER");
        }
    }

    /** 缺 X-User-Id / 参数非法 → 400 而非 500 */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<HashMap<String, Object>> handleIllegalArgument(IllegalArgumentException e) {
        HashMap<String, Object> body = new HashMap<>();
        body.put("error", "BAD_REQUEST");
        body.put("message", e.getMessage() == null ? "" : e.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }
}