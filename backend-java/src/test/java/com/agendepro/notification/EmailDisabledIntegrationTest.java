package com.agendepro.notification;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.account.UserToken;
import com.agendepro.account.UserTokenRepository;
import com.agendepro.appointment.Appointment;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.client.ClientRepository;
import com.agendepro.professional.Professional;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.testsupport.TestFixtures;
import com.agendepro.user.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Com o e-mail desligado (o padrão) o Nimbo avisa só por WhatsApp: nada de e-mail na fila nem links de recuperação. */
@TestPropertySource(properties = "app.email.enabled=false")
class EmailDisabledIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private TestFixtures fixtures;
    @Autowired private AuthTestHelper authHelper;
    @Autowired private NotificationService notifications;
    @Autowired private NotificationOutboxRepository outbox;
    @Autowired private ClientRepository clientRepository;
    @Autowired private UserTokenRepository userTokens;

    @Test
    void theOutboxOnlyGetsWhatsappRows() {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Professional p = fixtures.professional(t);
        ServiceOffering s = fixtures.service(t, 40, 30);
        Client c = fixtures.client(t); // tem e-mail
        c.setPhone("(11) 99999-1234");
        clientRepository.save(c);
        Appointment a = fixtures.appointment(t, p, c, s, "2031-05-10", "10:00", "10:30");

        assertThat(notifications.clientReminder(a, t, c, NotificationService.Event.REMINDER_24H, "Lembrete")).isTrue();

        List<NotificationOutbox> rows = outbox.findByTenantIdOrderByCreatedAtAsc(t.getId());
        assertThat(rows).isNotEmpty();
        assertThat(rows).extracting(r -> r.getChannel().name()).doesNotContain("EMAIL").contains("WHATSAPP");
    }

    @Test
    void aClientWithOnlyAnEmailHasNothingToBeReminded() {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Professional p = fixtures.professional(t);
        ServiceOffering s = fixtures.service(t, 40, 30);
        Client c = fixtures.client(t); // só e-mail
        Appointment a = fixtures.appointment(t, p, c, s, "2031-05-11", "10:00", "10:30");

        assertThat(notifications.clientReminder(a, t, c, NotificationService.Event.REMINDER_24H, "Lembrete")).isFalse();
        assertThat(outbox.findByTenantIdOrderByCreatedAtAsc(t.getId())).isEmpty();
    }

    @Test
    void emailChangeIsUnavailable() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        fixtures.admin(t, "dono-" + t.getSlug() + "@example.com", "senha123");
        String token = authHelper.login(mockMvc, "dono-" + t.getSlug() + "@example.com", "senha123");

        mockMvc.perform(post("/api/auth/email-change").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"newEmail\":\"novo-" + t.getSlug() + "@example.com\",\"currentPassword\":\"senha123\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("EMAIL_DISABLED"));
    }

    @Test
    void forgotPasswordAnswersTheSameButCreatesNoToken() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        User owner = fixtures.admin(t, "esqueci-" + t.getSlug() + "@example.com", "senha123");

        mockMvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"esqueci-" + t.getSlug() + "@example.com\"}"))
                .andExpect(status().isOk());

        assertThat(userTokens.countByUserIdAndTypeAndCreatedAtAfter(owner.getId(), UserToken.PASSWORD_RESET, Instant.EPOCH)).isZero();
    }
}
