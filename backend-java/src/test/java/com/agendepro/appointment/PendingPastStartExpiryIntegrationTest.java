package com.agendepro.appointment;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.professional.Professional;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pendente cujo horário já passou (mais a folga de 15 min) é cancelado. date/start_time são texto no horário de
 * Brasília; o corte é calculado no Java. Usa um "agora" fixo em 2015 para não mexer em dados de outros testes.
 */
class PendingPastStartExpiryIntegrationTest extends AbstractIntegrationTest {

    @Autowired private PendingExpiryService service;
    @Autowired private AppointmentRepository appointmentRepository;
    @Autowired private TestFixtures fixtures;

    private Tenant tenant;
    private Professional professional;
    private ServiceOffering svc;
    private Client client;

    private void setUp() {
        tenant = fixtures.tenant(TenantPlan.BASIC);
        professional = fixtures.professional(tenant);
        svc = fixtures.service(tenant, 40.0, 30);
        client = fixtures.client(tenant);
    }

    private Appointment appt(String date, String start, AppointmentStatus status) {
        Appointment a = fixtures.appointment(tenant, professional, client, svc, date, start, "23:59");
        a.setStatus(status);
        return appointmentRepository.save(a);
    }

    private AppointmentStatus statusOf(Appointment a) {
        return appointmentRepository.findById(a.getId()).orElseThrow().getStatus();
    }

    @Test
    void cancelsPendingThatStartedMoreThanFifteenMinutesAgo_keepsTheRest() {
        setUp();
        Instant now = Instant.parse("2015-06-10T15:00:00Z"); // 12:00 em Brasília (UTC-3)
        Appointment old = appt("2015-06-10", "11:30", AppointmentStatus.PENDING);        // 30 min atrás
        Appointment justOver = appt("2015-06-10", "11:44", AppointmentStatus.PENDING);   // 16 min atrás
        Appointment inGrace = appt("2015-06-10", "11:50", AppointmentStatus.PENDING);    // 10 min atrás: dentro da folga
        Appointment future = appt("2015-06-10", "12:30", AppointmentStatus.PENDING);
        Appointment confirmed = appt("2015-06-10", "08:00", AppointmentStatus.CONFIRMED);
        Appointment completed = appt("2015-06-09", "08:00", AppointmentStatus.COMPLETED);
        Appointment yesterday = appt("2015-06-09", "18:00", AppointmentStatus.PENDING);

        service.expirePastStart(now);

        assertThat(statusOf(old)).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(statusOf(justOver)).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(statusOf(yesterday)).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(statusOf(inGrace)).isEqualTo(AppointmentStatus.PENDING);
        assertThat(statusOf(future)).isEqualTo(AppointmentStatus.PENDING);
        assertThat(statusOf(confirmed)).isEqualTo(AppointmentStatus.CONFIRMED);
        assertThat(statusOf(completed)).isEqualTo(AppointmentStatus.COMPLETED);
    }

    @Test
    void alsoCancelsPendingTheClientAlreadyConfirmed_withoutDeadline() {
        setUp();
        Appointment a = appt("2015-06-09", "10:00", AppointmentStatus.PENDING);
        a.setClientConfirmedAt(Instant.parse("2015-06-08T10:00:00Z"));
        a.setConfirmBy(null);
        appointmentRepository.save(a);

        int n = service.expirePastStart(Instant.parse("2015-06-10T15:00:00Z"));

        assertThat(n).isGreaterThanOrEqualTo(1);
        assertThat(statusOf(a)).isEqualTo(AppointmentStatus.CANCELLED);
    }

    @Test
    void midnightEdge_cutoffCrossesToThePreviousDay() {
        setUp();
        Instant now = Instant.parse("2015-06-10T03:10:00Z"); // 00:10 de 10/06 em Brasília; corte = 23:55 de 09/06
        Appointment before = appt("2015-06-09", "23:50", AppointmentStatus.PENDING);   // 20 min atrás -> cancela
        Appointment inGrace = appt("2015-06-09", "23:56", AppointmentStatus.PENDING);  // 14 min atrás -> fica
        Appointment justNow = appt("2015-06-10", "00:00", AppointmentStatus.PENDING);  // 10 min atrás -> fica

        service.expirePastStart(now);

        assertThat(statusOf(before)).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(statusOf(inGrace)).isEqualTo(AppointmentStatus.PENDING);
        assertThat(statusOf(justNow)).isEqualTo(AppointmentStatus.PENDING);
    }

    @Test
    void timeZoneEdge_utcAlreadyNextDayButBrasiliaStillOnThePreviousOne() {
        setUp();
        Instant now = Instant.parse("2015-06-10T02:00:00Z"); // já é dia 10 em UTC, mas 23:00 de 09/06 em Brasília
        Appointment tonightLater = appt("2015-06-10", "00:30", AppointmentStatus.PENDING); // ainda no futuro em Brasília
        Appointment tonight = appt("2015-06-09", "22:30", AppointmentStatus.PENDING);      // 30 min atrás
        Appointment tonightInGrace = appt("2015-06-09", "22:50", AppointmentStatus.PENDING);

        service.expirePastStart(now);

        assertThat(statusOf(tonightLater)).isEqualTo(AppointmentStatus.PENDING);
        assertThat(statusOf(tonight)).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(statusOf(tonightInGrace)).isEqualTo(AppointmentStatus.PENDING);
    }

    @Test
    void scheduledJobRunsWithoutError() {
        service.expireOnSchedule(); // desligado nos testes (app.pending.expiry-enabled=false): só garante que não quebra
        assertThat(service.expirePastStart(Instant.parse("2015-06-10T15:00:00Z"))).isGreaterThanOrEqualTo(0);
    }
}
