package com.lobsterai.skillgateway.repository;

import com.lobsterai.skillgateway.entity.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * 审计日志仓库。
 * <p>
 * 提供对 AuditLog 实体的 CRUD 操作。
 * </p>
 */
@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
}
