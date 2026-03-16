package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.entity.ServerLedger;
import com.lobsterai.skillgateway.service.SSHExecutorService;
import com.lobsterai.skillgateway.service.ServerLedgerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class SkillControllerSshLedgerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ServerLedgerService serverLedgerService;

    @MockBean
    private SSHExecutorService sshExecutorService;

    @Test
    void executeSshWithLedger_success() throws Exception {
        ServerLedger ledger = new ServerLedger();
        ledger.setIp("192.168.1.1");
        ledger.setUsername("root");
        ledger.setPassword("secret");

        when(serverLedgerService.getServerLedgerByIp("123456", "192.168.1.1")).thenReturn(Optional.of(ledger));
        when(sshExecutorService.executeCommandWithPassword(eq("192.168.1.1"), eq(22), eq("root"), eq("secret"), eq("ls")))
                .thenReturn("file1.txt");

        mockMvc.perform(post("/api/skills/ssh")
                        .header("X-User-Id", "123456")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"host\":\"192.168.1.1\",\"command\":\"ls\"}"))
                .andExpect(status().isOk())
                .andExpect(content().string("file1.txt"));
    }

    @Test
    void executeSshWithLedger_notFound_returns400() throws Exception {
        when(serverLedgerService.getServerLedgerByIp("123456", "192.168.1.1")).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/skills/ssh")
                        .header("X-User-Id", "123456")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"host\":\"192.168.1.1\",\"command\":\"ls\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void executeSshLegacy_success() throws Exception {
        when(sshExecutorService.executeCommand(eq("192.168.1.1"), eq(22), eq("user"), eq("key"), eq("ls")))
                .thenReturn("legacy");

        mockMvc.perform(post("/api/skills/ssh")
                        // No X-User-Id
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"host\":\"192.168.1.1\",\"username\":\"user\",\"privateKey\":\"key\",\"command\":\"ls\"}"))
                .andExpect(status().isOk())
                .andExpect(content().string("legacy"));
    }
}
