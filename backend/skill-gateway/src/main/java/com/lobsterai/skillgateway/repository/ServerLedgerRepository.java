package com.lobsterai.skillgateway.repository;

import com.lobsterai.skillgateway.entity.ServerLedger;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ServerLedgerRepository extends JpaRepository<ServerLedger, Long> {
    List<ServerLedger> findByUserId(String userId);

    Optional<ServerLedger> findByUserIdAndName(String userId, String name);

    Optional<ServerLedger> findByUserIdAndId(String userId, Long id);

    Optional<ServerLedger> findByUserIdAndHost(String userId, String host);

    Optional<ServerLedger> findByUserIdAndHostAndIdNot(String userId, String host, Long id);
}
