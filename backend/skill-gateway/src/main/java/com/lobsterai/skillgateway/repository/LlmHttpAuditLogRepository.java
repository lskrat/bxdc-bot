package com.lobsterai.skillgateway.repository;

import com.lobsterai.skillgateway.entity.LlmHttpAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface LlmHttpAuditLogRepository extends JpaRepository<LlmHttpAuditLog, Long> {
}
