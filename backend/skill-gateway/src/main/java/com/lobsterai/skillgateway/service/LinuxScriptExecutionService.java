package com.lobsterai.skillgateway.service;

import org.springframework.stereotype.Service;

import java.io.IOException;

/**
 * Linux 脚本执行服务。
 */
@Service
public class LinuxScriptExecutionService {

    private final LinuxScriptServerRegistryService serverRegistryService;
    private final SSHExecutorService sshExecutorService;
    private final SecurityFilterService securityFilterService;

    public LinuxScriptExecutionService(
            LinuxScriptServerRegistryService serverRegistryService,
            SSHExecutorService sshExecutorService,
            SecurityFilterService securityFilterService
    ) {
        this.serverRegistryService = serverRegistryService;
        this.sshExecutorService = sshExecutorService;
        this.securityFilterService = securityFilterService;
    }

    public String execute(String serverId, String command) throws IOException {
        if (serverId == null || serverId.isBlank()) {
            throw new IllegalArgumentException("serverId is required");
        }
        if (command == null || command.isBlank()) {
            throw new IllegalArgumentException("command is required");
        }
        if (!securityFilterService.isCommandSafe(command)) {
            throw new IllegalArgumentException("Command blocked by security policy");
        }

        LinuxScriptServerRegistryService.LinuxServerConfig server =
                serverRegistryService.resolveServer(serverId);

        return sshExecutorService.executeCommand(
                server.host(),
                server.port(),
                server.username(),
                server.privateKeyPath(),
                command.trim()
        );
    }
}
