package com.agendepro.config;

import com.agendepro.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** O monitor externo precisa de um endereço que fique vermelho quando o banco não responde. */
class HealthDeepIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;

    @Test
    void deepHealthChecksTheDatabaseAndIsPublic() throws Exception {
        mockMvc.perform(get("/health/deep")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok")).andExpect(jsonPath("$.database").value("ok"));
    }

    @Test
    void plainHealthStillAnswersWithoutTouchingTheDatabase() throws Exception {
        mockMvc.perform(get("/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ok"));
    }
}
