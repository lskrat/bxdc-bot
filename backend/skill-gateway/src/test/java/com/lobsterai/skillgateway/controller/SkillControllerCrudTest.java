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
                .andExpect(jsonPath("$.length()").value(greaterThanOrEqualTo(2)))
                .andExpect(jsonPath("$[*].name").value(hasItem("获取时间")))
                .andExpect(jsonPath("$[*].name").value(hasItem("服务器资源状态")));
    }

    @Test
    void createUpdateDeleteSkill_roundTrip() throws Exception {
        String skillName = TEST_SKILL_PREFIX + System.nanoTime();
        String createBody = """
                {
                  "name": "%s",
                  "description": "Created by CRUD integration test",
                  "type": "EXTENSION",
                  "configuration": "{\\"kind\\":\\"time\\",\\"operation\\":\\"current-time\\"}",
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
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.requiresConfirmation").value(false));

        Skill createdSkill = skillRepository.findByName(skillName)
                .orElseThrow(() -> new IllegalStateException("Created skill not found"));

        String updateBody = """
                {
                  "name": "%s",
                  "description": "Updated by CRUD integration test",
                  "type": "EXTENSION",
                  "configuration": "{\\"kind\\":\\"monitor\\",\\"operation\\":\\"server-resource-status\\"}",
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
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.requiresConfirmation").value(true));

        mockMvc.perform(delete("/api/skills/{id}", createdSkill.getId())
                        .header("X-Agent-Token", TOKEN))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/skills/{id}", createdSkill.getId()))
                .andExpect(status().isNotFound());
    }
}
