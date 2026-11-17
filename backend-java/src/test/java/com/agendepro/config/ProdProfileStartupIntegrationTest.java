package com.agendepro.config;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.ratelimit.RateLimitFilter;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.testsupport.TestFixtures;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Sobe a aplicação com o perfil `prod` (somado ao `test`, que só traz os limites altos): inicialização preguiçosa,
 * Hibernate sem acesso a metadados JDBC e sem `validate`, Swagger desligado. É o mais perto de produção que dá para
 * ter num teste, contra um PostgreSQL real.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("prod")
class ProdProfileStartupIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ConfigurableApplicationContext context;
    @Autowired
    private Environment env;
    @Autowired
    private TestFixtures fixtures;
    @Autowired
    private AuthTestHelper authHelper;
    @Autowired
    private Flyway flyway;
    @Autowired
    private FilterRegistrationBean<RateLimitFilter> rateLimitRegistration;

    // ─── /actuator/health ──────────────────────────────────────────────────────

    @Test
    void actuatorHealthIsPublicAndExposesOnlyTheStatus() throws Exception {
        mockMvc.perform(get("/actuator/health")) // sem Authorization
                .andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"UP\"}", true)); // modo estrito: nenhum campo a mais
    }

    @Test
    void legacyHealthKeepsWorking() throws Exception {
        mockMvc.perform(get("/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    void otherActuatorEndpointsAreNotExposed() throws Exception {
        for (String path : new String[]{"/actuator", "/actuator/env", "/actuator/beans", "/actuator/health/db"}) {
            int code = mockMvc.perform(get(path)).andReturn().getResponse().getStatus();
            assertThat(code).as(path).isBetween(400, 499);
        }
    }

    @Test
    void healthIsOutsideTheRateLimit() {
        // O filtro só é registrado para /api/*: /health e /actuator/health nunca passam por ele.
        assertThat(rateLimitRegistration.getUrlPatterns()).containsExactly("/api/*");
    }

    // ─── inicialização preguiçosa ──────────────────────────────────────────────

    @Test
    void lazyInitializationIsOnInProd() {
        assertThat(env.getProperty("spring.main.lazy-initialization", Boolean.class)).isTrue();
        DefaultListableBeanFactory bf = (DefaultListableBeanFactory) context.getBeanFactory();
        // Um controller que ninguém usou ainda não foi criado...
        assertThat(bf.containsSingleton("adminAppointmentController")).isFalse();
    }

    @Test
    void reminderSchedulerIsNeverLazy() {
        // ...mas o bean com @Scheduled TEM de existir desde a partida, senão os lembretes nunca disparam.
        DefaultListableBeanFactory bf = (DefaultListableBeanFactory) context.getBeanFactory();
        assertThat(bf.containsSingleton("reminderService")).isTrue();
        assertThat(context.getBean(com.agendepro.reminder.ReminderService.class)).isNotNull();
    }

    // ─── configuração de produção ──────────────────────────────────────────────

    @Test
    void prodSettingsAreApplied() {
        assertThat(env.getProperty("spring.jpa.open-in-view", Boolean.class)).isFalse();
        assertThat(env.getProperty("logging.level.com.agendepro")).isEqualTo("INFO");
        assertThat(env.getProperty("logging.level.com.agendepro.security.JwtAuthenticationFilter")).isEqualTo("INFO");
        assertThat(env.getProperty("logging.level.com.agendepro.ratelimit.RateLimitFilter")).isEqualTo("INFO");
        assertThat(env.getProperty("spring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access", Boolean.class)).isFalse();
        assertThat(env.getProperty("springdoc.swagger-ui.enabled", Boolean.class)).isFalse();
    }

    @Test
    void swaggerIsOffInProd() throws Exception {
        int code = mockMvc.perform(get("/v3/api-docs")).andReturn().getResponse().getStatus();
        assertThat(code).isBetween(400, 499);
    }

    @Test
    void flywayRunsMigrationsButDoesNotValidateChecksumsOnStartup() {
        assertThat(flyway.getConfiguration().isValidateOnMigrate()).isFalse();
        assertThat(flyway.info().applied()).isNotEmpty(); // as migrations rodaram
        assertThat(flyway.info().pending()).isEmpty();
    }

    // ─── o banco funciona sem acesso a metadados e sem `validate` ──────────────

    @Test
    void persistenceWorksWithMetadataAccessOffIncludingArrayColumns() throws Exception {
        Tenant tenant = fixtures.tenant(TenantPlan.PRO);
        String email = "admin-" + UUID.randomUUID() + "@x.com";
        fixtures.admin(tenant, email, "senha123");
        String jwt = authHelper.login(mockMvc, email, "senha123");

        mockMvc.perform(post("/api/admin/professionals").header("Authorization", "Bearer " + jwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Marina Souza\",\"workingDays\":[1,3,5]}"))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/admin/professionals").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].name").value("Marina Souza"))
                .andExpect(jsonPath("$.data[0].workingDays.length()").value(3)); // coluna integer[]
    }
}
