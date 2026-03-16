package com.lobsterai.skillgateway.service;

import com.lobsterai.skillgateway.entity.ServerLedger;
import com.lobsterai.skillgateway.repository.ServerLedgerRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class ServerLedgerService {

    private final ServerLedgerRepository serverLedgerRepository;

    public ServerLedgerService(ServerLedgerRepository serverLedgerRepository) {
        this.serverLedgerRepository = serverLedgerRepository;
    }

    public List<ServerLedger> getServerLedgers(String userId) {
        return serverLedgerRepository.findByUserId(userId);
    }

    public ServerLedger createServerLedger(String userId, ServerLedger ledger) {
        if (serverLedgerRepository.findByUserIdAndIp(userId, ledger.getIp()).isPresent()) {
            throw new IllegalArgumentException("Server with IP " + ledger.getIp() + " already exists for this user.");
        }
        ledger.setUserId(userId);
        return serverLedgerRepository.save(ledger);
    }

    public ServerLedger updateServerLedger(String userId, Long id, ServerLedger ledgerDetails) {
        ServerLedger ledger = serverLedgerRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new IllegalArgumentException("Server ledger not found or access denied"));

        ledger.setIp(ledgerDetails.getIp());
        ledger.setUsername(ledgerDetails.getUsername());
        
        // Only update password if provided and not empty
        if (ledgerDetails.getPassword() != null && !ledgerDetails.getPassword().isEmpty()) {
            ledger.setPassword(ledgerDetails.getPassword());
        }

        return serverLedgerRepository.save(ledger);
    }

    public void deleteServerLedger(String userId, Long id) {
        ServerLedger ledger = serverLedgerRepository.findByUserIdAndId(userId, id)
                .orElseThrow(() -> new IllegalArgumentException("Server ledger not found or access denied"));
        serverLedgerRepository.delete(ledger);
    }

    public Optional<ServerLedger> getServerLedgerByIp(String userId, String ip) {
        return serverLedgerRepository.findByUserIdAndIp(userId, ip);
    }
}
