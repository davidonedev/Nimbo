package com.agendepro.appointment;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.common.AppException;
import com.agendepro.professional.Professional;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.testsupport.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Admin/profissional não podem criar agendamento em data+hora que já passou (America/Sao_Paulo). */
class AdminAppointmentPastDateIntegrationTest extends AbstractIntegrationTest {

    private static final ZoneId SP = ZoneId.of("America/Sao_Paulo");
    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");

    @Autowired private MockMvc mockMvc;
    @Autowired private TestFixtures fixtures;
    @Autowired private AuthTestHelper authTestHelper;

    private Tenant tenant;
    private Professional professional;
    private ServiceOffering service;
    private String token;

    private void setUp() throws Exception {
        tenant = fixtures.tenant(TenantPlan.PRO);
        String email = "adm-" + UUID.randomUUID() + "@example.com";
        fixtures.admin(tenant, email, "senha123");
        professional = fixtures.professional(tenant);
        service = fixtures.service(tenant, 30.0, 30);
        token = authTestHelper.login(mockMvc, email, "senha123");
    }

    private ResultActions create(LocalDateTime when) throws Exception {
        String body = """
                {"professionalId":"%s","serviceId":"%s","date":"%s","startTime":"%s",
                 "clientName":"Cliente Teste","clientPhone":"(11) 98765-4321","clientEmail":"c-%s@example.com"}
                """.formatted(professional.getId(), service.getId(), when.toLocalDate(), when.format(HHMM), UUID.randomUUID());
        return mockMvc.perform(post("/api/admin/appointments").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void yesterdayIsRejected() throws Exception {
        setUp();
        create(LocalDateTime.now(SP).minusDays(1)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_DATE"));
    }

    @Test
    void anHourAgoIsRejected_evenIfTodayOrAcrossMidnight() throws Exception {
        setUp();
        create(LocalDateTime.now(SP).minusHours(1)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_DATE"));
    }

    @Test
    void laterTodayAndFutureDaysAreStillAccepted() throws Exception {
        setUp();
        create(LocalDateTime.now(SP).plusMinutes(30)).andExpect(status().isCreated());
        create(LocalDateTime.now(SP).plusDays(3)).andExpect(status().isCreated());
    }

    @Test
    void helperBoundaryIsTheCurrentMinute() {
        LocalDateTime now = LocalDateTime.now(SP);
        // o minuto em curso ainda vale (pode virar o minuto durante o teste, então usa folga de 2 min no passado)
        AppointmentService.requireNotInThePast(now.plusMinutes(2).toLocalDate().toString(), now.plusMinutes(2).format(HHMM));
        assertThatThrownBy(() -> AppointmentService.requireNotInThePast(now.minusMinutes(2).toLocalDate().toString(), now.minusMinutes(2).format(HHMM)))
                .isInstanceOf(AppException.class)
                .satisfies(e -> assertThat(((AppException) e).getCode()).isEqualTo("INVALID_DATE"));
        assertThatThrownBy(() -> AppointmentService.requireNotInThePast("2026-13-45", "10:00"))
                .isInstanceOf(AppException.class).hasMessageContaining("inválido");
    }
}
