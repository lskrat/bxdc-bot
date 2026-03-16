package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.service.SSHExecutorService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "skill.linux-script.servers.demo.host=127.0.0.1",
        "skill.linux-script.servers.demo.port=22",
        "skill.linux-script.servers.demo.username=tester",
        "skill.linux-script.servers.demo.private-key-path=/tmp/test-key"
})
@AutoConfigureMockMvc
class SkillControllerLinuxScriptTest {

    private static final String TOKEN = "your-secure-token-here";

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private SSHExecutorService sshExecutorService;

    @Test
    void executeLinuxScript_success() throws Exception {
        when(sshExecutorService.executeCommand(
                eq("127.0.0.1"),
                eq(22),
                eq("tester"),
                eq("/tmp/test-key"),
                eq("echo hello")
        )).thenReturn("hello");

        mockMvc.perform(post("/api/skills/linux-script")
                        .header("X-Agent-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"serverId\":\"demo\",\"command\":\"echo hello\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("hello"));
    }

    @Test
    void executeLinuxScript_unknownServer_returns404() throws Exception {
        mockMvc.perform(post("/api/skills/linux-script")
                        .header("X-Agent-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"serverId\":\"missing\",\"command\":\"echo hello\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Unknown serverId: missing"));
    }

    @Test
    void executeLinuxScript_blockedCommand_returns400() throws Exception {
        mockMvc.perform(post("/api/skills/linux-script")
                        .header("X-Agent-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"serverId\":\"demo\",\"command\":\"rm -rf /tmp/demo\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Command blocked by security policy"));
    }

    @Test
    void executeLinuxScript_connectionFailure_returns500() throws Exception {
        when(sshExecutorService.executeCommand(
                eq("127.0.0.1"),
                eq(22),
                eq("tester"),
                eq("/tmp/test-key"),
                eq("echo hello")
        )).thenThrow(new IOException("connection refused"));

        mockMvc.perform(post("/api/skills/linux-script")
                        .header("X-Agent-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"serverId\":\"demo\",\"command\":\"echo hello\"}"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("Linux script execution failed: connection refused"));
    }

    @Test
    void executeLinuxScript_withoutToken_returns401() throws Exception {
        mockMvc.perform(post("/api/skills/linux-script")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"serverId\":\"demo\",\"command\":\"echo hello\"}"))
                .andExpect(status().isUnauthorized());
    }
}
