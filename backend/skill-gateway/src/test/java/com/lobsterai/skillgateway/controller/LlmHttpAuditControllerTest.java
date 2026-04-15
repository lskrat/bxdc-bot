package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.repository.LlmHttpAuditLogRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:llm_http_audit_test;DB_CLOSE_DELAY=-1;MODE=LEGACY",
        "spring.datasource.driverClassName=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=password",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=never",
        "spring.jpa.defer-datasource-initialization=false"
})
@AutoConfigureMockMvc
class LlmHttpAuditControllerTest {

    private static final String TOKEN = "your-secure-token-here";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LlmHttpAuditLogRepository repository;

    @AfterEach
    void cleanup() {
        repository.deleteAll();
    }

    @Test
    void post_withoutToken_returns401() throws Exception {
        mockMvc.perform(post("/api/internal/llm-http-audit/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"correlationId\":\"c1\",\"direction\":\"request\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void post_withToken_persistsRow() throws Exception {
        mockMvc.perform(post("/api/internal/llm-http-audit/events")
                        .header("X-Agent-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "ts": "2026-01-01T00:00:00.000Z",
                                  "direction": "request",
                                  "correlationId": "corr-test",
                                  "userId": "u42",
                                  "sessionId": "s99",
                                  "method": "POST",
                                  "url": "https://example.com/v1/chat/completions"
                                }
                                """))
                .andExpect(status().isCreated());

        assertThat(repository.count()).isEqualTo(1);
        var row = repository.findAll().get(0);
        assertThat(row.getCorrelationId()).isEqualTo("corr-test");
        assertThat(row.getUserId()).isEqualTo("u42");
        assertThat(row.getSessionId()).isEqualTo("s99");
        assertThat(row.getDirection()).isEqualTo("request");
        assertThat(row.getRecordedAt()).isNotNull();
        assertThat(row.getPayloadJson()).contains("corr-test");
    }
}
