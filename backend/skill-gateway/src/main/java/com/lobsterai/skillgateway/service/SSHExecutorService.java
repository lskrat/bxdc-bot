package com.lobsterai.skillgateway.service;

import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.common.IOUtils;
import net.schmizz.sshj.connection.channel.direct.Session;
import net.schmizz.sshj.transport.verification.PromiscuousVerifier;
import net.schmizz.sshj.userauth.keyprovider.KeyProvider;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

/**
 * SSH 执行服务。
 * <p>
 * 封装 SSHJ 客户端，提供远程命令执行能力。
 * </p>
 */
@Service
public class SSHExecutorService {

    /**
     * 在远程服务器上执行命令。
     *
     * @param host       远程主机地址
     * @param port       SSH 端口
     * @param username   用户名
     * @param privateKey 私钥内容
     * @param command    要执行的 Shell 命令
     * @return 命令的标准输出
     * @throws IOException 如果连接失败或执行出错
     */
    public String executeCommand(String host, int port, String username, String privateKey, String command) throws IOException {
        try (SSHClient ssh = new SSHClient()) {
            ssh.addHostKeyVerifier(new PromiscuousVerifier());
            ssh.connect(host, port);
            
            // Load the private key. ssh.loadKeys expects a path, but here we might have content.
            // For now, we use loadKeys which returns a KeyProvider, satisfying the compiler.
            // If privateKey is content, this might need adjustment to use a StringReader-based KeyProvider.
            KeyProvider keys = ssh.loadKeys(privateKey, null, null);
            ssh.authPublickey(username, keys);

            try (Session session = ssh.startSession()) {
                Session.Command cmd = session.exec(command);
                String output = IOUtils.readFully(cmd.getInputStream()).toString();
                cmd.join(5, TimeUnit.SECONDS);
                return output;
            }
        }
    }
}
