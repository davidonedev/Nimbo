package com.agendepro.appointment;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.notification.EmailService;
import com.agendepro.professional.Professional;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.TestFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

/**
 * Aviso ao dono (e-mail) de agendamento que o cliente já confirmou pelo WhatsApp e ele ainda não: 2 h antes e,
 * se continuar pendente, 1 h antes.
 */
class OwnerPendingReminderIntegrationTest extends AbstractIntegrationTest {

    private static final ZoneId SP = ZoneId.of("America/Sao_Paulo");

    @Autowired private OwnerPendingReminderService service;
    @Autowired private AppointmentRepository appointmentRepository;
    @Autowired private TestFixtures fixtures;
    @Autowired private org.thymeleaf.TemplateEngine templateEngine;

    private record Ctx(Tenant tenant, Professional professional, ServiceOffering svc) {
    }

    @BeforeEach
    void resetMock() {
        Mockito.reset(emailService);
    }

    private Ctx ctx() {
        Tenant t = fixtures.tenant(TenantPlan.BASIC);
        return new Ctx(t, fixtures.professional(t), fixtures.service(t, 40.0, 30));
    }

    /** Agendamento que começa daqui a {@code minutes} minutos. {@code clientConfirmed}: o cliente já tocou no botão. */
    private Appointment appt(Ctx c, int minutes, AppointmentStatus status, boolean clientConfirmed) {
        Client client = fixtures.client(c.tenant);
        LocalDateTime start = LocalDateTime.now(SP).plusMinutes(minutes).withSecond(0).withNano(0);
        return appointmentRepository.save(Appointment.builder()
                .tenantId(c.tenant.getId()).clientId(client.getId()).professionalId(c.professional.getId()).serviceId(c.svc.getId())
                .date(start.toLocalDate().toString()).startTime(start.format(DateTimeFormatter.ofPattern("HH:mm")))
                .endTime(start.plusMinutes(30).format(DateTimeFormatter.ofPattern("HH:mm")))
                .price(40.0).status(status).clientConfirmedAt(clientConfirmed ? Instant.now().minusSeconds(600) : null).build());
    }

    private void moveTo(Appointment a, int minutesFromNow) {
        LocalDateTime start = LocalDateTime.now(SP).plusMinutes(minutesFromNow).withSecond(0).withNano(0);
        a.setDate(start.toLocalDate().toString());
        a.setStartTime(start.format(DateTimeFormatter.ofPattern("HH:mm")));
        appointmentRepository.save(a);
    }

    private List<EmailService.OwnerReminderItem> verifySent(Tenant t, String timeLeft) {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<EmailService.OwnerReminderItem>> items = ArgumentCaptor.forClass(List.class);
        Mockito.verify(emailService).sendOwnerPendingReminder(eq(t.getEmail()), eq(t.getName()), eq(timeLeft), items.capture(), any());
        return items.getValue();
    }

    private void verifyNothingSent() {
        Mockito.verify(emailService, Mockito.never()).sendOwnerPendingReminder(any(), any(), any(), any(), any());
    }

    @Test
    void warnsTwoHoursBeforeAndAgainOneHourBeforeIfStillPending() {
        Ctx c = ctx();
        Appointment a = appt(c, 100, AppointmentStatus.PENDING, true);

        assertThat(service.run(Instant.now())).isEqualTo(1);
        assertThat(verifySent(c.tenant, "2 horas")).hasSize(1);
        assertThat(appointmentRepository.findById(a.getId()).orElseThrow().getOwnerRemind2hAt()).isNotNull();

        // a mesma rodada de novo não repete
        Mockito.reset(emailService);
        assertThat(service.run(Instant.now())).isZero();
        verifyNothingSent();

        // 1 hora antes, continua pendente: avisa de novo
        moveTo(a, 50);
        assertThat(service.run(Instant.now())).isEqualTo(1);
        assertThat(verifySent(c.tenant, "1 hora")).hasSize(1);

        // e não avisa mais
        Mockito.reset(emailService);
        assertThat(service.run(Instant.now())).isZero();
        verifyNothingSent();
    }

    @Test
    void ifTheOwnerConfirmsAfterTheFirstWarningThereIsNoSecondOne() {
        Ctx c = ctx();
        Appointment a = appt(c, 100, AppointmentStatus.PENDING, true);
        service.run(Instant.now());
        Mockito.reset(emailService);

        a = appointmentRepository.findById(a.getId()).orElseThrow();
        a.setStatus(AppointmentStatus.CONFIRMED);
        appointmentRepository.save(a);
        moveTo(a, 50);

        assertThat(service.run(Instant.now())).isZero();
        verifyNothingSent();
    }

    @Test
    void whenTheClientConfirmedLateOnlyTheOneHourWarningGoesOut() {
        Ctx c = ctx();
        Appointment a = appt(c, 40, AppointmentStatus.PENDING, true);

        assertThat(service.run(Instant.now())).isEqualTo(1);
        verifySent(c.tenant, "1 hora");
        var saved = appointmentRepository.findById(a.getId()).orElseThrow();
        assertThat(saved.getOwnerRemind1hAt()).isNotNull();
        assertThat(saved.getOwnerRemind2hAt()).isNotNull(); // o de 2 h não sai depois do de 1 h

        Mockito.reset(emailService);
        assertThat(service.run(Instant.now())).isZero();
        verifyNothingSent();
    }

    @Test
    void doesNotWarnForAppointmentsThatAreNotWaitingForTheOwner() {
        Ctx c = ctx();
        appt(c, 100, AppointmentStatus.CONFIRMED, true);   // já confirmado
        appt(c, 100, AppointmentStatus.CANCELLED, true);   // cancelado
        appt(c, 100, AppointmentStatus.PENDING, false);    // o cliente ainda não confirmou: expira sozinho
        appt(c, 200, AppointmentStatus.PENDING, true);     // ainda longe (mais de 2 h)
        appt(c, -10, AppointmentStatus.PENDING, true);     // já começou

        assertThat(service.run(Instant.now())).isZero();
        verifyNothingSent();
    }

    @Test
    void groupsAppointmentsOfTheSameOwnerInOneEmail() {
        Ctx c = ctx();
        appt(c, 100, AppointmentStatus.PENDING, true);
        appt(c, 110, AppointmentStatus.PENDING, true);
        Ctx other = ctx();
        appt(other, 100, AppointmentStatus.PENDING, true);

        assertThat(service.run(Instant.now())).isEqualTo(3);
        assertThat(verifySent(c.tenant, "2 horas")).hasSize(2);
        assertThat(verifySent(other.tenant, "2 horas")).hasSize(1);
        Mockito.verify(emailService, Mockito.times(2)).sendOwnerPendingReminder(any(), any(), any(), any(), any());
    }

    @Test
    void theEmailTemplateRendersTheAppointmentsAndTheLink() {
        var ctx = new org.thymeleaf.context.Context();
        ctx.setVariable("tenantName", "Barbearia Vip");
        ctx.setVariable("timeLeft", "2 horas");
        ctx.setVariable("items", List.of(new EmailService.OwnerReminderItem("Maria Souza", "(19) 98179-4567", "Corte masculino", "hoje às 16:00")));
        ctx.setVariable("panelUrl", "https://app.exemplo.com/admin/appointments");

        String html = templateEngine.process("email/owner-pending-reminder", ctx);
        assertThat(html).contains("Maria Souza", "(19) 98179-4567", "Corte masculino", "hoje às 16:00", "2 horas", "Barbearia Vip",
                "https://app.exemplo.com/admin/appointments").doesNotContain("${");
    }
}
