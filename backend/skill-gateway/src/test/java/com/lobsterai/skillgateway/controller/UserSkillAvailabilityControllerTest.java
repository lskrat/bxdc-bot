package com.lobsterai.skillgateway.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lobsterai.skillgateway.entity.User;
import com.lobsterai.skillgateway.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:user_skill_avail_test;DB_CLOSE_DELAY=-1;MODE=LEGACY",
        "spring.datasource.driverClassName=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=password",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=always",
        "spring.jpa.defer-datasource-initialization=true"
})
@AutoConfigureMockMvc
class UserSkillAvailabilityControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void getSkillAvailability_unknownUser_returns404() throws Exception {
        mockMvc.perform(get("/api/user/999999/skill-availability"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getAndPutSkillAvailability_roundTrip() throws Exception {
        String uid = "887766";
        User u = new User();
        u.setId(uid);
        u.setNickname("t");
        u.setAvatar("👤");
        u.setCreatedAt(LocalDateTime.now());
        userRepository.save(u);

        mockMvc.perform(get("/api/user/" + uid + "/skill-availability"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.disabledSkillIds").isArray())
                .andExpect(jsonPath("$.disabledSkillIds.length()").value(0))
                .andExpect(jsonPath("$.skills").isArray());

        String body = objectMapper.writeValueAsString(java.util.Map.of(
                "disabledSkillIds", java.util.List.of("1", "2")
        ));

        mockMvc.perform(put("/api/user/" + uid + "/skill-availability")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.disabledSkillIds.length()").value(2))
                .andExpect(jsonPath("$.disabledSkillIds[0]").value("1"));

        mockMvc.perform(get("/api/user/" + uid + "/skill-availability"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.disabledSkillIds[1]").value("2"));
    }
}
