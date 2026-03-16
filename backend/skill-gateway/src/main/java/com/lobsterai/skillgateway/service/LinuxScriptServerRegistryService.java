package com.lobsterai.skillgateway.service;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.util.NoSuchElementException;

/**
 * 根据 serverId 解析 Linux 服务器连接配置。
 */
@Service
public class LinuxScriptServerRegistryService {

    private final Environment environment;

    public LinuxScriptServerRegistryService(Environment environment) {
        this.environment = environment;
    }

    public LinuxServerConfig resolveServer(String serverId) {
        if (serverId == null || serverId.isBlank()) {
            throw new IllegalArgumentException("serverId is required");
        }

        String normalizedServerId = serverId.trim();
        String prefix = "skill.linux-script.servers." + normalizedServerId + ".";
        String host = environment.getProperty(prefix + "host");
        String username = environment.getProperty(prefix + "username");
        String privateKeyPath = environment.getProperty(prefix + "private-key-path");
        Integer port = environment.getProperty(prefix + "port", Integer.class, 22);

        if (host == null || host.isBlank() || username == null || username.isBlank()
                || privateKeyPath == null || privateKeyPath.isBlank()) {
            throw new NoSuchElementException("Unknown serverId: " + normalizedServerId);
        }

        return new LinuxServerConfig(host.trim(), port, username.trim(), privateKeyPath.trim());
    }

    public record LinuxServerConfig(String host, int port, String username, String privateKeyPath) {
    }
}
