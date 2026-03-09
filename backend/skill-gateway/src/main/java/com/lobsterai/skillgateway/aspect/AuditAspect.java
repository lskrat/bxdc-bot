package com.lobsterai.skillgateway.aspect;

import com.lobsterai.skillgateway.controller.SkillController;
import com.lobsterai.skillgateway.entity.AuditLog;
import com.lobsterai.skillgateway.repository.AuditLogRepository;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.AfterThrowing;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 审计切面。
 * <p>
 * 使用 AOP 拦截 Skill Controller 的方法调用，记录操作日志。
 * 无论操作成功与否，都会记录相关信息。
 * </p>
 */
@Aspect
@Component
public class AuditAspect {

    private final AuditLogRepository auditLogRepository;

    public AuditAspect(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    /**
     * 记录 SSH 命令执行成功的日志。
     *
     * @param joinPoint 切入点
     * @param request   请求参数
     * @param result    执行结果
     */
    @AfterReturning(pointcut = "execution(* com.lobsterai.skillgateway.controller.SkillController.executeSshCommand(..)) && args(request)", returning = "result")
    public void logSshSuccess(JoinPoint joinPoint, SkillController.SshRequest request, Object result) {
        saveLog("SSH", request.getCommand(), "SUCCESS", request.getHost());
    }

    /**
     * 记录 SSH 命令执行失败的日志。
     *
     * @param joinPoint 切入点
     * @param request   请求参数
     * @param ex        异常信息
     */
    @AfterThrowing(pointcut = "execution(* com.lobsterai.skillgateway.controller.SkillController.executeSshCommand(..)) && args(request)", throwing = "ex")
    public void logSshFailure(JoinPoint joinPoint, SkillController.SshRequest request, Exception ex) {
        saveLog("SSH", request.getCommand(), "FAILURE: " + ex.getMessage(), request.getHost());
    }

    /**
     * 记录 API 调用成功的日志。
     *
     * @param joinPoint 切入点
     * @param request   请求参数
     * @param result    执行结果
     */
    @AfterReturning(pointcut = "execution(* com.lobsterai.skillgateway.controller.SkillController.callApi(..)) && args(request)", returning = "result")
    public void logApiSuccess(JoinPoint joinPoint, SkillController.ApiRequest request, Object result) {
        saveLog("API", request.getUrl(), "SUCCESS", request.getMethod());
    }

    private void saveLog(String skillName, String commandOrUrl, String status, String params) {
        AuditLog log = new AuditLog();
        log.setAgentId("unknown"); // In real app, extract from token/context
        log.setSkillName(skillName);
        log.setCommandOrUrl(commandOrUrl);
        log.setParams(params);
        log.setStatus(status);
        log.setTimestamp(LocalDateTime.now());
        auditLogRepository.save(log);
    }
}
