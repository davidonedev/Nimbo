package com.agendepro.config;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.TestFixtures;
import com.agendepro.user.User;
import com.agendepro.user.UserRepository;
import com.agendepro.user.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@TestPropertySource(properties = {
        "app.bootstrap.super-admin.email=  Dono.Plataforma@Exemplo.com ",
        "app.bootstrap.super-admin.password=senha-longa-de-teste-1"
})
class SuperAdminBootstrapIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private TestFixtures fixtures;

    private SuperAdminBootstrap bootstrap(String email, String password) {
        SuperAdminBootstrap b = new SuperAdminBootstrap(userRepository, passwordEncoder);
        ReflectionTestUtils.setField(b, "email", email);
        ReflectionTestUtils.setField(b, "password", password);
        ReflectionTestUtils.setField(b, "name", "Super Admin");
        return b;
    }

    @Test
    void onStartup_theConfiguredSuperAdminIsCreatedAndCanLogIn() throws Exception {
        User user = userRepository.findByEmail("dono.plataforma@exemplo.com").orElseThrow();
        assertThat(user.getRole()).isEqualTo(UserRole.SUPER_ADMIN);
        assertThat(user.getTenantId()).isNull();
        assertThat(user.getPasswordHash()).isNotEqualTo("senha-longa-de-teste-1").startsWith("$2");

        mockMvc.perform(post("/api/auth/login").contentType("application/json")
                        .content("{\"email\":\"dono.plataforma@exemplo.com\",\"password\":\"senha-longa-de-teste-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.role").value("super_admin"))
                .andExpect(jsonPath("$.data.token").isNotEmpty());
    }

    @Test
    void runningAgain_doesNotDuplicateOrChangeThePassword() {
        String hashBefore = userRepository.findByEmail("dono.plataforma@exemplo.com").orElseThrow().getPasswordHash();

        bootstrap("dono.plataforma@exemplo.com", "outra-senha-diferente-9").run();

        assertThat(userRepository.findByEmail("dono.plataforma@exemplo.com").orElseThrow().getPasswordHash()).isEqualTo(hashBefore);
    }

    @Test
    void anExistingNonSuperAdminWithThatEmail_isNeverChanged() {
        Tenant tenant = fixtures.tenant(TenantPlan.BASIC);
        fixtures.admin(tenant, "dono.de.loja@exemplo.com", "senha-da-loja-123");
        User before = userRepository.findByEmail("dono.de.loja@exemplo.com").orElseThrow();

        bootstrap("dono.de.loja@exemplo.com", "tentativa-de-tomar-conta-1").run();

        User after = userRepository.findByEmail("dono.de.loja@exemplo.com").orElseThrow();
        assertThat(after.getRole()).isEqualTo(UserRole.TENANT_ADMIN);
        assertThat(after.getPasswordHash()).isEqualTo(before.getPasswordHash());
    }

    @Test
    void weakPasswordInvalidEmailOrMissingValues_createNothing() {
        bootstrap("curta@exemplo.com", "123456789").run();          // 9 caracteres
        bootstrap("sem-arroba", "senha-longa-de-teste-1").run();
        bootstrap("so-email@exemplo.com", "").run();
        bootstrap("", "senha-longa-de-teste-1").run();
        bootstrap("", "").run();

        assertThat(userRepository.existsByEmail("curta@exemplo.com")).isFalse();
        assertThat(userRepository.existsByEmail("sem-arroba")).isFalse();
        assertThat(userRepository.existsByEmail("so-email@exemplo.com")).isFalse();
    }
}
