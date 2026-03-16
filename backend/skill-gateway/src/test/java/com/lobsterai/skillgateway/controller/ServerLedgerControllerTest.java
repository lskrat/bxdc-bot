package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.entity.ServerLedger;
import com.lobsterai.skillgateway.service.ServerLedgerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ServerLedgerControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ServerLedgerService serverLedgerService;

    @Test
    void getAllServerLedgers_success() throws Exception {
        ServerLedger ledger = new ServerLedger();
        ledger.setId(1L);
        ledger.setIp("192.168.1.1");
        ledger.setUsername("root");
        ledger.setPassword("secret");

        when(serverLedgerService.getServerLedgers("123456")).thenReturn(List.of(ledger));

        mockMvc.perform(get("/api/server-ledgers")
                        .header("X-User-Id", "123456"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].ip").value("192.168.1.1"))
                .andExpect(jsonPath("$[0].password").doesNotExist()); // Password should be masked/removed
    }

    @Test
    void createServerLedger_success() throws Exception {
        ServerLedger ledger = new ServerLedger();
        ledger.setId(1L);
        ledger.setIp("192.168.1.1");

        when(serverLedgerService.createServerLedger(eq("123456"), any(ServerLedger.class))).thenReturn(ledger);

        mockMvc.perform(post("/api/server-ledgers")
                        .header("X-User-Id", "123456")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ip\":\"192.168.1.1\",\"username\":\"root\",\"password\":\"pass\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1));
    }

    @Test
    void missingUserIdHeader_returns400() throws Exception {
        mockMvc.perform(get("/api/server-ledgers"))
                .andExpect(status().isBadRequest());
    }
}
