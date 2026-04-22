package com.lobsterai.skillgateway.repository;

import com.lobsterai.skillgateway.entity.GatewayOutboundAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GatewayOutboundAuditLogRepository extends JpaRepository<GatewayOutboundAuditLog, Long> {
}
