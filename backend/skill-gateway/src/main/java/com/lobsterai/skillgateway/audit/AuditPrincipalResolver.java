package com.lobsterai.skillgateway.audit;

import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class AuditPrincipalResolver {

    private AuditPrincipalResolver() {
    }

    public static String currentAuditUserId() {
        String u = MDC.get(SkillIngressCaptureFilter.MDC_USER_ID);
        if (u != null && !u.isBlank()) {
            return u.trim();
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !auth.getName().isBlank()) {
            return auth.getName();
        }
        return null;
    }

    public static String currentCorrelationId() {
        String c = MDC.get(SkillIngressCaptureFilter.MDC_CORRELATION_ID);
        if (c != null && !c.isBlank()) {
            return c.trim();
        }
        return null;
    }

    /**
     * Extension skill id from {@code X-Skill-Id} (see {@link SkillIngressCaptureFilter#MDC_SKILL_ID}).
     */
    public static Long currentSkillId() {
        String s = MDC.get(SkillIngressCaptureFilter.MDC_SKILL_ID);
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
