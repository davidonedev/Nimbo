package com.agendepro.config;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.user.UserRepository;
import com.agendepro.user.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** No perfil prod (inicialização preguiçosa) o runner também precisa rodar: é onde ele será usado. */
@ActiveProfiles("prod")
@TestPropertySource(properties = {
        "app.bootstrap.super-admin.email=prod.bootstrap@exemplo.com",
        "app.bootstrap.super-admin.password=senha-prod-de-teste-1"
})
class SuperAdminBootstrapProdProfileTest extends AbstractIntegrationTest {

    @Autowired private UserRepository userRepository;

    @Test
    void theSuperAdminIsCreatedOnStartupWithTheProdProfile() {
        var user = userRepository.findByEmail("prod.bootstrap@exemplo.com").orElseThrow();
        assertThat(user.getRole()).isEqualTo(UserRole.SUPER_ADMIN);
    }
}
