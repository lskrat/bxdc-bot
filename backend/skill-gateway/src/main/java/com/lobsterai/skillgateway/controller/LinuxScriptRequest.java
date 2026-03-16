package com.lobsterai.skillgateway.controller;

/**
 * Linux 脚本执行请求。
 */
public class LinuxScriptRequest {
    private String serverId;
    private String command;

    public String getServerId() {
        return serverId;
    }

    public void setServerId(String serverId) {
        this.serverId = serverId;
    }

    public String getCommand() {
        return command;
    }

    public void setCommand(String command) {
        this.command = command;
    }
}
