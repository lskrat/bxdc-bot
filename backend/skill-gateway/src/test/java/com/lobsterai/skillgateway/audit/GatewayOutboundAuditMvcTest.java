package com.lobsterai.skillgateway.audit;

import com.lobsterai.skillgateway.entity.GatewayOutboundAuditLog;
import com.lobsterai.skillgateway.repository.GatewayOutboundAuditLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:gw_out_audit_test;DB_CLOSE_DELAY=-1;MODE=LEGACY",
        "spring.datasource.driverClassName=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=password",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=never",
        "spring.jpa.defer-datasource-initialization=false"
})
@AutoConfigureMockMvc
class GatewayOutboundAuditMvcTest {

    private static final String TOKEN = "your-secure-token-here";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private GatewayOutboundAuditLogRepository outboundAuditLogRepository;

    @BeforeEach
    void clean() {
        outboundAuditLogRepository.deleteAll();
    }

    @Test
    void postSkillApi_persistsOutboundAuditWithRawOriginBody() throws Exception {
        String requestJson = """
                {"url":"http://127.0.0.1:1/nope","method":"GET","headers":{}}
                """;
        mockMvc.perform(post("/api/skills/api")
                        .header("X-Agent-Token", TOKEN)
                        .header("X-User-Id", "audit-user-1")
                        .header(SkillIngressCaptureFilter.HEADER_CORRELATION_ID, "corr-it-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestJson))
                .andExpect(status().is5xxServerError())
                .andExpect(header().string(SkillIngressCaptureFilter.HEADER_CORRELATION_ID, "corr-it-1"));

        List<GatewayOutboundAuditLog> rows = outboundAuditLogRepository.findAll();
        assertEquals(1, rows.size());
        GatewayOutboundAuditLog row = rows.get(0);
        assertEquals("corr-it-1", row.getCorrelationId());
        assertEquals("audit-user-1", row.getUserId());
        assertEquals("HTTP", row.getOutboundKind());
        assertEquals("FAILURE", row.getStatus());
        assertTrue(row.getDestination().contains("127.0.0.1:1"));
        assertTrue(row.getOutboundHeadersJson() != null && !row.getOutboundHeadersJson().isBlank());
        String origin = new String(row.getOriginBody(), StandardCharsets.UTF_8);
        assertTrue(origin.contains("127.0.0.1:1"), () -> "origin body: " + origin);
    }
}
