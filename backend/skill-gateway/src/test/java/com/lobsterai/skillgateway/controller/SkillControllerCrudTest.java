package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.entity.Skill;
import com.lobsterai.skillgateway.repository.SkillRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:skill_crud_test;DB_CLOSE_DELAY=-1;MODE=LEGACY",
        "spring.datasource.driverClassName=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=password",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=always",
        "spring.jpa.defer-datasource-initialization=true"
})
@AutoConfigureMockMvc
class SkillControllerCrudTest {

    private static final String TOKEN = "your-secure-token-here";
    private static final String TEST_SKILL_PREFIX = "crud-test-skill-";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SkillRepository skillRepository;

    @AfterEach
    void cleanup() {
        skillRepository.findAll().stream()
                .filter(skill -> skill.getName() != null && skill.getName().startsWith(TEST_SKILL_PREFIX))
                .forEach(skillRepository::delete);
    }

    @Test
    void getAllSkills_returnsSeededSkills() throws Exception {
        mockMvc.perform(get("/api/skills"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(greaterThanOrEqualTo(4)))
                .andExpect(jsonPath("$[*].name").value(hasItem("获取时间")))
                .andExpect(jsonPath("$[*].name").value(hasItem("服务器资源状态")))
                .andExpect(jsonPath("$[*].name").value(hasItem("查询距离生日还有几天")))
                .andExpect(jsonPath("$[?(@.name=='获取时间')].executionMode").value(hasItem("CONFIG")))
                .andExpect(jsonPath("$[?(@.name=='查询距离生日还有几天')].executionMode").value(hasItem("OPENCLAW")));
    }

    @Test
    void createUpdateDeleteSkill_roundTrip() throws Exception {
        String skillName = TEST_SKILL_PREFIX + System.nanoTime();
        String createBody = """
                {
                  "name": "%s",
                  "description": "Created by CRUD integration test",
                  "type": "EXTENSION",
                  "executionMode": "CONFIG",
                  "configuration": "{\\"kind\\":\\"api\\",\\"preset\\":\\"current-time\\",\\"operation\\":\\"current-time\\",\\"method\\":\\"GET\\",\\"endpoint\\":\\"https://example.com/time\\"}",
                  "enabled": true,
                  "requiresConfirmation": false
                }
                """.formatted(skillName);

        mockMvc.perform(post("/api/skills")
                        .header("X-Agent-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value(skillName))
                .andExpect(jsonPath("$.executionMode").value("CONFIG"))
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.requiresConfirmation").value(false));

        Skill createdSkill = skillRepository.findByName(skillName)
                .orElseThrow(() -> new IllegalStateException("Created skill not found"));

        String updateBody = """
                {
                  "name": "%s",
                  "description": "Updated by CRUD integration test",
                  "type": "EXTENSION",
                  "executionMode": "OPENCLAW",
                  "configuration": "{\\"kind\\":\\"openclaw\\",\\"systemPrompt\\":\\"## Planner: use tools carefully\\",\\"allowedTools\\":[\\"compute\\",\\"获取时间\\"],\\"orchestration\\":{\\"mode\\":\\"serial\\"}}",
                  "enabled": false,
                  "requiresConfirmation": true
                }
                """.formatted(skillName);

        mockMvc.perform(put("/api/skills/{id}", createdSkill.getId())
                        .header("X-Agent-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.description").value("Updated by CRUD integration test"))
                .andExpect(jsonPath("$.executionMode").value("OPENCLAW"))
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.requiresConfirmation").value(true));

        mockMvc.perform(delete("/api/skills/{id}", createdSkill.getId())
                        .header("X-Agent-Token", TOKEN))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/skills/{id}", createdSkill.getId()))
                .andExpect(status().isNotFound());
    }

    @Test
    void createSkill_withoutAgentToken_succeedsForBrowserGatewayPath() throws Exception {
        String skillName = TEST_SKILL_PREFIX + "browser-" + System.nanoTime();
        String createBody = """
                {
                  "name": "%s",
                  "description": "Browser CRUD without X-Agent-Token",
                  "type": "EXTENSION",
                  "executionMode": "CONFIG",
                  "configuration": "{\\"kind\\":\\"api\\",\\"preset\\":\\"current-time\\",\\"operation\\":\\"current-time\\",\\"method\\":\\"GET\\",\\"endpoint\\":\\"https://example.com/time\\"}",
                  "enabled": true,
                  "requiresConfirmation": false
                }
                """.formatted(skillName);

        mockMvc.perform(post("/api/skills")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value(skillName));
    }

    @Test
    void createSkill_defaultsExecutionModeToConfigWhenMissing() throws Exception {
        String skillName = TEST_SKILL_PREFIX + "default-" + System.nanoTime();
        String createBody = """
                {
                  "name": "%s",
                  "description": "Defaults execution mode",
                  "type": "EXTENSION",
                  "configuration": "{\\"kind\\":\\"api\\",\\"preset\\":\\"current-time\\",\\"operation\\":\\"current-time\\",\\"method\\":\\"GET\\",\\"endpoint\\":\\"https://example.com/time\\"}",
                  "enabled": true,
                  "requiresConfirmation": false
                }
                """.formatted(skillName);

        mockMvc.perform(post("/api/skills")
                        .header("X-Agent-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.executionMode").value("CONFIG"));
    }

    @Test
    void createSkill_rejectsExecutionModeAndConfigurationMismatch() throws Exception {
        String skillName = TEST_SKILL_PREFIX + "invalid-" + System.nanoTime();
        String createBody = """
                {
                  "name": "%s",
                  "description": "Invalid openclaw payload",
                  "type": "EXTENSION",
                  "executionMode": "OPENCLAW",
                  "configuration": "{\\"kind\\":\\"monitor\\",\\"operation\\":\\"server-resource-status\\",\\"lookup\\":\\"server_lookup\\",\\"executor\\":\\"ssh_executor\\",\\"command\\":\\"uptime\\"}",
                  "enabled": true,
                  "requiresConfirmation": false
                }
                """.formatted(skillName);

        mockMvc.perform(post("/api/skills")
                        .header("X-Agent-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("OPENCLAW executionMode requires kind=openclaw"));
    }

    @Test
    void createSkill_allowsOpenclawWithoutAllowedTools() throws Exception {
        String skillName = TEST_SKILL_PREFIX + "prompt-only-" + System.nanoTime();
        String createBody = """
                {
                  "name": "%s",
                  "description": "Prompt only openclaw",
                  "type": "EXTENSION",
                  "executionMode": "OPENCLAW",
                  "configuration": "{\\"kind\\":\\"openclaw\\",\\"systemPrompt\\":\\"# Prompt only\\",\\"allowedTools\\":[],\\"orchestration\\":{\\"mode\\":\\"serial\\"}}",
                  "enabled": true,
                  "requiresConfirmation": false
                }
                """.formatted(skillName);

        mockMvc.perform(post("/api/skills")
                        .header("X-Agent-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.executionMode").value("OPENCLAW"))
                .andExpect(jsonPath("$.configuration").value("{\"kind\":\"openclaw\",\"systemPrompt\":\"# Prompt only\",\"allowedTools\":[],\"orchestration\":{\"mode\":\"serial\"}}"));
    }

    @Test
    void createSkill_legacyTimeKindIsNormalizedToCanonicalApiKind() throws Exception {
        String skillName = TEST_SKILL_PREFIX + "legacy-time-" + System.nanoTime();
        String createBody = """
                {
                  "name": "%s",
                  "description": "Legacy time config",
                  "type": "EXTENSION",
                  "executionMode": "CONFIG",
                  "configuration": "{\\"kind\\":\\"time\\",\\"operation\\":\\"current-time\\",\\"method\\":\\"GET\\",\\"endpoint\\":\\"https://example.com/time\\"}",
                  "enabled": true,
                  "requiresConfirmation": false
                }
                """.formatted(skillName);

        mockMvc.perform(post("/api/skills")
                        .header("X-Agent-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configuration").value("{\"kind\":\"api\",\"operation\":\"current-time\",\"method\":\"GET\",\"endpoint\":\"https://example.com/time\",\"preset\":\"current-time\"}"));
    }

    @Test
    void createSkill_acceptsCanonicalSshPresetConfig() throws Exception {
        String skillName = TEST_SKILL_PREFIX + "canonical-ssh-" + System.nanoTime();
        String createBody = """
                {
                  "name": "%s",
                  "description": "Canonical ssh config",
                  "type": "EXTENSION",
                  "executionMode": "CONFIG",
                  "configuration": "{\\"kind\\":\\"ssh\\",\\"preset\\":\\"server-resource-status\\",\\"operation\\":\\"server-resource-status\\",\\"lookup\\":\\"server_lookup\\",\\"executor\\":\\"ssh_executor\\",\\"command\\":\\"uptime\\",\\"readOnly\\":true}",
                  "enabled": true,
                  "requiresConfirmation": false
                }
                """.formatted(skillName);

        mockMvc.perform(post("/api/skills")
                        .header("X-Agent-Token", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configuration").value("{\"kind\":\"ssh\",\"preset\":\"server-resource-status\",\"operation\":\"server-resource-status\",\"lookup\":\"server_lookup\",\"executor\":\"ssh_executor\",\"command\":\"uptime\",\"readOnly\":true}"));
    }
}
